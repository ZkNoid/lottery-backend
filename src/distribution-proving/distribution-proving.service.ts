import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../constants/networks.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { fetchAccount, Field, PublicKey } from 'o1js';
import { RoundsData } from '../workers/schema/rounds.schema.js';
import { StateService } from '../state-service/state.service.js';
import {
  DistributionProgram,
  DistributionProof,
  DistributionProofPublicInput,
  MerkleMap20,
  Ticket,
} from 'l1-lottery-contracts';

@Injectable()
export class DistributionProvingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DistributionProvingService.name);
  private isRunning = false;

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }
  async checkConditionsForRound(networkId: string, roundId: number) {
    const plottery =
      this.stateManager.state[networkId].plotteryManagers[roundId].contract;
    await fetchAccount({ publicKey: plottery.address });
    const result = plottery.result.get();

    return (
      !(await this.rounds.findOne({ roundId: roundId }))?.dp &&
      result.toBigInt() > 0
    );
  }

  async getDP(networkId: string, roundId: number): Promise<DistributionProof> {
    const contract =
      this.stateManager.state[networkId].plotteryManagers[roundId].contract;
    const actionLists = await contract.reducer.fetchActions();

    const ticketMap = new MerkleMap20();

    const winningCombination = contract.result.get();

    let curMap = new MerkleMap20();

    let input = new DistributionProofPublicInput({
      winningCombination,
      ticket: Ticket.random(PublicKey.empty()),
      valueWitness: ticketMap.getWitness(Field(0)),
    });

    let roundInfo = await this.rounds.findOne({ roundId });

    let lastDpTicket = roundInfo?.lastDpTicket || -1;

    let curProof = roundInfo?.pendingDp
      ? // @ts-ignore
        await DistributionProof.fromJSON(roundInfo?.pendingDp as any)
      : await DistributionProgram.init(input);

    for (let i = 0; i < actionLists.length; i++) {
      const ticket = actionLists[i][0].ticket;

      curMap.set(Field(i), ticket.hash());

      if (i <= lastDpTicket) {
        this.logger.log(`Cached ticket ${i}`, i, lastDpTicket);
        continue;
      } else {
        this.logger.log(`Processing ticket ${i}`);
      }

      const input = new DistributionProofPublicInput({
        winningCombination,
        ticket: ticket,
        valueWitness: curMap.getWitness(Field(i)),
      });

      curProof = await DistributionProgram.addTicket(input, curProof);

      await this.rounds.updateOne(
        { roundId },
        {
          $set: {
            lastDpTicket: i,
            pendingDp: curProof.toJSON(),
          },
        },
      );

      lastDpTicket = i;
    }

    return curProof;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }

    this.isRunning = true;
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

        let leastRoundWithNoDP = await this.rounds.findOne({
          dp: { $exists: false },
        });

        this.logger.debug('Last round with no dp', leastRoundWithNoDP?.roundId);

        let startFromRound = Number(process.env.START_FROM_ROUND || 0);
        let startRoundId = Math.max(
          startFromRound,
          leastRoundWithNoDP?.roundId || startFromRound,
        );

        this.logger.debug('Start', startRoundId, 'end', currentRoundId);

        for (let roundId = startRoundId; roundId < currentRoundId; roundId++) {
          this.logger.debug('Round', roundId);

          if (await this.checkConditionsForRound(network.networkID, roundId)) {
            await this.stateManager.transactionMutex.runExclusive(async () => {
              this.logger.debug('Generation of DP', roundId);

              let dp = await this.getDP(network.networkID, roundId);

              const contact =
                this.stateManager.state[network.networkID].plotteryManagers[
                  roundId
                ].contract;
              await fetchAccount({ publicKey: contact.address });

              const ticketRoot = contact.ticketRoot.get();

              if (ticketRoot.toBigInt() != dp.publicOutput.root.toBigInt()) {
                this.logger.error(
                  'DP root is not equal to contract root. Aborting dp generation',
                );
                return;
              }

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
            });
          }
        }
      }
    } catch (e) {
      console.log('Error while dp generation', e);
    }

    this.isRunning = false;
    this.stateManager.inReduceProving = false;
  }
}
