import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import { MinaEventData } from '../schema/events.schema';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class SyncEventsService implements OnApplicationBootstrap {
  constructor(
    private readonly httpService: HttpService,
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
  ) {}
  async onApplicationBootstrap() {
    await StateSinglton.initialize();
    await this.handleCron();
    console.log('Initizlied');
  }

  running = false;

  @Interval('events_sync', 5_000)
  async handleCron() {
    if (this.running) return;
    this.running = true;

    try {
      console.log('Events sync');
      for (let network of ALL_NETWORKS) {
        const data = await this.httpService.axiosRef.post(
          network.graphql,
          JSON.stringify({
            query: `
        query {
          bestChain(maxLength:1) {
            protocolState {
              consensusState {
                blockHeight,
                slotSinceGenesis
              }
            }
          }
        }
      `,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            responseType: 'json',
          },
        );
        const slotSinceGenesis =
          data.data.data.bestChain[0].protocolState.consensusState
            .slotSinceGenesis;

        const currBlockHeight =
          data.data.data.bestChain[0].protocolState.consensusState.blockHeight;

        const dbEvents = await this.minaEventData.find({});
        const lastEvent = await this.minaEventData
          .findOne({})
          .sort({ _id: -1 });

        const events = await StateSinglton.fetchEvents(
          network.networkID,
          lastEvent ? lastEvent.blockHeight : 0,
        );

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

        // Events that was previously recorded from archive node. If they're dropped, they was orphaned
        const eventsToVerifyUncles = fetchedEvents.filter((x) =>
          lastEvent ? x.blockHeight == lastEvent.blockHeight : false,
        );
        // New events that are not uncles
        const newFetchedEvents = fetchedEvents.filter((x) =>
          lastEvent ? x.blockHeight > lastEvent.blockHeight : true,
        );

        // If saved events are not presented in archive node response, removing them from db
        if (lastEvent && eventsToVerifyUncles.length == 0) {
          await this.minaEventData.deleteMany({
            blockHeight: lastEvent.blockHeight,
          });
        }

        // Adding new events to mongodb
        await this.minaEventData.insertMany(newFetchedEvents);

        const allEvents = [...dbEvents, ...newFetchedEvents];

        // Update state if not initially updated or if there are new events
        if (
          newFetchedEvents.length > 0 ||
          !StateSinglton.stateInitialized[network.networkID]
        )
          StateSinglton.initState(network.networkID, allEvents);

        StateSinglton.blockHeight[network.networkID] = currBlockHeight;
        StateSinglton.slotSinceGenesis[network.networkID] = slotSinceGenesis;
      }
    } catch (e) {
      console.log('Events sync error', e);
    }
    this.running = false;
  }
}
