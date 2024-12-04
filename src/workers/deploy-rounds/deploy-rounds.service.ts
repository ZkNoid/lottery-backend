import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { AccountUpdate, Field, Mina, PrivateKey, fetchAccount } from 'o1js';
import { BLOCK_PER_ROUND, ZkOnCoordinatorAddress } from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';
import { getCurrentSlot } from '../../lib.js';
import { Model } from 'mongoose';
import { CommitData } from '../schema/commits.schema.js';
import { CommitValue } from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { InjectModel } from '@nestjs/mongoose';
import { RoundsData } from '../schema/rounds.schema.js';

@Injectable()
export class DeployRoundService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeployRoundService.name);
  private isRunning = false;
  private lastCommitInRound = process.env.START_FROM_ROUND
    ? +process.env.START_FROM_ROUND
    : 0;

  constructor(
    private stateManager: StateService,
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(networkId: string) {
    const currentRound = await this.stateManager.getCurrentRound(networkId);

    const lastRound = await this.rounds.findOne().sort({ roundId: -1 });

    const gap = lastRound.roundId - currentRound;

    const expectedGap = process.env.MAX_DEPLOYED_ROUNDS_GAP
      ? +process.env.MAX_DEPLOYED_ROUNDS_GAP
      : 5;

    this.logger.log(`Current gap: ${gap}, expected: ${expectedGap}`);

    const shouldDeploy = gap < expectedGap;
    const round = lastRound.roundId + 1;

    return {
      shouldDeploy,
      round,
    };
  }

  async deployRound(networkId: string, roundId: number) {
    const factoryManager = this.stateManager.state[networkId];
    const factory = this.stateManager.factory[networkId];
    if (
      factoryManager.roundsMap.get(Field(roundId)).greaterThan(0).toBoolean()
    ) {
      this.logger.log(`Plottery for round ${roundId} have been deployed`);
      return;
    }
    const witness = factoryManager.roundsMap.getWitness(Field(roundId));

    // #TODO save them somewhere
    const plotteryPrivateKey = PrivateKey.random();
    const plotteryAddress = plotteryPrivateKey.toPublicKey();

    const randomManagerPrivateKey = PrivateKey.random();
    const randomManagerAddress = randomManagerPrivateKey.toPublicKey();

    const senderKey = PrivateKey.fromBase58(process.env.PK);
    const sender = senderKey.toPublicKey();

    this.logger.log(
      `Deploying plottery: ${plotteryAddress.toBase58()} and random manager: ${randomManagerAddress.toBase58()} for round ${roundId}`,
    );
    let tx = await Mina.transaction(
      { sender: sender, fee: Number('0.5') * 1e9 },
      async () => {
        AccountUpdate.fundNewAccount(sender);
        AccountUpdate.fundNewAccount(sender);

        await factory.deployRound(
          witness,
          randomManagerAddress,
          plotteryAddress,
        );
      },
    );

    await tx.prove();
    let txInfo = await tx
      .sign([senderKey, randomManagerPrivateKey, plotteryPrivateKey])
      .send();

    const txResult = await txInfo.safeWait();

    if (txResult.status === 'rejected') {
      this.logger.error(`Transaction failed due to following reason`);
      this.logger.error(txResult.errors);
      return;
    }

    this.logger.log(`Tx hash: ${txResult.hash}`);

    factoryManager.addDeploy(roundId, randomManagerAddress, plotteryAddress);
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('Already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Deploy module started');

    for (let network of ALL_NETWORKS) {
      try {
        this.logger.debug('Checking conditions');
        await this.stateManager.fetchRounds();
        let { shouldDeploy, round } = await this.checkRoundConditions(
          network.networkID,
        );

        if (shouldDeploy) {
          await this.stateManager.transactionMutex.runExclusive(async () => {
            await this.deployRound(network.networkID, round);
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
