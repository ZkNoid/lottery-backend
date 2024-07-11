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

@Injectable()
export class ProveReduceService implements OnApplicationBootstrap {
  constructor(private readonly httpService: HttpService) {}
  async onApplicationBootstrap() {
    await this.handleCron();
  }

  @Cron('45 * * * * *')
  async handleCron() {
    console.log('REDUCE PROVING');
    for (let network of ALL_NETWORKS) {
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

      const lastReduceInRound = StateSinglton.lottery[
        network.networkID
      ].lastReduceInRound
        .get()
        .toBigInt();

      console.log('Current round id', currentRoundId, 'ttr', lastReduceInRound);

      if (lastReduceInRound < currentRoundId) {
        console.log('Time to reduce');
        const sender = PrivateKey.fromBase58(process.env.PK);

        // Reduce tickets
        let reduceProof = await StateSinglton.state[network.networkID].reduceTickets();

        console.log('Reduce proof', reduceProof);

        // let tx2_1 = await Mina.transaction({ sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 }, async () => {
        //   await StateSinglton.lottery[network.networkID].reduceTickets(reduceProof, Field(1));
        // });
      }
    }
  }
}