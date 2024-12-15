import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Field, Mina, PrivateKey, fetchAccount } from 'o1js';
import { BLOCK_PER_ROUND, ZkOnCoordinatorAddress } from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';
import { getCurrentSlot } from '../../lib.js';
import { Model } from 'mongoose';
import { CommitData } from '../schema/commits.schema.js';
import { CommitValue } from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CommitValueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommitValueService.name);
  private isRunning = false;
  private lastCommitInRound = process.env.START_FROM_ROUND
    ? +process.env.START_FROM_ROUND
    : 1;

  constructor(
    private stateManager: StateService,
    @InjectModel(CommitData.name)
    private commitData: Model<CommitData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions() {
    const currentRound = await this.stateManager.getCurrentRound();

    for (let i = this.lastCommitInRound; i <= currentRound; i++) {
      const rmContract = this.stateManager.state.randomManagers[i].contract;
      const accountInfo = await fetchAccount({ publicKey: rmContract.address });

      const COMMIT_PARTY_ID = Number(process.env.COMMIT_PARTY_ID);
      console.log('Commit party id', COMMIT_PARTY_ID);
      const contractCommit =
        COMMIT_PARTY_ID == 0
          ? rmContract.firstCommit.get().toBigInt()
          : rmContract.secondCommit.get().toBigInt();

      if (contractCommit > 0) {
        this.lastCommitInRound = i;
        continue;
      }

      return {
        shouldStart: true,
        round: i,
      };
    }

    return {
      shouldStart: false,
      round: -1,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('Already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Commit value module started');

    try {
      this.logger.debug('Checking conditions');
      const { shouldStart, round } = await this.checkRoundConditions();
      this.logger.debug(shouldStart, round);
      if (shouldStart) {
        await this.stateManager.transactionMutex.runExclusive(async () => {
          this.logger.debug('Commiting value for round: ', round);

          const sender = PrivateKey.fromBase58(process.env.PARTY_PK);

          const randomValue = Field.random();
          const randomSalt = Field.random();

          this.logger.debug(
            'Commiting value ',
            randomValue.toString(),
            ' salt: ',
            randomSalt.toString(),
          );

          const contract =
            this.stateManager.state.randomManagers[round].contract;

          const newDock = new this.commitData({
            round: round,
            commitValue: randomValue.toString(),
            commitSalt: randomSalt.toString(),
            hash: new CommitValue({
              value: randomValue,
              salt: randomSalt,
            })
              .hash()
              .toString(),
          });

          this.logger.debug('Writing new commit to database', newDock);

          await this.commitData.updateOne(
            {
              _id: newDock._id,
            },
            {
              $set: newDock,
            },
            {
              upsert: true,
            },
          );

          await fetchAccount({
            publicKey: ZkOnCoordinatorAddress,
          });


          const COMMIT_PARTY_ID = Number(process.env.COMMIT_PARTY_ID);

          console.log('Commit party id', COMMIT_PARTY_ID);

          try {
            await fetchAccount({ publicKey: sender.toPublicKey() });
            
            let tx = await Mina.transaction(
              { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
              async () => {
                COMMIT_PARTY_ID == 0 ? 
                await contract.firstPartyCommit(
                  new CommitValue({
                    value: randomValue,
                    salt: randomSalt
                  }),
                ) : await contract.secondPartyCommit(
                  new CommitValue({
                    value: randomValue,
                    salt: randomSalt
                  }),
                );
              },
            );
            this.logger.debug('Proving tx');
            await tx.prove();
            const txResult = await tx.sign([sender]).send();

            this.logger.debug(`Tx successful. Hash: `, txResult.hash);
            this.logger.debug('Waiting for tx');
            await txResult.safeWait();
            this.logger.debug('Got tx');
          } catch (e) {
            this.logger.debug(
              'Got error while sending commit transaction: ',
              e,
            );
          }
        });
      }
    } catch (e) {
      this.logger.error('Error', e.stack);
    }

    this.logger.debug('Releasing');
    this.isRunning = false;
  }
}
