import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
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
    : 0;

  constructor(
    private stateManager: StateService,
    @InjectModel(CommitData.name)
    private commitData: Model<CommitData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(networkId: string) {
    const factory = this.stateManager.factory[networkId];

    await fetchAccount({ publicKey: factory.address });
    const initSlot = factory.startSlot.get();
    const currentSlot = await getCurrentSlot(networkId);
    const currentRound = (currentSlot - +initSlot) / BLOCK_PER_ROUND;

    for (let i = this.lastCommitInRound; i < currentRound; i++) {
      const rmContract =
        this.stateManager.state[networkId].randomManagers[i].contract;

      await fetchAccount({ publicKey: rmContract.address });
      if (rmContract.commit.get().toBigInt() > 0) {
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

    for (let network of ALL_NETWORKS) {
      try {
        this.logger.debug('Checking conditions');
        const { shouldStart, round } = await this.checkRoundConditions(
          network.networkID,
        );
        this.logger.debug(shouldStart, round);
        if (shouldStart) {
          await this.stateManager.transactionMutex.runExclusive(async () => {
            this.logger.debug('Commiting value for round: ', round);

            const sender = PrivateKey.fromBase58(process.env.PK);

            const randomValue = Field.random();
            const randomSalt = Field.random();

            this.logger.debug(
              'Commiting value ',
              randomValue.toString(),
              ' salt: ',
              randomSalt.toString(),
            );

            const contract =
              this.stateManager.state[network.networkID].randomManagers[round]
                .contract;

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

            try {
              let tx = await Mina.transaction(
                { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
                async () => {
                  await contract.commitValue(
                    new CommitValue({
                      value: randomValue,
                      salt: randomSalt,
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
    }

    this.logger.debug('Releasing');
    this.isRunning = false;
  }
}
