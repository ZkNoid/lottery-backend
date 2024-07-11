import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
import { NumberPacked } from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ProduceResultService implements OnApplicationBootstrap {
  constructor(
    private readonly httpService: HttpService,
  ) {}
  async onApplicationBootstrap() {
    await this.handleCron();
  }

  @Cron('45 * * * * *')
  async handleCron() {
    for (let network of ALL_NETWORKS) {
      console.log(
        'StateSinglton state',
        StateSinglton.initialized,
        StateSinglton.stateInitialized,
      );

      const data = await this.httpService.axiosRef.post(
        network.graphql,
        JSON.stringify({
          query: `
        query {
          bestChain(maxLength:1) {
            protocolState {
              consensusState {
                blockHeight,
                slotSinceGenesis
              }
            }
          }
        }
      `,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'json',
        },
      );
      const slotSinceGenesis =
        data.data.data.bestChain[0].protocolState.consensusState
          .slotSinceGenesis;
      const startBlock =
        StateSinglton.lottery[network.networkID].startBlock.get();
      const BLOCK_PER_ROUND = 480;

      const currentRoundId = Math.floor(
        (slotSinceGenesis - Number(startBlock)) / BLOCK_PER_ROUND,
      );
      console.log('Current round id', currentRoundId);

      for (let roundId = 0; roundId < currentRoundId; roundId++) {
        const result = StateSinglton.state[
          network.networkID
        ].roundResultMap.get(Field.from(roundId));

        console.log('Round', roundId, 'Result', result.toBigInt());

        if (result.toBigInt() == 0n) {
          console.log('Producing resukt', roundId);

          let resultWiness =
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
                resultWiness,
                NumberPacked.pack(randomCombilation.map((x) => UInt32.from(x))),
              );
            },
          );
          console.log('Proving tx');
          await tx.prove();
          console.log('Proved tx');
          let txResult = await tx.sign([sender]).send();

          console.log(`Tx successful. Hash: `, txResult.hash);
        }
      }
    }
  }
}