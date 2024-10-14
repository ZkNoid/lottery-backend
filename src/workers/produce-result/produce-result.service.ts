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
import { NumberPacked } from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ProduceResultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProduceResultService.name);
  private isRunning = false;
  private lastProduceInRound = process.env.START_FROM_ROUND
    ? +process.env.START_FROM_ROUND
    : 0;

  constructor(private stateManager: StateService) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(networkId: string, roundId: number) {
    if (roundId == 8) {
      // Only for testing purpose, as 8th round is fucked up
      return {
        shouldStart: false,
        noProduce: false,
      };
    }

    const plottery =
      this.stateManager.state[networkId].plotteryManagers[roundId].contract;
    const randomManager =
      this.stateManager.state[networkId].randomManagers[roundId].contract;

    await fetchAccount({ publicKey: plottery.address });
    await fetchAccount({ publicKey: randomManager.address });

    const isReduced = plottery.reduced.get().toBoolean();

    const haveRandomValue = randomManager.result.get().toBigInt() > 0;
    const noProduce = plottery.result.get().toBigInt() == 0;

    console.log(`${roundId}: ${isReduced} ${haveRandomValue} ${noProduce}`);

    return {
      shouldStart: isReduced && haveRandomValue && noProduce,
      noProduce,
    };
  }

  @Cron('*/2 * * * *')
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug(`Is running`);
      return;
    }
    this.isRunning = true;

    for (let network of ALL_NETWORKS) {
      try {
        this.logger.debug(
          'StateSinglton state',
          this.stateManager.initialized,
          this.stateManager.stateInitialized,
        );

        const currentRoundId = await this.stateManager.getCurrentRound(
          network.networkID,
        );
        this.logger.debug('Current round id', currentRoundId);

        for (
          let roundId = this.lastProduceInRound;
          roundId < currentRoundId;
          roundId++
        ) {
          this.logger.debug('Checking round ', roundId);

          const { shouldStart, noProduce } = await this.checkRoundConditions(
            network.networkID,
            roundId,
          );

          if (!noProduce) {
            this.lastProduceInRound = roundId;
            continue;
          }

          // If round is not ready to be produced - do not check next rounds
          if (!shouldStart) {
            break;
          }

          if (shouldStart) {
            await this.stateManager.transactionMutex.runExclusive(async () => {
              this.logger.debug('Producing result', roundId);

              // console.log(`Digest: `, await MockLottery.digest());
              const sender = PrivateKey.fromBase58(process.env.PK);
              this.logger.debug('Tx init');

              let tx = await Mina.transaction(
                { sender: sender.toPublicKey(), fee: Number('0.3') * 1e9 },
                async () => {
                  await this.stateManager.state[
                    network.networkID
                  ].plotteryManagers[roundId].contract.produceResult();
                },
              );
              this.logger.debug('Proving tx');
              await tx.prove();
              this.logger.debug('Proved tx');
              let txResult = await tx.sign([sender]).send();

              this.logger.debug(`Tx successful. Hash: `, txResult.hash);
              this.logger.debug('Waiting for tx');
              await txResult.wait();
              this.logger.debug('Got tx');
            });
          }
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }

    this.isRunning = false;
    // this.stateManager.inReduceProving = false;
  }
}
