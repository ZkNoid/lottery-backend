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
import { BLOCK_PER_ROUND, PLottery, TICKET_PRICE } from 'l1-lottery-contracts';
import { ConfigService } from '@nestjs/config';
import { MurLock, MurLockService } from 'murlock';
import { RoundsData } from '../schemas/rounds.schema';
import { lastValueFrom, timeout } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { fetchAccount, Mina, PrivateKey, PublicKey } from 'o1js';
import { NETWORKS } from '../constants/networks';
import { LOTTERY_ADDRESS } from '../constants/addresses';


@Injectable()
export class RoundsInfoUpdaterService implements OnModuleInit {
  private readonly logger = new Logger(RoundsInfoUpdaterService.name);

  async checkConditions() {
    const result = await lastValueFrom(
      this.rabbitClient
        .send({ cmd: 'get-common-info' }, {})
        .pipe(timeout(5000)),
    );

    console.log('Result', result);
    // const data = await result.subscribe();

    if (!result) return;

    const currentRoundId = result.currentRoundId;

    const lastReduceInRound = result.lastReduceInRound;

    this.logger.debug(
      'Current round id',
      currentRoundId,
      'ttr',
      lastReduceInRound,
    );

    // Checking that at least one ticket bought after the last reduce round
    let ticketBoughtAfterReduce = false;

    for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
      console.log('Processing round', i)

      const roundInfo = await lastValueFrom(
        this.rabbitClient
          .send({ cmd: 'get-round-info' }, i)
          .pipe(timeout(5000)),
      );

      console.log('Processed round', i)

      if (roundInfo.boughtTickets.length > 0) {
        this.logger.debug(`Found ticket in round ${i}`);
        ticketBoughtAfterReduce = true;
        break;
      }
    }

    if (lastReduceInRound < currentRoundId && !ticketBoughtAfterReduce) {
      this.logger.debug('No tickets bought in the round');
    }
    return lastReduceInRound < currentRoundId && ticketBoughtAfterReduce;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.murLockService.runWithLock('reduceProofLockKey', 60 * 1000, async () => {
      await this.proveReduce();
    })
  }
  async proveReduce() {
    try {
      this.logger.debug('REDUCE PROVING');
      if (await this.checkConditions()) {
        this.logger.debug('Time to reduce');
        const sender = PrivateKey.fromBase58(process.env.PK);

        const reduceProofJson = await lastValueFrom(
          this.rabbitClient
            .send({ cmd: 'generate-reduce-proof' }, {})
            .pipe(timeout(20_000)),
        );

        // Reduce tickets
        let reduceProof = reduceProofJson;  // generate-reduce-proof
        console.log('Received proof', reduceProof);
        this.logger.debug(
          'Reduce proof',
          'initial state',
          reduceProof.publicOutput.initialState.toString(),
          'Final state',
          reduceProof.publicOutput.finalState.toString(),
        );

        const network = NETWORKS[this.configService.getOrThrow('NETWORK_ID')];

        const lottery = new PLottery(
          PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
        );
        await fetchAccount({
          publicKey: lottery.address,
        });

        let tx2_1 = await Mina.transaction(
          { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
          async () => {
            await lottery.reduceTickets(
              reduceProof,
            );
          },
        );
        this.logger.debug('Proving reduce tx');
        await tx2_1.prove();
        this.logger.debug('Proved reduce tx');
        let txResult = await tx2_1.sign([sender]).send();

        this.logger.debug(`Reduce tx successful. Hash: `, txResult.hash);
        this.logger.debug('Waiting for reduce tx');
        await txResult.wait();
      }
    } catch (e) {
      console.error('Error in reduce proving', e);
    }
    // this.stateManager.inReduceProving = false;
  }

  constructor(
    private murLockService: MurLockService,
    private configService: ConfigService,
    @Inject('STATE_MANAGER_SERVICE') private rabbitClient: ClientProxy,
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}

  async onApplicationBootstrap() {
    await this.rabbitClient.connect();
  }

  async onModuleInit() {
    const network = NETWORKS[this.configService.getOrThrow('NETWORK_ID')];
    console.log('Network choosing', network);

    const Network = Mina.Network({
      mina: network?.graphql,
      archive: network?.archive,
    });

    console.log('Network setting');

    Mina.setActiveInstance(Network);
    console.log('Network set');
  }
}
