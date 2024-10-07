import { Controller, OnModuleInit } from '@nestjs/common';
import { StateService } from './services/state-manager.service';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { NETWORKS } from './constants/networks';
import { InjectModel } from '@nestjs/mongoose';
import { MinaEventData } from './schemas/events.schema';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { BLOCK_PER_ROUND, getNullifierId, NumberPacked, Ticket } from 'l1-lottery-contracts';
import { ConfigService } from '@nestjs/config';
import { MurLock, MurLockService } from 'murlock';
import { Field } from 'o1js';

const BLOCK_UPDATE_DEPTH = 6;

@Controller()
export class StateManagerController {
  constructor(
    private stateManager: StateService,
    private configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(MinaEventData.name)
    private minaEventData: Model<MinaEventData>,
    private murLockService: MurLockService,
  ) {}

  @MessagePattern('fetch_events')
  async fetchEvents(startBlock: number = 0): Promise<object[]> {
    console.log('Fetching events');
    console.log('Fetching events', startBlock);

    return await this.stateManager.fetchEvents(startBlock);
  }

  @MessagePattern({cmd: 'get-common-info'})
  async getCommonInfo(@Ctx() context: RmqContext): Promise<{
    currentRoundId: number;
    startBlock: number;
  }> {
    return {
      currentRoundId: this.stateManager.roundIds,
      startBlock: Number(this.stateManager.lottery.startBlock.get().toBigint()),
    };
  }

  @MessagePattern({ cmd: 'get-round-info' })
  getRoundInfo(@Payload() roundId: number, @Ctx() context: RmqContext): {
    currentRoundId: number,
    boughtTickets: {
      amount: number,
      numbers: number[],
      owner: string
    }[],
    claimStatuses: boolean[],
    winningCombination: number[]
  } {
    console.log('Checking roundid', roundId)
    const map = this.stateManager.state.roundResultMap[roundId];

    const winningCombination = NumberPacked.unpackToBigints(
      this.stateManager.state.roundResultMap.get(Field.from(roundId)),
    )
      .map((v) => Number(v))
      .slice(0, 6);

      const claimStatuses = this.stateManager.boughtTickets[roundId].map((x, i) => (
        this.stateManager.state.ticketNullifierMap
          .get(getNullifierId(Field.from(roundId), Field.from(i)))
          .equals(Field.from(1))
          .toBoolean()
      ));

    return {
      currentRoundId: roundId,
      boughtTickets: this.stateManager.boughtTickets[roundId].map(x => ({
        amount: Number(x.amount.toBigInt()),
        numbers: x.numbers.map(x => Number(x.toBigint())),
        owner: x.owner.toBase58(),
      })),
      claimStatuses,
      winningCombination,
    };
  }

  @MessagePattern({ cmd: 'update' })
  async updateHandler(@Ctx() context: RmqContext): Promise<void> {
    try {
      await this.murLockService.runWithLock(
        'lockKey',
        60 * 1000,
        async () => {
          await this.update();
        },
      );
    } catch (error) {
      console.log('Error', error);
    }
  }

  async update(): Promise<void> {
    console.log('Updating');

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
      if (!this.stateManager.stateInitialized || newEventsToAdd) {
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
          Start block: ${Number(this.stateManager.lottery.startBlock.get())}`,
      );
      const currentRoundId = Math.floor(
        (slotSinceGenesis -
          Number(this.stateManager.lottery.startBlock.get())) /
          BLOCK_PER_ROUND,
      );

      this.stateManager.blockHeight = currBlockHeight;
      this.stateManager.slotSinceGenesis = slotSinceGenesis;
      this.stateManager.roundIds = currentRoundId;
    } catch (e) {
      console.log('Events sync error', e.stack);
    }
    console.log('Updating end');
  }
}
