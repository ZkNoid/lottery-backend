import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { Field, Mina, PrivateKey, UInt32, fetchLastBlock } from 'o1js';
import { NumberPacked } from 'l1-lottery-contracts';
import { StateService } from 'src/state-service/state.service';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ProduceResultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProduceResultService.name);

  constructor(private stateManager: StateService) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(networkId: string, roundId: number) {
    const lastReduceInRound = this.stateManager.lottery[
      networkId
    ].lastReduceInRound
      .get()
      .toBigInt();

    const result = this.stateManager.state[networkId].roundResultMap.get(
      Field.from(roundId),
    );

    this.logger.debug(`Round ${roundId} result: ${result.toBigInt()} last reduce ${lastReduceInRound}`);

    return roundId < lastReduceInRound && result.toBigInt() == 0n;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    if (this.stateManager.inReduceProving) return;
    this.stateManager.inReduceProving = true;

    for (let network of ALL_NETWORKS) {
      try {
        this.logger.debug(
          'StateSinglton state',
          this.stateManager.initialized,
          this.stateManager.stateInitialized,
        );

        const currentRoundId = this.stateManager.roundIds[network.networkID];
        this.logger.debug('Current round id', currentRoundId);

        for (let roundId = 0; roundId < currentRoundId; roundId++) {
          if (await this.checkRoundConditions(network.networkID, roundId)) {
            this.logger.debug('Producing result', roundId);

            let { resultWitness, bankValue, bankWitness } =
              this.stateManager.state[network.networkID].updateResult(roundId);

            // console.log(`Digest: `, await MockLottery.digest());
            const sender = PrivateKey.fromBase58(process.env.PK);
            this.logger.debug('Tx init');

            const randomCombilation = Array.from({ length: 6 }, () =>
              randomIntFromInterval(1, 9),
            );
            this.logger.log('Setting combination', randomCombilation);
            let tx = await Mina.transaction(
              { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
              async () => {
                await this.stateManager.lottery[
                  network.networkID
                ].produceResult(
                  resultWitness,
                  NumberPacked.pack(
                    randomCombilation.map((x) => UInt32.from(x)),
                  ),
                  bankValue,
                  bankWitness,
                );
              },
            );
            this.logger.debug('Proving tx');
            await tx.prove();
            this.logger.debug('Proved tx');
            let txResult = await tx.sign([sender]).send();

            this.logger.debug(`Tx successful. Hash: `, txResult.hash);
            this.logger.debug('Waiting for tx');
            await txResult.wait();
          }
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }

    this.stateManager.inReduceProving = false;
  }
}
