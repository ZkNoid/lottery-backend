import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  convertToUInt64,
  NumberPacked,
  PLottery,
  Ticket,
} from 'l1-lottery-contracts';
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
import { LocalContext } from '../../lib.js';
import { TxStoreData } from '../schema/txstore.schema.js';

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
    @InjectModel(TxStoreData.name, 'zkApp')
    private txStoreData: Model<TxStoreData>,
  ) {}
  async onApplicationBootstrap() {}

  async addTxToStore(userAddress: string, txHash: string) {
    await this.txStoreData.create({
      userAddress,
      txHash,
      type: 'Lottery reward claim',
    });
  }

  getRewardAmount(contract: PLottery, ticket: Ticket): number {
    try {
      const winningNumbers = contract.result.get();
      const score = ticket.getScore(NumberPacked.unpack(winningNumbers));
      const totalScore = contract.totalScore.get();
      const bank = contract.bank.get();

      const payAmount = convertToUInt64(bank).mul(score).div(totalScore);
      return +payAmount / 1e9;
    } catch (e) {
      this.logger.error('Error calculating reward amount', String(e));
    }

    return 0;
  }

  async failRequest(request: ClaimRequestData, e: Error) {
    this.logger.error(
      `Failed to fulfill claim request for round ${request.roundId}`,
      e.stack,
    );
    const totalErrorAmount = (request.numOfErrors ?? 0) + 1;
    if (totalErrorAmount >= NUM_OF_ERRORS_TO_FAIL) {
      await this.claimRequestData.updateOne(
        { _id: request._id },
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
        { _id: request._id },
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

  @Cron('*/3 * * * *')
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }
    this.isRunning = true;

    const batchSize = process.env.CLAIM_BATCH_SIZE
      ? +process.env.CLAIM_BATCH_SIZE
      : 1;

    try {
      // Get roundId with pending requests
      const firstPendingRequest = await this.claimRequestData.findOne({
        status: 'pending',
      });

      if (!firstPendingRequest) {
        this.logger.debug('No pending request for claimer');
        return;
      }

      const roundId = firstPendingRequest.roundId;

      const pendingRequests = await this.claimRequestData
        .find({
          status: 'pending',
          roundId,
        })
        .limit(batchSize);

      await this.stateManager.transactionMutex.runExclusive(async () => {
        try {
          this.logger.debug('Preparing transactions for claimer');
          const signer = PrivateKey.fromBase58(
            process.env.GIFT_CODES_TREASURY_PRIVATE,
          );
          const signerAccount = PublicKey.fromBase58(
            signer.toPublicKey().toBase58(),
          );

          const signerAccountData = await fetchAccount({
            publicKey: signerAccount,
          });

          const contractSM = this.stateManager.state.plotteryManagers[roundId];
          const txPromises = [];

          if (!(await this.stateManager.checkPlotteryConsistency(roundId))) {
            this.logger.debug('Incosistent state. Refetch');
            await this.infoUpdater.updateInfoForRound(roundId);
          }
          const contract = contractSM.contract;

          const nullifierUpdatedIds = [];
          const context = await LocalContext(contract.address);
          let nonce = +signerAccountData.account.nonce;

          for (const pendingRequest of pendingRequests) {
            try {
              this.logger.log(
                `Finding ticket for request _id=${pendingRequest._id}, ticketId=${pendingRequest.ticketId}`,
              );
              const ticketId = pendingRequest.ticketId;

              const ticket = contractSM.roundTickets[ticketId];

              // Check if ticket have been already claimed
              const currentNullifierStatus = contractSM.ticketNullifierMap.get(
                Field(ticketId),
              );

              // Skip already claimed tickets
              if (+currentNullifierStatus == 1) {
                this.logger.log(`Ticket was already claimed`);
                await this.claimRequestData.updateOne(
                  { _id: pendingRequest._id },
                  {
                    $set: {
                      status: 'failed',
                    },
                    $push: {
                      reasons: 'Already claimed',
                    },
                  },
                );

                continue;
              }

              let rewardParams = await contractSM.getRewardByTicketId(ticketId);

              // console.log('Claiming ticket', ticket);
              // console.log(
              //   'Claiming ticket',
              //   ticket.numbers.map((x) => x.toString()),
              // );
              // console.log('Claiming ticket', ticket.amount.toString());

              const ownerInfo = await fetchAccount({ publicKey: ticket.owner });
              const isNewAccount = ownerInfo.account == undefined;

              this.logger.debug(
                `Ticket nullifier before transaction: `,
                contract.ticketNullifier.get().toString(),
              );

              // Just for memo
              const rewardAmount = this.getRewardAmount(contract, ticket);

              let tx = await context.transaction(
                {
                  sender: signerAccount,
                  fee: Number('0.1') * 1e9,
                  nonce: nonce++,
                  memo: `ZkNoid: Reward claim ${rewardAmount ? `(${rewardAmount.toFixed()} MINA)` : ''}`,
                },
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

              // Update nullifier for next transactions
              contractSM.ticketNullifierMap.set(Field(ticketId), Field(1));
              nullifierUpdatedIds.push(Field(ticketId));

              this.logger.debug(
                `Ticket nullifier after transaction: `,
                contract.ticketNullifier.get().toString(),
              );

              await tx.prove();
              const txResult = await tx.sign([signer]).send();

              // Add transaction to store
              await this.addTxToStore(
                pendingRequest.userAddress,
                txResult.hash,
              );

              let txPromise = txResult
                .wait()
                .then(async () => {
                  await this.claimRequestData.updateOne(
                    { _id: pendingRequest._id },
                    {
                      status: 'fulfilled',
                      tx: txResult.hash,
                    },
                  );

                  this.logger.debug('Transaction included', txResult.hash);
                })
                .catch(async (e) => {
                  await this.failRequest(pendingRequest, e);
                });

              txPromises.push(txPromise);
            } catch (e) {
              await this.failRequest(pendingRequest, e);
            }
          }

          // Restore nullifier
          nullifierUpdatedIds.forEach((ticketId) =>
            contractSM.ticketNullifierMap.set(Field(ticketId), Field(0)),
          );

          await Promise.all(txPromises);
        } catch (e) {
          this.logger.error('Reward claim error', String(e));
        }
      });
    } catch (e) {
      this.logger.error('Reward claim error', String(e));
    } finally {
      this.isRunning = false;
    }
  }
}
