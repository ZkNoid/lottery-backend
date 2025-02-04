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
import { Ticket } from 'l1-lottery-contracts';

@Injectable()
export class DefaultBankService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultBankService.name);
  private isRunning = false;

  constructor(
    private readonly stateService: StateService,
    @InjectModel(DefaultBankData.name)
    private readonly defaultBankModel: Model<DefaultBankDocument>,
  ) {}

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
