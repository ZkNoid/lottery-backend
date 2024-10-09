import {
  ClientProxy,
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { DistributionProof } from 'l1-lottery-contracts/build/src/DistributionProof';
import { Mina, Cache, PublicKey, UInt32, fetchAccount, Field } from 'o1js';
import {
  COMMISION,
  DistibutionProgram,
  PLottery,
  PRESICION,
  PStateManager,
  Ticket,
  TicketReduceProgram,
  getNullifierId,
} from 'l1-lottery-contracts';
import { LOTTERY_ADDRESS } from '../constants/addresses';
import { MinaEventDocument } from '../schemas/events.schema';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { NETWORKS } from '../constants/networks';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { timeout } from 'rxjs';

@Injectable()
export class DataUpdaterService implements OnModuleInit {
  constructor(
    @Inject('STATE_MANAGER_SERVICE') private rabbitClient: ClientProxy,
  ) {}
  async onModuleInit() {
    await this.rabbitClient.connect();
  }

  async onApplicationBootstrap() {
    await this.handleCron();
    }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    console.log('UPDATING')
    const result = await this.rabbitClient.send({ cmd: 'update' }, {});
    await result.subscribe();
  }
}
