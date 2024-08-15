import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lastValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { NETWORKS } from './constants/networks';
import { ConfigService } from './services/config/config.service';
import { MinaEventData } from './schemas/events.schema';
import { Model } from 'mongoose';

const BLOCK_UPDATE_DEPTH = 6;

@Controller()
export class EventsSyncController {
  private readonly logger = new Logger(EventsSyncController.name);

  constructor(
    @Inject('SM_SERVICE') private readonly stateManagerService: ClientProxy,
    private readonly httpService: HttpService,
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
    private configService: ConfigService
  ) {}
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    const network = NETWORKS[this.configService.get('networkId')];


    // if (this.stateManager.inReduceProving) {
    //   console.log('It will kill reduce. Do not do it');
    //   return;
    // }

    /**
     * 
     *     
    const events = 
     */

    try {
      console.log('Events sync');
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

      // const dbEvents = await this.minaEventData.find({});
      const lastEvent = await this.minaEventData.findOne({}).sort({ _id: -1 });

      const updateEventsFrom = lastEvent
        ? lastEvent.blockHeight - BLOCK_UPDATE_DEPTH
        : 0;

      const events = await lastValueFrom(
        this.stateManagerService.send('fetch_events', 0).pipe(timeout(30_000)),
      );;

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

      /*
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

        for (const newFetchedEvent of newFetchedEvents) {
          await this.minaEventData.updateOne(
            {
              'event.transactionInfo.transactionHash':
                newFetchedEvent.event.transactionInfo.transactionHash,
            },
            {
              $set: newFetchedEvent,
            },
            {
              upsert: true,
            },
          );
        }
        */

      let eventsToBeDeleted = await this.minaEventData.find({
        blockHeight: { $gte: updateEventsFrom },
      });

      let eventsIdForDelete = [];

      let deleteStartIndex = 0;
      // Find equal prefix of eventsToBeDeleted and fetchedEvents. We can ommit it
      for (; deleteStartIndex < eventsToBeDeleted.length; deleteStartIndex++) {
        let dbEvent = eventsToBeDeleted[deleteStartIndex];
        let nodeEvent = fetchedEvents[deleteStartIndex];

        if (
          dbEvent.event.transactionInfo.transactionHash !==
          nodeEvent.event.transactionInfo.transactionHash
        ) {
          break;
        }
      }

      eventsIdForDelete = eventsToBeDeleted
        .slice(deleteStartIndex)
        .map((event) => event._id);
      eventsToBeDeleted = eventsToBeDeleted.slice(deleteStartIndex);
      const newEventsToAdd = fetchedEvents.slice(deleteStartIndex);

      // Removing old event and adding new events to mongodb
      await this.minaEventData.deleteMany({
        _id: { $in: eventsIdForDelete },
      });

      for (const eventToAdd of newEventsToAdd) {
        await this.minaEventData.updateOne(
          {
            'event.transactionInfo.transactionHash':
              eventToAdd.event.transactionInfo.transactionHash,
          },
          {
            $set: eventToAdd,
          },
          {
            upsert: true,
          },
        );
      }

      // Update state if not initially updated or if there are new events
      if (
        !this.stateManager.stateInitialized[network.networkID] ||
        newEventsToAdd
      ) {
        const allEvents = await this.minaEventData.find({});
        await this.stateManager.initState(network.networkID, allEvents);
      } else {
        // await this.stateManager.undoLastEvents(
        //   network.networkID,
        //   eventsToBeDeleted,
        //   this.stateManager.state[network.networkID],
        // );
        // await this.stateManager.initState(
        //   network.networkID,
        //   newEventsToAdd,
        //   this.stateManager.state[network.networkID],
        // );
        // this.stateManager.updateProcessedTicketData(
        //   this.stateManager.state[network.networkID],
        // );
      }
      console.log(
        `Curr slot ${slotSinceGenesis}. \
          Start block: ${Number(
            this.stateManager.lottery[network.networkID].startBlock.get(),
          )}`,
      );
      const currentRoundId = Math.floor(
        (slotSinceGenesis -
          Number(
            this.stateManager.lottery[network.networkID].startBlock.get(),
          )) /
          BLOCK_PER_ROUND,
      );

      this.stateManager.blockHeight[network.networkID] = currBlockHeight;
      this.stateManager.slotSinceGenesis[network.networkID] = slotSinceGenesis;
      this.stateManager.roundIds[network.networkID] = currentRoundId;
    } catch (e) {
      console.log('Events sync error', e.stack);
    }
  }
}
