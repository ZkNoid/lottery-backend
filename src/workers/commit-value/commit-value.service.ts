import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import {
  Field,
  Mina,
  PrivateKey,
  UInt32,
  fetchAccount,
  fetchLastBlock,
} from 'o1js';
import { BLOCK_PER_ROUND, NumberPacked } from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';
import { getCurrentSlot, getLatestBlock } from '../../lib.js';
import { Model } from 'mongoose';
import { CommitData } from '../schema/commits.schema.js';
import {
  CommitValue,
  RandomManager,
} from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { InjectModel } from '@nestjs/mongoose';
import { ZkonRequestCoordinator, ZkonZkProgram } from 'zkon-zkapp';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class CommitValueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommitValueService.name);
  private isRunning = false;

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

    const lastCommit = await this.commitData.findOne({}).sort({ round: -1 });
    const lastCommitedRound = lastCommit ? lastCommit.round : -1;

    const shouldStart = currentRound > lastCommitedRound + 1;
    const round = lastCommitedRound + 1;

    return {
      shouldStart,
      round,
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
        const { shouldStart, round } = await this.checkRoundConditions(
          network.networkID,
        );
        if (shouldStart) {
          this.stateManager.transactionMutex.runExclusive(async () => {
            this.logger.debug('Commiting value for round: ', round);

            // console.log(`Digest: `, await MockLottery.digest());
            const sender = PrivateKey.fromBase58(process.env.PK);

            const randomValue = Field.random();
            const randomSalt = Field.random();

            this.logger.log(
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
              revealed: false,
            });

            this.logger.log('Writing new commit to database', newDock);

            await this.commitData.updateOne(
              {
                round,
              },
              {
                $set: newDock,
              },
              {
                upsert: true,
              },
            );

            await fetchAccount({
              publicKey:
                'B62qnmsn4Bm4MzPujKeN1faxedz4p1cCAwA9mKAWzDjfb4c1ysVvWeK',
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
              this.logger.debug('Proved tx');
              const txResult = await tx.sign([sender]).send();

              this.logger.debug(`Tx successful. Hash: `, txResult.hash);
              this.logger.debug('Waiting for tx');
              await txResult.wait();
              this.logger.debug('Got tx');
            } catch (e) {
              this.logger.debug(
                'Got error while sending commit transaction: ',
                e,
              );
              await this.commitData.deleteOne({
                round,
              });
            }
          });
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }

    this.isRunning = false;
  }
}
