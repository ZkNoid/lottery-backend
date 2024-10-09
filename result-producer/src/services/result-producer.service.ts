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
import {
  BLOCK_PER_ROUND,
  MerkleMap20Witness,
  NumberPacked,
  PLottery,
  TICKET_PRICE,
} from 'l1-lottery-contracts';
import { ConfigService } from '@nestjs/config';
import { MurLock, MurLockService } from 'murlock';
import { RoundsData } from '../schemas/rounds.schema';
import { lastValueFrom, timeout } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { fetchAccount, Field, Mina, PrivateKey, PublicKey, UInt32 } from 'o1js';
import { NETWORKS } from '../constants/networks';
import { LOTTERY_ADDRESS } from '../constants/addresses';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class ResultProducerService implements OnModuleInit {
  private readonly logger = new Logger(ResultProducerService.name);

  async checkRoundConditions(roundId: number) {
    const lotteryCommonInfo = await lastValueFrom(
      this.rabbitClient
        .send({ cmd: 'get-common-info' }, {})
        .pipe(timeout(5000)),
    );

    console.log('Result', lotteryCommonInfo);
    // const data = await result.subscribe();

    if (!lotteryCommonInfo) return;

    const currentRoundId = lotteryCommonInfo.currentRoundId;
    const lastReduceInRound = lotteryCommonInfo.lastReduceInRound;

    const roundInfo = await lastValueFrom(
      this.rabbitClient
        .send({ cmd: 'get-round-info' }, roundId)
        .pipe(timeout(5000)),
    );

    const winningCombination = roundInfo.winningCombination as number[];

    this.logger.debug(
      `Round ${roundId} result: ${winningCombination} last reduce ${lastReduceInRound}`,
    );

    return (
      roundId < lastReduceInRound && winningCombination.every((x) => x == 0)
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.murLockService.runWithLock(
      'resultLockKey',
      60 * 1000,
      async () => {
        await this.produceResult();
      },
    );
  }

  async produceResult() {
    const lotteryCommonInfo = await lastValueFrom(
      this.rabbitClient
        .send({ cmd: 'get-common-info' }, {})
        .pipe(timeout(5000)),
    );

    console.log('Result', lotteryCommonInfo);
    // const data = await result.subscribe();

    if (!lotteryCommonInfo) return;

    const currentRoundId = lotteryCommonInfo.currentRoundId;
    const lastReduceInRound = lotteryCommonInfo.lastReduceInRound;

    // console.log('Initial in reduce proving', this.stateManager.inReduceProving);
    // if (this.stateManager.inReduceProving) return;
    // console.log('Then in reduce proving', this.stateManager.inReduceProving);
    // this.stateManager.inReduceProving = true;
    // console.log('After in reduce proving', this.stateManager.inReduceProving);

    try {
      // this.logger.debug(
      //   'StateSinglton state',
      //   this.stateManager.initialized,
      //   this.stateManager.stateInitialized,
      // );

      this.logger.debug('Current round id', currentRoundId);

      for (let roundId = 0; roundId < currentRoundId; roundId++) {
        if (await this.checkRoundConditions(roundId)) {
          this.logger.debug('Producing result', roundId);

          const updateResult = await lastValueFrom(
            this.rabbitClient
              .send({ cmd: 'update-result' }, roundId)
              .pipe(timeout(5000)),
          );
          console.log('Update result', updateResult)
          const [resultWitness, bankValue, bankWitness] = [
            MerkleMap20Witness.fromJSON(updateResult.resultWitness),
            Field.from(updateResult.bankValue),
            MerkleMap20Witness.fromJSON(updateResult.bankWitness),
          ];

          console.log('Deserialized data', resultWitness, bankValue, bankWitness);

          const network = NETWORKS[this.configService.getOrThrow('NETWORK_ID')];

          const lottery = new PLottery(
            PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
          );
          await fetchAccount({
            publicKey: lottery.address,
          });

          // console.log(`Digest: `, await MockLottery.digest());
          const sender = PrivateKey.fromBase58(process.env.PK);
          this.logger.debug('Tx init');

          const randomCombilation = Array.from({ length: 6 }, () =>
            randomIntFromInterval(1, 9),
          );
          this.logger.log('Setting combination', randomCombilation);
  
          let tx = await Mina.transaction(
            { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
            async () => {
              await lottery.produceResult(
                resultWitness as MerkleMap20Witness,
                NumberPacked.pack(randomCombilation.map((x) => UInt32.from(x))),
                bankValue,
                bankWitness as MerkleMap20Witness,
              );
            },
          );
          this.logger.debug('Proving tx');
          await tx.prove();
          this.logger.debug('Proved tx');
          let txResult = await tx.sign([sender]).send();

          this.logger.debug(`Tx successful. Hash: `, txResult.hash);
          this.logger.debug('Waiting for tx');
          await txResult.wait();
        }
      }
    } catch (e) {
      this.logger.error('Error', e.stack);
    }
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
