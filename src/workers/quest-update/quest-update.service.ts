// import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { ALL_NETWORKS } from '../../constants/networks.js';
// import { Field, Mina, PrivateKey, fetchAccount } from 'o1js';
// import {
//   BLOCK_PER_ROUND,
//   Ticket,
//   ZkOnCoordinatorAddress,
// } from 'l1-lottery-contracts';
// import { StateService } from '../../state-service/state.service.js';
// import { getCurrentSlot } from '../../lib.js';
// import { Model } from 'mongoose';
// import { CommitData } from '../schema/commits.schema.js';
// import { CommitValue } from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
// import { InjectModel } from '@nestjs/mongoose';
// import { MinaEventData } from '../schema/events.schema.js';

// @Injectable()
// export class QuestUpdateService implements OnApplicationBootstrap {
//   private readonly logger = new Logger(QuestUpdateService.name);
//   private isRunning = false;
//   private lastCommitInRound = process.env.START_FROM_ROUND
//     ? +process.env.START_FROM_ROUND
//     : 0;

//   constructor(
//     private stateManager: StateService,
//     @InjectModel(CommitData.name)
//     private commitData: Model<CommitData>,
//     @InjectModel(MinaEventData.name)
//     private minaEventData: Model<MinaEventData>,
//   ) {}

//   async onApplicationBootstrap() {
//     // await this.handleCron();
//   }

//   // #TODO consider updating it by api
//   @Cron(CronExpression.EVERY_MINUTE)
//   async handleCron() {
//     for (let network of ALL_NETWORKS) {
//       try {
//         const allEvents = await this.minaEventData.find({
//           type: { $in: ['buy-ticket', 'get-reward'] },
//         });

//         const allUniqueOwners = allEvents
//           .map((event) =>
//             (event.event.data['ticket'] as Ticket).owner.toBase58(),
//           )
//           .filter((value, index, array) => array.indexOf(value) === index);

//         for (const user of allUniqueOwners) {
//           const userEvents = allEvents.filter(
//             (event) =>
//               (event.event.data['ticket'] as Ticket).owner.toBase58() === user,
//           );

//           const userTickets = userEvents.map(
//             (event) => {return {round: event.round, ticket: event.event.data['ticket'] as Ticket}},
//           );

//           const firstTicketBought = userTickets.length > 0;
//           const twoSameTicketsBought = userTickets.find(
//             (elem) => +elem.ticket.amount > 1,
//           );

//           const twoDifferentTicketsCheck = (tickets: Ticket[]) => {
//             for (const ticket of tickets) {
//               if (tickets.filter(elem =>))
//             }
//           }

//           const twoDifferentTicketsBought =

//           const userRewards = userEvents
//             .filter((event) => event.type === 'get-reward')
//             .map((event) => event.event.data['rp']);

//           const userRewardSum = userRewards.reduce(
//             (acc, reward) => acc + reward,
//             0,
//           );

//           const userQuests = userEvents
//             .filter((event) => event.type === 'buy-ticket')
//             .map((event) => event.event.data['quest']);

//           const userQuestsSum = userQuests.reduce(
//             (acc, quest) => acc + quest,
//             0,
//           );

//           const userQuestsSumWithReward = userQuestsSum + userRewardSum;

//           console.log(
//             `User: ${user}. Quests: ${userQuestsSum}. Reward: ${userRewardSum}. Total: ${userQuestsSumWithReward}`,
//           );

//           // #TODO update user
//         }
//       } catch (e) {
//         this.logger.error('Error', e.stack);
//       }
//     }
//   }
// }
