import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import {
  BaseEventDocument,
  MinaEventData,
  MinaEventDocument,
} from '../schema/events.schema';
import { Model } from 'mongoose';
import { Field, Mina, PrivateKey, UInt32, fetchLastBlock } from 'o1js';
import { HttpService } from '@nestjs/axios';
import { BLOCK_PER_ROUND, NumberPacked } from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ProduceResultService implements OnApplicationBootstrap {
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
        console.log(
          'StateSinglton state',
          StateSinglton.initialized,
          StateSinglton.stateInitialized,
        );

        const currentRoundId = StateSinglton.roundIds[network.networkID];
        console.log('Current round id', currentRoundId);

        for (let roundId = 0; roundId < currentRoundId; roundId++) {
          const result = StateSinglton.state[
            network.networkID
          ].roundResultMap.get(Field.from(roundId));

          console.log('Round', roundId, 'Result', result.toBigInt());

          if (result.toBigInt() == 0n) {
            console.log('Producing resukt', roundId);

            let { resultWitness, bankValue, bankWitness } =
              StateSinglton.state[network.networkID].updateResult(roundId);

            // console.log(`Digest: `, await MockLottery.digest());
            const sender = PrivateKey.fromBase58(process.env.PK);
            console.log('Tx init');

            const randomCombilation = Array.from({ length: 6 }, () =>
              randomIntFromInterval(1, 9),
            );
            console.log('Setting combination', randomCombilation);
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
            console.log('Proving tx');
            await tx.prove();
            console.log('Proved tx');
            let txResult = await tx.sign([sender]).send();

            console.log(`Tx successful. Hash: `, txResult.hash);
            console.log('Waiting for tx');
            await txResult.wait();
          }
        }
      } catch (e) {
        console.log('Error', e);
      }
    }

    StateSinglton.inReduceProving = false;
  }
}
