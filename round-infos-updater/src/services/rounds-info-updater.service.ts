import {
  Controller,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  ClientProxy,
  Ctx,
  MessagePattern,
  RmqContext,
} from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { BLOCK_PER_ROUND, TICKET_PRICE } from 'l1-lottery-contracts';
import { ConfigService } from '@nestjs/config';
import { MurLock, MurLockService } from 'murlock';
import { RoundsData } from '../schemas/rounds.schema';
import { lastValueFrom, timeout } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';

const BLOCK_UPDATE_DEPTH = 6;
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
export class RoundsInfoUpdaterService implements OnModuleInit {
  private readonly logger = new Logger(RoundsInfoUpdaterService.name);

  constructor(
    private murLockService: MurLockService,
    @Inject('STATE_MANAGER_SERVICE') private rabbitClient: ClientProxy,
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}

  async onModuleInit() {
    await this.rabbitClient.connect();
  }

  async onApplicationBootstrap() {
    await this.updateHandler();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async updateHandler(): Promise<void> {
    try {
      await this.update();
    } catch (e) {
      console.log('Update error', e);
    }
  }
  async update(): Promise<void> {
    const result = await lastValueFrom(
      this.rabbitClient
        .send({ cmd: 'get-common-info' }, {})
        .pipe(timeout(5000)),
    );

    console.log('Result', result);
    // const data = await result.subscribe();

    if (!result) return;

    const currentRoundId = result.currentRoundId;
    this.logger.debug('Current round id', currentRoundId);

    for (let roundId = 0; roundId <= currentRoundId; roundId++) {
      console.log('Fetching round', roundId);
      const roundInfo = await lastValueFrom(
        this.rabbitClient
          .send({ cmd: 'get-round-info' }, roundId)
          .pipe(timeout(5000)),
      );
      console.log('Fetching round end', roundId);

      if (!roundInfo) {
        console.log('State manager is not ready');
        return
      }

      try {
        const boughtTickets = roundInfo.boughtTickets;

        const roundBank = boughtTickets
          .filter((x) => !x.numbers.every((x) => x == 0))
          .map((x) => BigInt(x.amount) * TICKET_PRICE.toBigInt())
          .reduce((x, y) => x + y, 0n) as bigint;

        const winningCombination = roundInfo.winningCombination;

        const ticketsShares = boughtTickets.map((x) => {
          const ticketShares =
            SCORE_COEFFICIENTS[
              Array.from({ length: 6 }, (p, i) => i)
                .map((i) =>
                  Number(x.numbers[i]) == winningCombination[i]
                    ? 1
                    : (0 as number),
                )

                .reduce((a, b) => a + b)
            ] * BigInt(x.amount);

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
                  .map((x) => BigInt(x.amount))
                  .reduce((x, y) => x + y, 0n),
                tickets: boughtTickets.map((x, i) => ({
                  amount: x.amount,
                  numbers: x.numbers.map((x) => Number(x)),
                  owner: x.owner,
                  funds: totalShares
                    ? (roundBank * ticketsShares[i]) /
                      ((totalShares * 103n) / 100n)
                    : 0n,
                  claimed: roundInfo.claimStatuses[i],
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
      } catch (e) {
        console.log('Got error while processing', roundInfo);
        console.log('Exact error', e);
      }
    }
  }
}
