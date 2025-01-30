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
  constructor(private stateManager: StateService) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async getBuyData(
    ticketNums: number[],
    senderAccount: string,
    amount: number,
  ) {
    const currentRoundId = await this.stateManager.getCurrentRound();
    const stateM = this.stateManager.state;
    const sender = PublicKey.fromBase58(senderAccount);
    const ticket = Ticket.from(
      ticketNums,
      PublicKey.fromBase58(senderAccount),
      amount,
    );

    console.log(`Round: ${currentRoundId.toString()}`);

    let tx;

    await this.stateManager.cloudProvingMutex.runExclusive(async () => {
      if (!stateM.plotteryManagers[currentRoundId]) {
        console.log(
          `No contract for round ${currentRoundId} found. Fetching rounds`,
        );
        await this.stateManager.fetchRounds();
      }

      tx = await Mina.transaction(
        { sender, memo: 'ZkNoid: Buy Ticket', fee: Number('0.01') * 1e9 },
        async () => {
          await stateM.plotteryManagers[currentRoundId].contract!.buyTicket!(
            ticket,
          );
        },
      );

      await tx.prove();
    });

    return {
      txJson: tx.toJSON(),
    };
  }
}
