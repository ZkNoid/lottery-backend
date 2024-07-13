import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import {
  BaseEventDocument,
  MinaEventData,
  MinaEventDocument,
} from '../schema/events.schema';
import { Model } from 'mongoose';

@Injectable()
export class SyncEventsService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
  ) {}
  async onApplicationBootstrap() {
    await StateSinglton.initialize();
    await this.handleCron();
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron() {
    console.log('Events sync');
    for (let network of ALL_NETWORKS) {
      const dbEvents = await this.minaEventData.find({});
      const lastEvent = await this.minaEventData.findOne({}).sort({ _id: -1 });

      const events = await StateSinglton.fetchEvents(
        network.networkID,
        lastEvent ? lastEvent.blockHeight : 0,
      );

      const tickets = await StateSinglton.lottery[network.networkID].reducer.fetchActions();

      let fetchedEvents = events.map(
        (x) =>
          new this.minaEventData({
            type: x.type,
            event: {
              data: x.event.data,
              transactionInfo: {
                transactionHash: x.event.transactionInfo.transactionHash,
                transactionMemo: x.event.transactionInfo.transactionMemo,
                transactionStatus: x.event.transactionInfo.transactionStatus,
              },
            },
            blockHeight: x.blockHeight,
            blockHash: x.blockHash,
            parentBlockHash: x.parentBlockHash,
            globalSlot: x.globalSlot,
            chainStatus: x.chainStatus,
          }),
      );

      console.log('New events', events);

      const eventsToVerifyUncles = fetchedEvents.filter((x) =>
        lastEvent ? x.blockHeight == lastEvent.blockHeight : false,
      );
      const newFetchedEvents = fetchedEvents.filter((x) =>
        lastEvent ? x.blockHeight > lastEvent.blockHeight : true,
      );

      if (lastEvent && eventsToVerifyUncles.length == 0) {
        await this.minaEventData.deleteMany({
          blockHeight: lastEvent.blockHeight,
        });
      }

      await this.minaEventData.insertMany(newFetchedEvents);

      const allEvents = [...dbEvents, ...newFetchedEvents];

      if (
        newFetchedEvents.length > 0 ||
        !StateSinglton.stateInitialized[network.networkID]
      )
        StateSinglton.initState(network.networkID, allEvents);
    }
  }
}
