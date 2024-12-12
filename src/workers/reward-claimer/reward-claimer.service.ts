import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket } from 'l1-lottery-contracts';
import { Field, Mina, PrivateKey, PublicKey, UInt32, UInt64 } from 'o1js';
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

  findTicketId(
    roundId: number,
    owner: string,
    numbers: number[],
    amount: number,
    pos: number = 0, // If there are two similar ticket allows to pick one of those
  ): number {
    const contractSM =
      this.stateManager.state.plotteryManagers[roundId];

    const ticket = new Ticket({
      owner: PublicKey.fromBase58(owner),
      numbers: numbers.map((n) => UInt32.from(n)),
      amount: UInt64.from(amount),
    });

    for (
      let ticketId = 0;
      ticketId < contractSM.lastTicketInRound;
      ticketId++
    ) {
      if (
        contractSM.ticketMap
          .get(Field(ticketId))
          .equals(ticket.hash())
          .toBoolean()
      ) {
        if (pos == 0) {
          return ticketId;
        }
        pos--;
      }
    }

    return -1;
  }

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
            this.stateManager.state.plotteryManagers[
              pendingRequest.roundId
            ];

          if (
            !(await this.stateManager.checkPlotteryConsistency(
              pendingRequest.roundId,
            ))
          ) {
            this.logger.debug('Incosistent state. Refetch');
            await this.infoUpdater.updateInfoForRound(
              pendingRequest.roundId,
            );
          }
          const contract = contractSM.contract;

          this.logger.log(`Finding ticket for request ${pendingRequest}`);
          const ticketId = this.findTicketId(
            pendingRequest.roundId,
            pendingRequest.userAddress,
            pendingRequest.ticketNumbers,
            pendingRequest.ticketAmount,
            pendingRequest.pos ?? 0,
          );
          if (ticketId === -1) {
            throw new Error('Ticket not found');
          }

          const ticket = contractSM.roundTickets[ticketId];

          // #TODO remove round form getReward
          let rewardParams = await contractSM.getReward(
            pendingRequest.roundId,
            ticket,
          );

          let tx = await Mina.transaction(
            { sender: signerAccount, fee: Number('0.1') * 1e9 },
            async () => {
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
              { status: 'failed' },
            );
          } else {
            await this.claimRequestData.updateOne(
              { _id: pendingRequest._id },
              { numOfErrors: totalErrorAmount },
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
