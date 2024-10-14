import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { Field, Mina, PrivateKey, fetchAccount } from 'o1js';
import {
  BLOCK_PER_ROUND,
  Ticket,
  ZkOnCoordinatorAddress,
} from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';
import { getCurrentSlot } from '../../lib.js';
import { Model } from 'mongoose';
import { CommitData } from '../schema/commits.schema.js';
import { CommitValue } from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { InjectModel } from '@nestjs/mongoose';
import { MinaEventData } from '../schema/events.schema.js';
import { QuestData } from '../schema/quest.schema.js';

interface ITicket {
  owner: string;
  numbers: number[];
  amount: number;
}

interface ITicketExtend {
  ticket: ITicket;
  round: number;
}

const twoDifferentTicketsCheck = (tickets: ITicketExtend[]) => {
  for (const ticket of tickets) {
    const sameRoundTickets = tickets.filter(
      (elem) => elem.round == ticket.round,
    );
    if (sameRoundTickets.length > 1) {
      const uniqueCombinations = sameRoundTickets
        .map((ticket) => ticket.ticket.numbers.map((v) => +v))
        .map((numbers) => numbers.join());
      if (uniqueCombinations.length > 1) {
        return true;
      }
    }
  }

  return false;
};

@Injectable()
export class QuestUpdateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QuestUpdateService.name);

  constructor(
    @InjectModel(QuestData.name)
    private questData: Model<QuestData>,
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  // #TODO consider updating it by api
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    for (let network of ALL_NETWORKS) {
      try {
        const allEvents = await this.minaEventData.find({
          type: { $in: ['buy-ticket', 'get-reward'] },
        });

        const allUniqueOwners = allEvents
          .map((event) => (event.event.data['ticket'] as ITicket).owner)
          .filter((value, index, array) => array.indexOf(value) === index);

        for (const user of allUniqueOwners) {
          this.logger.debug('Updating info for user', user);

          const userEvents = allEvents.filter(
            (event) => (event.event.data['ticket'] as ITicket).owner === user,
          );

          const userTickets = userEvents.map((event) => {
            return {
              round: event.round,
              ticket: event.event.data['ticket'] as ITicket,
            };
          });

          const firstTicketBought = userTickets.length > 0;
          const twoSameTicketsBought = !!userTickets.find(
            (elem) => +elem.ticket.amount > 1,
          );

          const twoDifferentTicketBought =
            twoDifferentTicketsCheck(userTickets);

          const wonInRound =
            userEvents.filter((event) => event.type == 'get-reward').length > 0;

          const playedIn3Rounds =
            userEvents
              .filter((event) => event.type == 'buy-ticket')
              .map((event) => event.round)
              .filter((value, index, array) => array.indexOf(value) === index)
              .length >= 3;

          const userData = new this.questData({
            address: user,
            userEvents,
            firstTicketBought,
            twoSameTicketsBought,
            twoDifferentTicketBought,
            wonInRound,
            playedIn3Rounds,
          });

          delete userData._id;

          await this.questData.updateOne(
            {
              address: user,
            },
            {
              $set: {
                address: user,
                userEvents,
                firstTicketBought,
                twoSameTicketsBought,
                twoDifferentTicketBought,
                wonInRound,
                playedIn3Rounds,
              },
            },
            { upsert: true },
          );
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }
  }
}
