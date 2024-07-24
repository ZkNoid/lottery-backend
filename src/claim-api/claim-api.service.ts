import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
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
import { RoundsData } from '../workers/schema/rounds.schema';
import { error } from 'console';

@Injectable()
export class ClaimApiService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async getClaimData(
    roundId: number,
    networkID: string,
    ticketNums: number[],
    senderAccount: string,
    amount: number,
  ) {
    const stateM = StateSinglton.state[networkID];
    const ticket = Ticket.from(
      ticketNums,
      PublicKey.fromBase58(senderAccount),
      amount,
    );
    const round = await this.rounds.findOne({ roundId });

    const rp = await stateM.getReward(roundId, ticket, round.dp);

    return {
      rp
    };
  }
}
