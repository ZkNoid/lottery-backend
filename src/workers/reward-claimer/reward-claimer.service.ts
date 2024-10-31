import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GiftCodesRequestedData } from '../schema/gift-codes-requested.schema.js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';
import { PromoQueueData } from '../schema/promo-queue.schema.js';
import { Ticket } from 'l1-lottery-contracts';
import { Field, Mina, PrivateKey, PublicKey, UInt32, UInt64 } from 'o1js';
import { StateService } from '../../state-service/state.service.js';
import { NetworkIds } from '../../constants/networks.js';
import { ClaimRequestData } from '../schema/claim-request.schema.js';

@Injectable()
export class RewardClaimerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RewardClaimerService.name);
  private isRunning = false;

  // #TODO add check for multiple tickets with same numbers
  findTicketId(
    roundId: number,
    owner: string,
    numbers: number[],
    amount: number,
  ): number {
    const contractSM =
      this.stateManager.state[NetworkIds.MINA_DEVNET].plotteryManagers[roundId];

    for (
      let ticketId = 0;
      ticketId < contractSM.lastTicketInRound;
      ticketId++
    ) {
      const ticket = new Ticket({
        owner: PublicKey.fromBase58(owner),
        numbers: numbers.map((n) => UInt32.from(n)),
        amount: UInt64.from(amount),
      });

      if (
        contractSM.ticketMap
          .get(Field(ticketId))
          .equals(ticket.hash())
          .toBoolean()
      ) {
        return ticketId;
      }
    }

    return -1;
  }

  constructor(
    @InjectModel(ClaimRequestData.name)
    private claimRequestData: Model<ClaimRequestData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {}

  @Cron(CronExpression.EVERY_5_MINUTES)
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

      this.stateManager.transactionMutex.runExclusive(async () => {
        try {
          this.logger.debug('Preparing transaction for claimer');
          const signer = PrivateKey.fromBase58(
            process.env.GIFT_CODES_TREASURY_PRIVATE,
          );
          const signerAccount = PublicKey.fromBase58(
            signer.toPublicKey().toBase58(),
          );

          const contractSM =
            this.stateManager.state[NetworkIds.MINA_DEVNET].plotteryManagers[
              pendingRequest.roundId
            ];
          const contract = contractSM.contract;
          const ticketId = this.findTicketId(
            pendingRequest.roundId,
            pendingRequest.userAddress,
            pendingRequest.ticketNumbers,
            pendingRequest.ticketAmount,
          );
          if (ticketId === -1) {
            throw new Error('Ticket not found');
          }

          const ticket = contractSM.roundTickets[ticketId];
          // #TODO check SM validity. Refetch it in case sm is not valid

          // #TODO remove round form getReward
          let rewardParams = await contractSM.getReward(
            pendingRequest.roundId,
            ticket,
          );

          let tx = await Mina.transaction(
            { sender: signerAccount, fee: Number('0.1') * 1e9 },
            async () => {
              contract.getReward(
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

          await this.claimRequestData.updateOne(
            { _id: pendingRequest._id },
            { status: 'failed' },
          );
        }
      });
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    } finally {
      this.isRunning = false;
    }
  }
}
