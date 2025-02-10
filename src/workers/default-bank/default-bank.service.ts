import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Mina, PrivateKey, Field, fetchAccount, UInt32, UInt64 } from 'o1js';

import { StateService } from '../../state-service/state.service.js';
import {
  DefaultBankData,
  DefaultBankDocument,
} from '../schema/default-bank.schema.js';
import { NumberPacked, Ticket } from 'l1-lottery-contracts';
import {
  ClaimRequestData,
  MinaClaimRequestDocument,
} from '../schema/claim-request.schema.js';

@Injectable()
export class DefaultBankService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultBankService.name);
  private isRunning = false;

  constructor(
    private readonly stateService: StateService,
    @InjectModel(DefaultBankData.name)
    private readonly defaultBankModel: Model<DefaultBankDocument>,
    @InjectModel(ClaimRequestData.name)
    private readonly claimRequestModel: Model<MinaClaimRequestDocument>,
  ) {}

  async updateDefaultBanksClaims(currentRound: number) {
    try {
      // Get all records with round < currentRound and empty claimData
      const unclaimedTickets = await this.defaultBankModel.find({
        roundId: { $lt: currentRound },
        claimId: null,
      });

      const checkRound = (() => {
        let store: { [roundId: number]: boolean } = {};

        return async (roundId: number) => {
          if (store[roundId] == null) {
            const contract =
              this.stateService.state.plotteryManagers[roundId].contract;

            await fetchAccount({ publicKey: contract.address });

            const result =
              this.stateService.state.plotteryManagers[
                roundId
              ].contract.result.get();

            let isComplete = +result > 0;
            store[roundId] = isComplete;
          }

          return store[roundId];
        };
      })();

      for (const ticket of unclaimedTickets) {
        this.logger.debug('Updating claim info for ticket: ', ticket._id);

        if (!(await checkRound(ticket.roundId))) {
          this.logger.debug(`Round ${ticket.roundId} is not produced yet`);
          continue;
        }

        try {
          // Get ticket numbers
          const ticketNumbers = ticket.numbers;

          // Get winning numbers
          const plotteryContract =
            this.stateService.state.plotteryManagers[ticket.roundId].contract;
          const winningNumbers = NumberPacked.unpackToBigints(
            plotteryContract.result.get(),
          )
            .map((v) => Number(v))
            .slice(0, 6);

          // Check them
          let haveAnyRewards = ticketNumbers
            .map((v, i) => v == winningNumbers[i])
            .some((v) => v);

          if (!haveAnyRewards) {
            await this.defaultBankModel.updateOne(
              {
                _id: ticket._id,
              },
              {
                $set: {
                  claimId: 'No rewards',
                },
              },
            );

            continue;
          }

          // Get ticket Id
          const ticketId = this.stateService.boughtTickets[
            ticket.roundId
          ].findIndex((v) => {
            return (
              v.owner.toBase58() == ticket.account &&
              v.numbers.map((n) => n.toString()).join() ===
                ticket.numbers.join() &&
              +v.amount == ticket.amount
            );
          });

          if (ticketId == -1) {
            this.logger.error(`Can't find ticket in round`, ticket);
            continue;
          }

          // Check if it was claimed manually
          const existingClaim = await this.claimRequestModel.findOne({
            roundId: ticket.roundId,
            ticketId,
            userAddress: ticket.account,
          });

          let claimId;

          if (existingClaim) {
            claimId = existingClaim._id;
          } else {
            // Create request
            const claimRequest = new this.claimRequestModel({
              userAddress: ticket.account,
              roundId: ticket.roundId,
              ticketId,
              status: 'pending',
            });

            await claimRequest.save();
            claimId = claimRequest._id;
          }

          // Update defaultBank record
          await this.defaultBankModel.updateOne(
            {
              _id: ticket._id,
            },
            {
              $set: {
                claimId,
              },
            },
          );
        } catch (e) {
          this.logger.error(
            `Error during claiming ticket: `,
            ticket,
            String(e),
          );
        }
      }
    } catch (e) {
      this.logger.error(`Error during updateDefaultBanksClaims: `, String(e));
    }
  }

  async onApplicationBootstrap() {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('DefaultBankService: already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('DefaultBankService started.');

    const expectedTicketsAmount = process.env.DEFAULT_TICKETS_AMOUNT
      ? +process.env.DEFAULT_TICKETS_AMOUNT
      : 10;

    const ticketsBatch = process.env.DEFAULT_TICKETS_BATCH
      ? +process.env.DEFAULT_TICKETS_BATCH
      : 2;

    try {
      const currentRound = await this.stateService.getCurrentRound();

      this.updateDefaultBanksClaims(currentRound);

      const contract =
        this.stateService.state.plotteryManagers[currentRound].contract;

      const aggregateResult = await this.defaultBankModel.aggregate([
        { $match: { roundId: currentRound } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);

      const purchasedCount =
        aggregateResult.length > 0 ? aggregateResult[0].total : 0;

      this.logger.debug(
        `Current round: ${currentRound}, default tickets: ${purchasedCount}`,
      );

      if (purchasedCount < expectedTicketsAmount) {
        await this.stateService.transactionMutex.runExclusive(async () => {
          this.logger.log(
            `Need to buy ${ticketsBatch} default tickets for round ${currentRound}...`,
          );

          const senderKey = PrivateKey.fromBase58(process.env.DEFAULT_BANK_PK);
          const senderPublic = senderKey.toPublicKey();

          const randomNumbers = Array.from({ length: 6 }, () =>
            UInt32.from(Math.floor(Math.random() * 9 + 1)),
          );

          const ticket = new Ticket({
            numbers: randomNumbers,
            owner: senderPublic,
            amount: UInt64.from(ticketsBatch),
          });

          const tx = await Mina.transaction(
            {
              sender: senderPublic,
              fee: Number('0.01') * 1e9,
            },
            async () => {
              await contract.buyTicket(ticket);
            },
          );

          this.logger.debug('Proving transaction...');
          await tx.prove();
          const txResult = await tx.sign([senderKey]).send();

          const newDoc = new this.defaultBankModel({
            roundId: currentRound,
            account: senderPublic.toBase58(),
            tx: txResult.hash,
            amount: ticketsBatch,
            numbers: randomNumbers.map((num) => +num),
          });

          await newDoc.save();

          this.logger.log(`Transaction submitted. Hash: ${txResult.hash}`);
          this.logger.debug('Waiting for transaction inclusion...');
          await txResult.wait();
          this.logger.debug('Transaction included');
        });
      } else {
        this.logger.debug(
          `Round ${currentRound} has ${purchasedCount} default tickets; no additional purchase needed.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in DefaultBankService cron:', error.stack);
    } finally {
      this.isRunning = false;
    }
  }
}
