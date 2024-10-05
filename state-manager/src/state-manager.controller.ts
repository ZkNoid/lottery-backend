import { Controller, OnModuleInit } from '@nestjs/common';

import { StateService } from './services/state-manager.service';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';
import { NETWORKS } from './constants/networks';
import { InjectModel } from '@nestjs/mongoose';
import { MinaEventData } from './schemas/events.schema';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { BLOCK_PER_ROUND } from 'l1-lottery-contracts';
import { ConfigService } from '@nestjs/config';

const BLOCK_UPDATE_DEPTH = 6;

@Controller()
export class StateManagerController {
  constructor(
    private stateManager: StateService,
    private configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
  ) {}

  @MessagePattern('fetch_events')
  async fetchEvents(startBlock: number = 0): Promise<object[]> {
    console.log('Fetching events');
    console.log('Fetching events', startBlock);

    return await this.stateManager.fetchEvents(startBlock);
  }

  @MessagePattern({ cmd: 'update' })
  async update(@Ctx() context: RmqContext) {
    console.log('Updating');

    if (this.stateManager.inReduceProving) {
      console.log('It will kill reduce. Do not do it');
      return;
    }

    const network = NETWORKS[this.configService.get('networkId')];

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

      const events = await this.stateManager.fetchEvents(
        lastEvent ? updateEventsFrom : 0,
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
        !this.stateManager.stateInitialized ||
        newEventsToAdd
      ) {
        const allEvents = await this.minaEventData.find({});
        await this.stateManager.initState(allEvents);
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
