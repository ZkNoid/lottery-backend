import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Field } from 'o1js';
import { HttpService } from '@nestjs/axios';
import {
  BLOCK_PER_ROUND,
  getNullifierId,
  NumberPacked,
  TICKET_PRICE,
} from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';
import { StateService } from 'src/state-service/state.service';

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

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {}

  running = false;

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.running) return;
    this.running = true;

    try {
      for (let network of ALL_NETWORKS) {
        if (!this.stateManager.slotSinceGenesis[network.networkID]) continue;

        const stateM = this.stateManager.state[network.networkID]!;

        const slotSinceGenesis =
          this.stateManager.slotSinceGenesis[network.networkID];
        const startBlock =
          this.stateManager.lottery[network.networkID].startBlock.get();

        const currentRoundId = this.stateManager.roundIds[network.networkID];
        this.logger.debug('Current round id', currentRoundId);

        for (let roundId = 0; roundId <= currentRoundId; roundId++) {
          const boughtTickets =
            this.stateManager.boughtTickets[network.networkID][roundId];

          const winningCombination = NumberPacked.unpackToBigints(
            stateM.roundResultMap.get(Field.from(roundId)),
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
                      ? (roundBank * ticketsShares[i]) /
                        ((totalShares * 103n) / 100n)
                      : 0n,
                    claimed: stateM.ticketNullifierMap
                      .get(getNullifierId(Field.from(roundId), Field.from(i)))
                      .equals(Field.from(1))
                      .toBoolean(),
                  })),
                  winningCombination: winningCombination.every((x) => !x)
                    ? null
                    : winningCombination,
                },
              },
              {
                upsert: true,
              },
            )
            .exec();
        }
      }
    } catch (e) {
      this.logger.error('Round info update error', e.stack);
    }
    this.running = false;
  }
}
