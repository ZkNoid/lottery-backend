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
export class DeployRoundService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeployRoundService.name);
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
    return true;
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
        let shouldStart = await this.checkRoundConditions(network.networkID);

        if (shouldStart) {
          await this.stateManager.transactionMutex.runExclusive(async () => {});
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }

    this.logger.debug('Releasing');
    this.isRunning = false;
  }
}
