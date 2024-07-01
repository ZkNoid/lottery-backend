import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  UInt32,
  fetchLastBlock,
} from 'o1js';
import { HttpService } from '@nestjs/axios';
import { NumberPacked, Ticket } from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class DistributionProvingService implements OnApplicationBootstrap {
  constructor(
    private readonly httpService: HttpService,
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}
  async onApplicationBootstrap() {
    await this.handleCron();
  }

  // @Cron('45 * * * * *')
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
        console.log('Round', roundId);
        if (!(await this.rounds.findOne({ roundId: roundId }))?.dp) {
          console.log('Generation of DP', roundId);

          let dp = await StateSinglton.state[network.networkID].getDP(roundId);

          console.log('DP generated');

          // console.log('Distribution proof', dp.toJSON());
          await this.rounds
            .updateOne(
              {
                roundId,
              },
              {
                $set: {
                  dp: JSON.stringify(dp.toJSON()),
                },
              },
              {
                upsert: true,
              },
            )
            .exec();
        }
      }
    }
  }
}
