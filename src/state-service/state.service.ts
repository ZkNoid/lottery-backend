import { Mina, Cache, PublicKey, UInt32, fetchAccount, Field } from 'o1js';
import { NETWORKS, Network, NetworkIds } from '../constants/networks.js';
import {
  BLOCK_PER_ROUND,
  DistributionProgram,
  DistributionProof,
  PLottery,
  PStateManager,
  Ticket,
  TicketReduceProgram,
} from 'l1-lottery-contracts';
import { FACTORY_ADDRESS } from '../constants/addresses.js';
import { MinaEventDocument } from '../workers/schema/events.schema.js';
import { Injectable, OnModuleInit } from '@nestjs/common';

import { FactoryManager } from 'l1-lottery-contracts';
import { PlotteryFactory } from 'l1-lottery-contracts';
import { ZkonRequestCoordinator, ZkonZkProgram } from 'zkon-zkapp';
import { RandomManager } from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { getCurrentSlot } from '../lib.js';
import { Mutex } from 'async-mutex';

@Injectable()
export class StateService implements OnModuleInit {
  blockHeight: number = undefined;
  slotSinceGenesis: number = undefined;
  initialized: boolean;
  stateInitialized: boolean = undefined;

  inReduceProving = false;
  factory: PlotteryFactory = undefined;
  state: FactoryManager = undefined;
  boughtTickets: Ticket[][] = [];
  boughtTicketsHashes: string[][] = [];
  claimedTicketsHashes: Record<number, string>[] = [];

  network: Network;

  transactionMutex: Mutex = new Mutex();

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = NETWORKS[process.env.NETWORK_ID];
    this.network = network;

    console.log('Network choosing', network);

    const Network = Mina.Network({
      mina: network?.graphql,
      archive: network?.archive,
    });

    console.log('Network setting');

    Mina.setActiveInstance(Network);
    console.log('Network set');

    const factory = new PlotteryFactory(
      PublicKey.fromBase58(FACTORY_ADDRESS[network.networkID]),
    );

    this.factory = factory;
    this.state = new FactoryManager(false, false);

    await this.fetchRounds();

    console.log('Compilation ended');

    console.log('Compilation');
    await TicketReduceProgram.compile({
      cache: Cache.FileSystem('./cache'),
    });

    console.log('Compilation ended');

    console.log('Compilation');
    await PLottery.compile({
      cache: Cache.FileSystem('./cache'),
    });

    console.log('ZkonZkProgramm compile');
    let zk1 = await ZkonZkProgram.compile({
      cache: Cache.FileSystem('./cache'),
    });

    console.log(`Zkon programm proof: ${zk1.verificationKey.hash.toString()}`);

    console.log('ZkonRequestCoordinator compile');
    let zk2 = await ZkonRequestCoordinator.compile({
      cache: Cache.FileSystem('./cache'),
    });

    console.log(
      `ZkonRequestCoordinator : ${zk2.verificationKey.hash.toString()}`,
    );

    console.log('RandomManager compile');
    const randomManagerCompileInfo = await RandomManager.compile({
      cache: Cache.FileSystem('./cache'),
    });

    console.log(`rm verification key`);
    console.log(randomManagerCompileInfo.verificationKey.hash.toString());

    console.log('Compilation ended');

