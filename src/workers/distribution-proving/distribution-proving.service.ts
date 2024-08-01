import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { BLOCK_PER_ROUND, NumberPacked, Ticket } from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class DistributionProvingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DistributionProvingService.name);

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }
  async checkConditionsForRound(networkId: string, roundId: number) {
    const result = StateSinglton.state[networkId].roundResultMap.get(
      Field.from(roundId),
    );

    return (
      !(await this.rounds.findOne({ roundId: roundId }))?.dp &&
      result.toBigInt() > 0
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    for (let network of ALL_NETWORKS) {
      const currentRoundId = StateSinglton.roundIds[network.networkID];

      this.logger.debug('Current round id', currentRoundId);

      for (let roundId = 0; roundId < currentRoundId; roundId++) {
        this.logger.debug('Round', roundId);

        if (await this.checkConditionsForRound(network.networkID, roundId)) {
          this.logger.debug('Generation of DP', roundId);

          let dp = await StateSinglton.state[network.networkID].getDP(roundId);

          this.logger.debug('DP generated');

          const events = StateSinglton.state[network.networkID]!.roundTickets[
            roundId
          ].map((x) => ({
            amount: Number(x.amount.toBigInt()),
            numbers: x.numbers.map((x) => Number(x.toBigint())),
            owner: x.owner.toBase58(),
          }));
          this.logger.debug('Distribution proof events', events);
          await this.rounds
            .updateOne(
              {
                roundId,
              },
              {
                $set: {
                  dp: dp.toJSON(),
                  events: events,
                  total: Number(dp.publicOutput.total.toBigInt()),
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
