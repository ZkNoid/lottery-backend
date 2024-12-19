import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  UInt32,
  fetchLastBlock,
} from 'o1js';
import { HttpService } from '@nestjs/axios';
import { BLOCK_PER_ROUND, NumberPacked, Ticket } from 'l1-lottery-contracts';
import { RoundsData } from '../workers/schema/rounds.schema.js';
import { error } from 'console';
import { StateService } from '../state-service/state.service.js';

@Injectable()
export class BuyApiService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async getBuyData(
    roundId: number,
    ticketNums: number[],
    senderAccount: string,
    amount: number,
  ) {
    const stateM = this.stateManager.state;
    const sender = PublicKey.fromBase58(senderAccount);
    const ticket = Ticket.from(
      ticketNums,
      PublicKey.fromBase58(senderAccount),
      amount,
    );

    let tx = await Mina.transaction(sender, async () => {
      await stateM.plotteryManagers[roundId].contract!.buyTicket!(ticket);
    });

    await tx.prove();

    return {
      txJson: tx.toJSON(),
    };
  }
}
