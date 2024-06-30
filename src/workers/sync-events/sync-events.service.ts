import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import {
  BaseEventDocument,
  MinaEventData,
  MinaEventDocument,
} from '../schema/events.schema';
import { Model } from 'mongoose';
import { SyncStateData } from '../schema/sync-state.schema';

@Injectable()
export class SyncEventsService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
    @InjectModel(SyncStateData.name)
    private syncState: Model<SyncStateData>,
  ) {}
  async onApplicationBootstrap() {
    await StateSinglton.initialize();
    await this.handleCron();
  }

  @Cron('45 * * * * *')
  async handleCron() {
    for (let network of ALL_NETWORKS) {
      const dbEvents = await this.minaEventData.find({});
      // console.log('Db events', dbEvents);
      const lastEvent = await this.minaEventData.findOne({}).sort({ _id: -1 });

      const events = await StateSinglton.fetchEvents(
        network.networkID,
        lastEvent ? lastEvent.blockHeight + 1 : 0,
      );

      const newEvents = events.map(
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

      await this.minaEventData.insertMany(newEvents);
      
      const allEvents = [...dbEvents, ...newEvents];

      if (newEvents.length > 0 || !StateSinglton.stateInitialized[network.networkID])
        StateSinglton.initState(network.networkID, allEvents);
    }
  }
}
