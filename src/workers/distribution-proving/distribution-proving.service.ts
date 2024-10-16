import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { fetchAccount, Field } from 'o1js';
import { RoundsData } from '../schema/rounds.schema.js';
import { StateService } from '../../state-service/state.service.js';

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
    await fetchAccount({ publicKey: rm.address });
    const result = rm.result.get();

    const noDP = !(await this.rounds.findOne({ roundId: roundId }))?.dp;
    const haveResult = result.toBigInt() > 0;
    this.logger.debug(
      `Checking condition for round ${roundId}`,
      noDP,
      haveResult,
    );

    return noDP && haveResult;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    this.stateManager.inReduceProving = true;
    try {
      for (let network of ALL_NETWORKS) {
        if (!this.stateManager.stateInitialized[network.networkID]) {
          this.logger.debug('State is not initialized');
          continue;
        }
        const currentRoundId = await this.stateManager.getCurrentRound(
          network.networkID,
        );

        this.logger.debug('Current round id', currentRoundId);

        let leastRoundWithNoDP = await this.rounds.findOne({ roundId: null });

        this.logger.debug('Last round with no dp', leastRoundWithNoDP?.roundId);

        let startFromRound = +process.env.START_FROM_ROUND;
        let startRoundId = Math.max(
          startFromRound,
          leastRoundWithNoDP?.roundId || startFromRound,
        );

        for (let roundId = startRoundId; roundId < currentRoundId; roundId++) {
          this.logger.debug('Round', roundId);

          if (await this.checkConditionsForRound(network.networkID, roundId)) {
            await this.stateManager.transactionMutex.runExclusive(async () => {
              this.logger.debug('Generation of DP', roundId);

              const contact =
                this.stateManager.state[network.networkID].plotteryManagers[
                  roundId
                ].contract;
              await fetchAccount({ publicKey: contact.address });
              let dp =
                await this.stateManager.state[
                  network.networkID
                ].plotteryManagers[roundId].getDP(roundId);

              const ticketRoot = contact.ticketRoot.get();

              if (ticketRoot.toBigInt() != dp.publicOutput.root.toBigInt()) {
                this.logger.error(
                  'DP root is not equal to contract root. Aborting dp generation',
                );
                this.logger.error(ticketRoot.toString());
                this.logger.error(dp.publicOutput.root.toString());
                return;
              }

              this.logger.debug('DP generated');
              this.logger.debug(dp);

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
            });
          }
        }
      }
    } catch (e) {
      console.log('Error while dp generation', e);
    }

    this.stateManager.inReduceProving = false;
  }
}
