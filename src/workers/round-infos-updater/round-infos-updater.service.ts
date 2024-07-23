import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
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
  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}
  async onApplicationBootstrap() {}

  running = false;

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.running) return;
    this.running = true;

    try {
      for (let network of ALL_NETWORKS) {
        if (!StateSinglton.slotSinceGenesis[network.networkID]) continue;

        const stateM = StateSinglton.state[network.networkID]!;

        const slotSinceGenesis =
          StateSinglton.slotSinceGenesis[network.networkID];
        const startBlock =
          StateSinglton.lottery[network.networkID].startBlock.get();

        const currentRoundId = Math.floor(
          (slotSinceGenesis - Number(startBlock)) / BLOCK_PER_ROUND,
        );
        console.log('Current round id', currentRoundId);

        for (let roundId = 0; roundId <= currentRoundId; roundId++) {
          const boughtTickets =
            StateSinglton.boughtTickets[network.networkID][roundId];

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
                  winningCombination:
                    !winningCombination ||
                    winningCombination.every((x) => x == 0)
                      ? undefined
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
      console.log('Round info update error', e);
      this.running = false;
    }
  }
}
