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
import { StatusesData } from '../schema/statuses.schema.js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';
import { PromoQueueData } from '../schema/promo-queue.schema.js';

interface ITicket {
  owner: string;
  numbers: number[];
  amount: number;
}

interface ITicketExtend {
  ticket: ITicket;
  round: number;
}

type GiftCodeExtended = GiftCodesData & {
  requestDetails: PromoQueueData[];
};

type PromoQueueExtended = PromoQueueData & {
  giftCodeDetails: GiftCodesData;
};

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
    @InjectModel(StatusesData.name, 'questDb')
    private statusesData: Model<StatusesData>,
    @InjectModel(GiftCodesData.name)
    private giftCodesData: Model<GiftCodesData>,
    @InjectModel(PromoQueueData.name)
    private promoQueueData: Model<PromoQueueData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async getUpdatedTicketUsersInfo() {
    const allEvents = await this.minaEventData.find({
      type: { $in: ['buy-ticket', 'get-reward'] },
    });

    const allUniqueUsers = allEvents
      .map((event) => (event.event.data['ticket'] as ITicket).owner)
      .filter((value, index, array) => array.indexOf(value) === index);

    return { allUniqueUsers, allEvents };
  }

  async getUpdatedGiftCodeUser() {
    // const allGiftCodes = await this.giftCodesData.find({});

    const allGiftCodes = (await this.giftCodesData
      .aggregate([
        {
          $lookup: {
            from: 'promo_tickets_queue',
            localField: 'code',
            foreignField: 'giftCode',
            as: 'requestDetails',
          },
        },
        // {
        //   $unwind: '$requestDetails',
        // },
      ])
      .exec()) as GiftCodeExtended[];

    const giftCodesUsers = allGiftCodes.map((code) => code.userAddress);

    const allGiftCodesRequests = (await this.promoQueueData
      .aggregate([
        {
          $lookup: {
            from: 'gift-codes',
            localField: 'giftCode',
            foreignField: 'code',
            as: 'giftCodeDetails',
          },
        },
        {
          $unwind: '$giftCodeDetails',
        },
      ])
      .exec()) as PromoQueueExtended[];

    // const allGitCodesRequests = await this.promoQueueData.find({});

    const requestUsers = allGiftCodesRequests.map(
      (request) => request.userAddress,
    );

    const uniqueUsers = [...giftCodesUsers, ...requestUsers].filter(
      (value, index, array) => array.indexOf(value) === index,
    );

    return { uniqueUsers, allGiftCodes, allGiftCodesRequests };
  }

  async ticketTaskProcess(user: string, userEvents: MinaEventData[]) {
    this.logger.debug('Updating info for user', user);

    const userTickets = userEvents.map((event) => {
      return {
        round: event.round,
        ticket: event.event.data['ticket'] as ITicket,
      };
    });

    const prevData = await this.questData.findOne({
      address: user,
    });

    const firstTicketBought =
      userTickets.length > 0 || !!prevData?.firstTicketBought;
    const twoSameTicketsBought =
      !!userTickets.find((elem) => +elem.ticket.amount > 1) ||
      !!prevData?.twoSameTicketsBought;

    const twoDifferentTicketBought =
      twoDifferentTicketsCheck(userTickets) ||
      !!prevData?.twoDifferentTicketBought;

    const wonInRound =
      userEvents.filter((event) => event.type == 'get-reward').length > 0 ||
      !!prevData?.wonInRound;

    const playedIn3Rounds =
      userEvents
        .filter((event) => event.type == 'buy-ticket')
        .map((event) => event.round)
        .filter((value, index, array) => array.indexOf(value) === index)
        .length >= 3 || !!prevData?.playedIn3Rounds;

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

    await this.statusesData.updateOne(
      { address: user },
      {
        $set: {
          [`statuses.${'LOTTERY GAME'}.1`]: firstTicketBought,
          [`statuses.${'LOTTERY GAME'}.2`]: twoSameTicketsBought,
          [`statuses.${'LOTTERY GAME'}.3`]: twoDifferentTicketBought,
          [`statuses.${'LOTTERY GAME'}.4`]: wonInRound,
          [`statuses.${'LOTTERY GAME'}.5`]: playedIn3Rounds,
        },
        $inc: {
          [`counter.${'LOTTERY GAME'}.1`]: firstTicketBought ? 1 : 0,
          [`counter.${'LOTTERY GAME'}.2`]: twoSameTicketsBought ? 1 : 0,
          [`counter.${'LOTTERY GAME'}.3`]: twoDifferentTicketBought ? 1 : 0,
          [`counter.${'LOTTERY GAME'}.4`]: wonInRound ? 1 : 0,
          [`counter.${'LOTTERY GAME'}.5`]: playedIn3Rounds ? 1 : 0,
        },
      },
      {
        upsert: true,
      },
    );
  }

  async giftCodeTaskProcess(
    user: string,
    giftCodes: GiftCodeExtended[],
    buyRequests: PromoQueueExtended[],
  ) {
    // if (giftCodes.length > 0) {
    //   console.log(giftCodes);
    //   console.log(buyRequests);
    // }

    if (buyRequests.length > 0) {
      console.log(buyRequests);
      console.log(
        buyRequests.map((request) => request.giftCodeDetails.userAddress),
      );
    }

    const prevData = await this.questData.findOne({
      address: user,
    });

    const generatedGiftCode =
      giftCodes.length > 0 || !!prevData?.generatedGiftCode;
    const usedGiftCode =
      buyRequests.filter(
        (request) =>
          request.userAddress === request.giftCodeDetails.userAddress,
      ).length > 0 || !!prevData?.usedGiftCode;
    const generated2GiftCodes =
      giftCodes.length > 1 || !!prevData?.generated2GiftCodes;
    const boughtGiftCodeRedeemed =
      giftCodes.filter(
        (giftCode) =>
          giftCode.requestDetails[0] &&
          giftCode.userAddress !== giftCode.requestDetails[0].userAddress,
      ).length > 0 || !!prevData?.boughtGiftCodeRedeemed;
    const usedGiftCodeGeneratedByOtherUser =
      buyRequests.filter(
        (request) =>
          request.userAddress !== request.giftCodeDetails.userAddress,
      ).length > 0 || !!prevData?.usedGiftCodeGeneratedByOtherUser;

    await this.questData.updateOne(
      {
        address: user,
      },
      {
        $set: {
          address: user,
          boughtGiftCodes: giftCodes.map((code) => code.code),
          usedGiftCodes: buyRequests.map((request) => request.giftCode),
          generatedGiftCode,
          usedGiftCode,
          generated2GiftCodes,
          boughtGiftCodeRedeemed,
          usedGiftCodeGeneratedByOtherUser,
        },
      },
      { upsert: true },
    );

    console.log(`Updating address: ${user}`);

    await this.statusesData.updateOne(
      { address: user },
      {
        $set: {
          [`statuses.${'GIFT CODE MECHANISM'}.1`]: generatedGiftCode,
          [`statuses.${'GIFT CODE MECHANISM'}.2`]: usedGiftCode,
          [`statuses.${'GIFT CODE MECHANISM'}.3`]: generated2GiftCodes,
          [`statuses.${'GIFT CODE MECHANISM'}.4`]: boughtGiftCodeRedeemed,
          [`statuses.${'GIFT CODE MECHANISM'}.5`]:
            usedGiftCodeGeneratedByOtherUser,
        },
        $inc: {
          [`counter.${'GIFT CODE MECHANISM'}.1`]: generatedGiftCode ? 1 : 0,
          [`counter.${'GIFT CODE MECHANISM'}.2`]: usedGiftCode ? 1 : 0,
          [`counter.${'GIFT CODE MECHANISM'}.3`]: generated2GiftCodes ? 1 : 0,
          [`counter.${'GIFT CODE MECHANISM'}.4`]: boughtGiftCodeRedeemed
            ? 1
            : 0,
          [`counter.${'GIFT CODE MECHANISM'}.5`]:
            usedGiftCodeGeneratedByOtherUser ? 1 : 0,
        },
      },
      {
        upsert: true,
      },
    );
  }

  // #TODO consider updating it by api
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    try {
      const { allUniqueUsers, allEvents } =
        await this.getUpdatedTicketUsersInfo();
      for (let i = 0; i < allUniqueUsers.length; i++) {
        const user = allUniqueUsers[i];
        const userEvents = allEvents.filter(
          (event) => (event.event.data['ticket'] as ITicket).owner === user,
        );

        await this.ticketTaskProcess(user, userEvents);
      }

      const { uniqueUsers, allGiftCodes, allGiftCodesRequests } =
        await this.getUpdatedGiftCodeUser();

      for (let i = 0; i < uniqueUsers.length; i++) {
        const user = uniqueUsers[i];
        const userGiftCodes = allGiftCodes.filter(
          (giftCode) => giftCode.userAddress === uniqueUsers[i],
        );

        const userGiftCodeRequests = allGiftCodesRequests.filter(
          (request) =>
            request.userAddress === user && request.giftCodeDetails.used,
        );

        await this.giftCodeTaskProcess(
          user,
          userGiftCodes,
          userGiftCodeRequests,
        );
      }

      // const allEvents = await this.minaEventData.find({
      //   type: { $in: ['buy-ticket', 'get-reward'] },
      // });

      // const allUniqueOwners = allEvents
      //   .map((event) => (event.event.data['ticket'] as ITicket).owner)
      //   .filter((value, index, array) => array.indexOf(value) === index);
    } catch (e) {
      this.logger.error('Error', e.stack);
    }
  }
}
