import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Field } from 'o1js';
import { RoundsData } from '../schema/rounds.schema.js';
import { StateService } from 'src/state-service/state.service.js';

@Injectable()
export class DistributionProvingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DistributionProvingService.name);

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }
  async checkConditionsForRound(networkId: string, roundId: number) {
    const rm =
      this.stateManager.state[networkId].randomManagers[roundId].contract;
    const result = rm.result.get();

    return (
      !(await this.rounds.findOne({ roundId: roundId }))?.dp &&
      result.toBigInt() > 0
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    for (let network of ALL_NETWORKS) {
      const currentRoundId = await this.stateManager.getCurrentRound(
        network.networkID,
      );

      this.logger.debug('Current round id', currentRoundId);

      for (let roundId = 0; roundId < currentRoundId; roundId++) {
        this.logger.debug('Round', roundId);

        if (await this.checkConditionsForRound(network.networkID, roundId)) {
          this.logger.debug('Generation of DP', roundId);

          let dp =
            await this.stateManager.state[network.networkID].plotteryManagers[
              roundId
            ].getDP(roundId);

          this.logger.debug('DP generated');

          const events = this.stateManager.state[
            network.networkID
          ]!.plotteryManagers[roundId].roundTickets.map((x) => ({
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
