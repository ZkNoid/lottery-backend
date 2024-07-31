import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { Field, Mina, PrivateKey, UInt32, fetchLastBlock } from 'o1js';
import { NumberPacked } from 'l1-lottery-contracts';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ProduceResultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProduceResultService.name);

  constructor() {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    if (StateSinglton.inReduceProving) return;
    StateSinglton.inReduceProving = true;

    for (let network of ALL_NETWORKS) {
      try {
        this.logger.debug(
          'StateSinglton state',
          StateSinglton.initialized,
          StateSinglton.stateInitialized,
        );

        const currentRoundId = StateSinglton.roundIds[network.networkID];
        this.logger.debug('Current round id', currentRoundId);

        for (let roundId = 0; roundId < currentRoundId; roundId++) {
          const result = StateSinglton.state[
            network.networkID
          ].roundResultMap.get(Field.from(roundId));

          this.logger.debug('Round', roundId, 'Result', result.toBigInt());

          if (result.toBigInt() == 0n) {
            this.logger.debug('Producing result', roundId);

            let { resultWitness, bankValue, bankWitness } =
              StateSinglton.state[network.networkID].updateResult(roundId);

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
                await StateSinglton.lottery[network.networkID].produceResult(
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
        this.logger.error('Error', e);
      }
    }

    StateSinglton.inReduceProving = false;
  }
}
