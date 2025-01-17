import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket } from 'l1-lottery-contracts';
import {
  AccountUpdate,
  fetchAccount,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  UInt32,
  UInt64,
} from 'o1js';
import { StateService } from '../../state-service/state.service.js';
import { NetworkIds } from '../../constants/networks.js';
import { ClaimRequestData } from '../schema/claim-request.schema.js';
import { RoundInfoUpdaterService } from '../round-infos-updater/round-infos-updater.service.js';

const NUM_OF_ERRORS_TO_FAIL = 3;

@Injectable()
export class RewardClaimerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RewardClaimerService.name);
  private isRunning = false;

  constructor(
    private stateManager: StateService,
    private infoUpdater: RoundInfoUpdaterService,
    @InjectModel(ClaimRequestData.name)
    private claimRequestData: Model<ClaimRequestData>,
  ) {}
  async onApplicationBootstrap() {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }
    this.isRunning = true;

    try {
      const pendingRequest = await this.claimRequestData.findOne({
        status: 'pending',
      });

      if (!pendingRequest) {
        this.logger.debug('No pending request for claimer');
        return;
      }

      await this.stateManager.transactionMutex.runExclusive(async () => {
        try {
          this.logger.debug('Preparing transaction for claimer');
          const signer = PrivateKey.fromBase58(
            process.env.GIFT_CODES_TREASURY_PRIVATE,
          );
          const signerAccount = PublicKey.fromBase58(
            signer.toPublicKey().toBase58(),
          );

          const contractSM =
            this.stateManager.state.plotteryManagers[pendingRequest.roundId];

          if (
            !(await this.stateManager.checkPlotteryConsistency(
              pendingRequest.roundId,
            ))
          ) {
            this.logger.debug('Incosistent state. Refetch');
            await this.infoUpdater.updateInfoForRound(pendingRequest.roundId);
          }
          const contract = contractSM.contract;

          this.logger.log(`Finding ticket for request ${pendingRequest}`);
          const ticketId = pendingRequest.ticketId;

          const ticket = contractSM.roundTickets[ticketId];

          // #TODO remove round form getReward
          let rewardParams = await contractSM.getRewardByTicketId(ticketId);

          console.log('Claimming ticket', ticket);
          console.log(
            'Claimming ticket',
            ticket.numbers.map((x) => x.toString()),
          );
          console.log('Claimming ticket', ticket.amount.toString());

          const ownerInfo = await fetchAccount({ publicKey: ticket.owner });
          const isNewAccount = ownerInfo.account == undefined;

          let tx = await Mina.transaction(
            { sender: signerAccount, fee: Number('0.1') * 1e9 },
            async () => {
              if (isNewAccount) {
                AccountUpdate.fundNewAccount(signerAccount);
              }
              await contract.getReward(
                ticket,
                rewardParams.ticketWitness,
                rewardParams.nullifierWitness,
              );
            },
          );

          await tx.prove();
          const txResult = await tx.sign([signer]).send();
          this.logger.debug('Sent transaction: ', txResult.hash);
          await txResult.safeWait();
          this.logger.debug('Transaction included', txResult.hash);

          await this.claimRequestData.updateOne(
            { _id: pendingRequest._id },
            {
              status: 'fulfilled',
              tx: txResult.hash,
            },
          );
        } catch (e) {
          this.logger.error(
            `Failed to fulfill claim request for round ${pendingRequest.roundId}`,
            e.stack,
          );

          const totalErrorAmount = (pendingRequest.numOfErrors ?? 0) + 1;

          if (totalErrorAmount >= NUM_OF_ERRORS_TO_FAIL) {
            await this.claimRequestData.updateOne(
              { _id: pendingRequest._id },
              {
                $set: {
                  status: 'failed',
                },
                $push: {
                  reasons: e?.stack || '',
                },
              },
            );
          } else {
            await this.claimRequestData.updateOne(
              { _id: pendingRequest._id },
              {
                $set: {
                  numOfErrors: totalErrorAmount,
                },
                $push: {
                  reasons: e?.stack || '',
                },
              },
            );
          }
        }
      });
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    } finally {
      this.isRunning = false;
    }
  }
}