    this.initialized = true;
  }

  async fetchRounds() {
    console.log('fetchRounds');
      const state = this.state;
      const events = await this.factory.fetchEvents();

      events.forEach((event) => {
        // console.log(event.event.data);
        const data = event.event.data as any;

        // console.log(
        //   `Adding: ${data.round} ${data.randomManager} ${data.plottery}`,
        // );

        state.addDeploy(data.round, data.randomManager, data.plottery);
      });
    
  }

  async fetchEvents(round: number, startBlock: number = 0) {
    console.log(`fetching events for round: ${round}`);
    const lottery = this.state.plotteryManagers[round].contract;

    if (!lottery) {
      console.log(`No deployed plottery for round ${round}. Deploy it first`);
      return;
    }

    const start = UInt32.from(startBlock);
    const events = (
      await Mina.fetchEvents(lottery.address, undefined, {
        from: start,
      })
    )
      .map((event) => {
        return event.events.map((eventData) => {
          let { events, ...rest } = event;
          return {
            ...rest,
            event: eventData,
          };
        });
      })
      .flat();

    // .filter((x) => x.event.transactionInfo.transactionStatus == 'applied');

    let sortedEventTypes = Object.keys(lottery.events).sort();
    // console.log('sortedEventTypes', sortedEventTypes);
    return events.map((eventData) => {
      // if there is only one event type, the event structure has no index and can directly be matched to the event type
      if (sortedEventTypes.length === 1) {
        let type = sortedEventTypes[0];
        let event = lottery.events[type].toJSON(
          lottery.events[type].fromFields(
            eventData.event.data.map((f) => Field(f)),
          ),
        );
        return {
          ...eventData,
          type,
          event: {
            data: event,
            transactionInfo: {
              transactionHash: eventData.event.transactionInfo.hash,
              transactionStatus: eventData.event.transactionInfo.status,
              transactionMemo: eventData.event.transactionInfo.memo,
            },
          },
        };
      } else {
        // if there are multiple events we have to use the index event[0] to find the exact event type
        let eventObjectIndex = Number(eventData.event.data[0]);
        let type = sortedEventTypes[eventObjectIndex];
        // all other elements of the array are values used to construct the original object, we can drop the first value since its just an index
        let eventProps = eventData.event.data.slice(1);
        let event = lottery.events[type].toJSON(
          lottery.events[type].fromFields(eventProps.map((f) => Field(f))),
        );
        return {
          ...eventData,
          type,
          event: {
            data: event,
            transactionInfo: {
              transactionHash: eventData.event.transactionInfo.hash,
              transactionStatus: eventData.event.transactionInfo.status,
              transactionMemo: eventData.event.transactionInfo.memo,
            },
          },
        };
      }
    });
  }

  async initState(
    round: number,
    events: MinaEventDocument[],
    stateM?: PStateManager,
  ) {
    const updateOnly: boolean = false;
    const lottery = this.state.plotteryManagers[round].contract;
    stateM = new PStateManager(lottery, false, false);
    // console.log(`Fetch account: ${lottery.address.toBase58()}`);
    await fetchAccount({ publicKey: lottery.address });
    const startBlock = lottery.startSlot.get();
    // if (!stateM) {
    // stateM = this.state[networkID].plotteryManagers[round];
    // }

    const syncBlockSlot =
      events.length > 0 ? events.at(-1).globalSlot : +startBlock;

    // if (events.length != 0) stateM.syncWithCurBlock(syncBlockSlot);

    const boughtTickets = this.boughtTickets
      ? this.boughtTickets
      : ([] as Ticket[][]);

    const boughtTicketsHashes = this.boughtTicketsHashes
      ? this.boughtTicketsHashes
      : ([] as string[][]);

    const claimedTicketsHashes = this.boughtTicketsHashes
      ? this.claimedTicketsHashes
      : ([] as Record<number, string>[]);

    // if (updateOnly) {
    console.log(
      '[sm] initing bought tickets',
      boughtTickets.length,
      boughtTickets.length,
    );
    for (let i = boughtTickets.length; i < round + 1; i++) {
      boughtTickets.push([]);
    }

    boughtTickets[round] = [];
    boughtTicketsHashes[round] = [];
    claimedTicketsHashes[round] = [];

    // } else {
    //   console.log(
    //     '[sm] initing bought tickets2',
    //     boughtTickets.length,
    //     stateM.roundTickets.length,
    //     events.length,
    //   );

    //   for (let i = 0; i < round + 1; i++) {
    //     boughtTickets.push([]);
    //   }
    // }

    for (let event of events) {
      // if (
      //   (event.event.data as undefined as any)?.ticket?.owner ==
      //   'B62qiTKpEPjGTSHZrtM8uXiKgn8So916pLmNJKDhKeyBQL9TDb3nvBG'
      // ) {
      //   (event.event.data as unknown as any).ticket.owner =
      //     'B62qrSG3pg83XvjtcEhywDz8CYhAZodhevPfjYSeXgsfeutWSbk29eM';
      // }
      const data = lottery.events[event.type].fromJSON(
        event.event.data as undefined as any,
      );

      if (event.type == 'buy-ticket') {
        // console.log('Adding ticket to state', event.event.data, 'round', round);
        boughtTickets[round].push(data.ticket);
        boughtTicketsHashes[round].push(event.event.transactionInfo.transactionHash)
        // this.state[networkID].addTicket(data.ticket, +data.round, false);
        // console.log('Adding ticket');
      }
      if (event.type == 'produce-result') {
        // console.log('Produced result', event.event.data, 'round' + round);
        // stateM.roundResultMap.set(data.round, data.result);
        // const curBankValue = stateM.bankMap.get(data.round);
        // const newBankValue = curBankValue
        //   .mul(PRESICION - COMMISION)
        //   .div(PRESICION);
        // stateM.bankMap.set(data.round, newBankValue);
      }
      if (event.type == 'get-reward') {
        // console.log('Got reward', event.event.data, 'round' + round);

        let ticketId = 0;
        let ticketWitness;

        for (; ticketId < stateM.lastTicketInRound; ticketId++) {
          if (
            stateM.ticketMap
              .get(Field(ticketId))
              .equals(data.ticket.hash())
              .toBoolean()
          ) {
            ticketWitness = stateM.ticketMap.getWitness(Field.from(ticketId));
            break;
          }
        }

        // console.log(
        //   `Before: ${stateM.ticketNullifierMap.getRoot().toString()}`,
        // );
        // console.log(
        //   JSON.stringify(
        //     stateM.ticketNullifierMap.getWitness(Field(ticketId)),
        //     null,
        //     2,
        //   ),
        // );
        stateM.ticketNullifierMap.set(Field(ticketId), Field(1));
        claimedTicketsHashes[round][ticketId] = event.event.transactionInfo.transactionHash

        // console.log(`After ${stateM.ticketNullifierMap.getRoot().toString()}`);
        // console.log(
        //   JSON.stringify(
        //     stateM.ticketNullifierMap.getWitness(Field(ticketId)),
        //     null,
        //     2,
        //   ),
        // );
      }

      if (event.type == 'produce-result') {
        // console.log('Reduce: ', event.event.data, 'round' + round);
        // let fromActionState = data.startActionState;
        // let endActionState = data.endActionState;

        let actions = await lottery.reducer.fetchActions({
          // fromActionState,
          // endActionState,
        });

        actions.flat(1).map((action) => {
          stateM.addTicket(action.ticket, true);
        });
      }
    }

    this.state.plotteryManagers[round] = stateM;
    this.stateInitialized = true;
    this.boughtTickets = boughtTickets;
    this.boughtTicketsHashes = boughtTicketsHashes;
    this.claimedTicketsHashes = claimedTicketsHashes;
    this.boughtTickets = boughtTickets;

  }

  async getCurrentRound(): Promise<number> {
    await fetchAccount({ publicKey: this.factory.address });
    const initSlot = this.factory.startSlot.get();
    const currentSlot = await getCurrentSlot();
    const currentRound = Math.floor(
      (currentSlot - +initSlot) / BLOCK_PER_ROUND,
    );

    return currentRound;
  }
}
