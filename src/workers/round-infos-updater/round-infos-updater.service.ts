import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { fetchAccount, Field } from 'o1js';
import { HttpService } from '@nestjs/axios';
import {
  BLOCK_PER_ROUND,
  NumberPacked,
  TICKET_PRICE,
} from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema.js';
import { StateService } from '../../state-service/state.service.js';

const SCORE_COEFFICIENTS: bigint[] = [
  0n,
  90n,
  324n,
  2187n,
  26244n,
  590490n,
  31886460n,
];

@Injectable()
export class RoundInfoUpdaterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoundInfoUpdaterService.name);
  private isRunning = false;

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {
    await this.handleCron(true);
  }

  // Round is finished and winning combination is generated
  async isRoundComplete(roundId: number, currentRound: number) {
    const roundInfo = await this.rounds.findOne({
      roundId,
    });

    const winningCombinationIsGenerated = !!roundInfo?.winningCombination;

    console.log(
      `Round: ${roundId}. ${roundId < currentRound} ${winningCombinationIsGenerated}`,
    );

    return roundId < currentRound && winningCombinationIsGenerated;
  }

  async updateInfoForRound(
    networkID: string,
    roundId: number,
  ): Promise<{ shouldStop: boolean | null }> {
    const stateM = this.stateManager.state[networkID]!;

    this.logger.debug('Processing round', roundId);
    const roundStateManager = stateM.plotteryManagers[roundId];
    // const isComplete = await this.isRoundComplete(roundId, currentRound);

    // // Skipping rounds that are not going to change
    // if (isComplete) {
    //   this.logger.debug('Skipping processed round: ', roundId);
    //   continue;
    // }

    if (!roundStateManager) {
      this.logger.warn(
        `No contract for round ${roundId}. Consider deploying it.`,
      );
      return {
        shouldStop: false,
      };
    }

    const plotteryContract = roundStateManager.contract;

    await fetchAccount({ publicKey: plotteryContract.address });

    this.logger.debug('Fetching bought tickets', networkID, roundId);

    const boughtTickets = this.stateManager.boughtTickets[networkID][roundId];
    const boughtTicketsHashes =
      this.stateManager.boughtTicketsHashes[networkID][roundId];
    const claimedTicketsHashes =
      this.stateManager.claimedTicketsHashes[networkID][roundId];

    // this.logger.debug('Bought tickets', boughtTickets);

    const winningCombination = NumberPacked.unpackToBigints(
      plotteryContract.result.get(),
    )
      .map((v) => Number(v))
      .slice(0, 6);

    const roundBank = boughtTickets
      .filter((x) => !x.numbers.every((x) => x.toBigint() == 0n))
      .map((x) => x.amount.toBigInt() * TICKET_PRICE.toBigInt())
      .reduce((x, y) => x + y, 0n);

    const ticketsShares = boughtTickets.map((x) => {
      const ticketShares =
        SCORE_COEFFICIENTS[
          Array.from({ length: 6 }, (p, i) => i)
            .map((i) =>
              Number(x.numbers[i].toBigint()) == winningCombination[i]
                ? 1
                : (0 as number),
            )

            .reduce((a, b) => a + b)
        ] * x.amount.toBigInt();

      return ticketShares;
    });

    const totalShares = ticketsShares.reduce((x, y) => x + y, 0n);

    const plotteryAddress = plotteryContract.address.toBase58();
    const randomManagerAddress =
      stateM.randomManagers[roundId].contract.address.toBase58();

    console.log(`Adding round info for round ${roundId}`);

    await this.rounds
      .updateOne(
        {
          roundId,
        },
        {
          $set: {
            roundId,
            bank: boughtTickets
              .map((x) => x.amount.toBigInt())
              .reduce((x, y) => x + y, 0n),
            tickets: boughtTickets.map((x, i) => ({
              amount: x.amount.toBigInt(),
              numbers: x.numbers.map((x) => Number(x.toBigint())),
              owner: x.owner.toBase58(),
              funds: totalShares
                ? (roundBank * ticketsShares[i]) / ((totalShares * 103n) / 100n)
                : 0n,
              claimed: roundStateManager.ticketNullifierMap
                .get(Field.from(i))
                .equals(Field.from(1))
                .toBoolean(),
              buyHash: boughtTicketsHashes[i],
              claimHash: roundStateManager.ticketNullifierMap
                .get(Field.from(i))
                .equals(Field.from(1))
                .toBoolean()
                ? claimedTicketsHashes[i]
                : undefined,
            })),
            winningCombination: winningCombination.every((x) => !x)
              ? null
              : winningCombination,
            plotteryAddress,
            randomManagerAddress,
          },
        },
        {
          upsert: true,
        },
      )
      .exec();

    return {
      shouldStop: false,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(onBootstrap = false) {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }
    this.isRunning = true;

    try {
      for (let network of ALL_NETWORKS) {
        if (!this.stateManager.slotSinceGenesis[network.networkID]) continue;

        this.logger.debug('Deployed rounds data');

        this.logger.debug(
          Object.keys(
            this.stateManager.state[network.networkID].plotteryManagers,
          ),
        );

        const startFrom = process.env.START_FROM_ROUND
          ? +process.env.START_FROM_ROUND
          : 0;

        const allDeployedRounds = Object.keys(
          this.stateManager.state[network.networkID].plotteryManagers,
        )
          .map((v) => +v)
          .filter((v) => v >= startFrom)
          .sort((a, b) => a - b);

        const roundsToCheck = allDeployedRounds;
        // const roundsToCheck = onBootstrap
        //   ? allDeployedRounds
        //   : currentRound > 0
        //     ? [currentRound - 1, currentRound]
        //     : [currentRound];

        this.logger.debug('Amount of rounds to check', roundsToCheck.length);

        for (const roundId of roundsToCheck) {
          let result = await this.updateInfoForRound(
            network.networkID,
            roundId,
          );

          if (result.shouldStop) {
            break;
          }
        }
      }
    } catch (e) {
      this.logger.error('Round info update error', e.stack);
    }

    this.isRunning = false;
  }
}
