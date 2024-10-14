import { Mina, Cache, PublicKey, UInt32, fetchAccount, Field } from 'o1js';
import { ALL_NETWORKS, NETWORKS, NetworkIds } from '../constants/networks.js';
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
  blockHeight: Record<string, number> = {};
  slotSinceGenesis: Record<string, number> = {};
  // roundIds: Record<string, number> = {};
  initialized: boolean;
  stateInitialized: Record<string, boolean> = {};

  inReduceProving = false;

  // distributionProof: DistributionProof;
  // lottery: Record<string, PLottery> = {};
  factory: Record<string, PlotteryFactory> = {};
  state: Record<string, FactoryManager> = {};
  // state: Record<string, PStateManager> = {};
  boughtTickets: Record<string, Ticket[][]> = {};
  transactionMutex: Mutex = new Mutex();

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = NETWORKS[NetworkIds.MINA_DEVNET];
    console.log('Network choosing', network);

    const Network = Mina.Network({
      mina: network?.graphql,
      archive: network?.archive,
    });

    console.log('Network setting');

    Mina.setActiveInstance(Network);
    console.log('Network set');

    for (let network of ALL_NETWORKS) {
      const factory = new PlotteryFactory(
        PublicKey.fromBase58(FACTORY_ADDRESS[network.networkID]),
      );

      this.factory[network.networkID] = factory;
      this.state[network.networkID] = new FactoryManager(false, false);
    }

    await this.fetchRounds();

    console.log('Compilation');
    await DistributionProgram.compile({
      cache: Cache.FileSystem('./cache'),
    });
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
    for (let network of ALL_NETWORKS) {
      const state = this.state[network.networkID];
      const events = await this.factory[network.networkID].fetchEvents();

      events.forEach((event) => {
        console.log(event.event.data);
        const data = event.event.data as any;

        console.log(
          `Adding: ${data.round} ${data.randomManager} ${data.plottery}`,
        );

        state.addDeploy(data.round, data.randomManager, data.plottery);
      });
    }
  }

  async fetchEvents(networkID: string, round: number, startBlock: number = 0) {
    console.log(`fetching events for round: ${round}`);
    const lottery = this.state[networkID].plotteryManagers[round].contract;

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
    console.log('sortedEventTypes', sortedEventTypes);
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
    networkID: string,
    round: number,
    events: MinaEventDocument[],
    stateM?: PStateManager,
  ) {
    const updateOnly: boolean = false;
    const lottery = this.state[networkID].plotteryManagers[round].contract;
    // console.log(`Fetch account: ${lottery.address.toBase58()}`);
    await fetchAccount({ publicKey: lottery.address });
    const startBlock = lottery.startSlot.get();
    // if (!stateM) {
    stateM = this.state[networkID].plotteryManagers[round];
    // }

    const syncBlockSlot =
      events.length > 0 ? events.at(-1).globalSlot : +startBlock;

    // if (events.length != 0) stateM.syncWithCurBlock(syncBlockSlot);

    const boughtTickets = this.boughtTickets[networkID]
      ? this.boughtTickets[networkID]
      : ([] as Ticket[][]);

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
        console.log('Adding ticket to state', event.event.data, 'round', round);
        boughtTickets[round].push(data.ticket);
        // this.state[networkID].addTicket(data.ticket, +data.round, false);
        console.log('Adding ticket');
      }
      if (event.type == 'produce-result') {
        console.log('Produced result', event.event.data, 'round' + round);

        // stateM.roundResultMap.set(data.round, data.result);

        // const curBankValue = stateM.bankMap.get(data.round);
        // const newBankValue = curBankValue
        //   .mul(PRESICION - COMMISION)
        //   .div(PRESICION);
        // stateM.bankMap.set(data.round, newBankValue);
      }
      if (event.type == 'get-reward') {
        console.log('Got reward', event.event.data, 'round' + round);

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

        stateM.ticketNullifierMap.set(Field(ticketId), Field(1));
      }

      if (event.type == 'reduce') {
        console.log('Reduce: ', event.event.data, 'round' + round);
        // let fromActionState = data.startActionState;
        // let endActionState = data.endActionState;

        let actions = await lottery.reducer.fetchActions({
          // fromActionState,
          // endActionState,
        });

        actions.flat(1).map((action) => {
          console.log(
            'Adding ticket in reduce',
            action.ticket.numbers.map((x) => x.toString()),
            round,
          );

          stateM.addTicket(action.ticket, true);

          // if (stateM.processedTicketData.round == +action.round) {
          //   stateM.processedTicketData.ticketId++;
          // } else {
          //   stateM.processedTicketData.ticketId = 0;
          //   stateM.processedTicketData.round = +action.round;
          // }
        });
      }
    }
    this.state[networkID].plotteryManagers[round] = stateM;
    this.stateInitialized[networkID] = true;
    this.boughtTickets[networkID] = boughtTickets;
  }

  async getCurrentRound(networkId: string): Promise<number> {
    const factory = this.factory[networkId];

    await fetchAccount({ publicKey: factory.address });
    const initSlot = factory.startSlot.get();
    const currentSlot = await getCurrentSlot(networkId);
    const currentRound = Math.floor(
      (currentSlot - +initSlot) / BLOCK_PER_ROUND,
    );

    return currentRound;
  }
  /*
  // !processedTicketData should be update according to contract state after that call
  async undoLastEvents(
    networkID: string,
    events: MinaEventDocument[],
    stateM: PStateManager,
  ) {
    const boughtTickets = this.boughtTickets[networkID];

    for (let event of events) {
      const data = this.lottery[networkID].events[event.type].fromJSON(
        event.event.data as undefined as any,
      );

      if (event.type == 'buy-ticket') {
        console.log(
          'Removing ticket from state',
          event.event.data,
          'round',
          data.round,
        );

        boughtTickets[data.round].pop();
      }
      if (event.type == 'produce-result') {
        console.log(
          'Remove Produced result',
          event.event.data,
          'round' + data.round,
        );

        stateM.roundResultMap.set(data.round, Field(0));
      }
      if (event.type == 'get-reward') {
        console.log(
          'Remove got reward',
          event.event.data,
          'round' + data.round,
        );

        let ticketId = 0;
        let roundTicketWitness;

        for (; ticketId < stateM.lastTicketInRound[+data.round]; ticketId++) {
          if (
            stateM.roundTicketMap[+data.round]
              .get(Field(ticketId))
              .equals(data.ticket.hash())
              .toBoolean()
          ) {
            roundTicketWitness = stateM.roundTicketMap[+data.round].getWitness(
              Field.from(ticketId),
            );
            break;
          }
        }

        stateM.ticketNullifierMap.set(
          getNullifierId(Field.from(data.round), Field.from(ticketId)),
          Field(0),
        );
      }

      if (event.type == 'reduce') {
        console.log('Remove Reduce: ', event.event.data, 'round' + data.round);
        let fromActionState = data.startActionState;
        let endActionState = data.endActionState;

        let actions = await this.lottery[networkID].reducer.fetchActions({
          fromActionState,
          endActionState,
        });

        actions.flat(1).map((action) => {
          console.log(
            'Remove ticket in reduce',
            action.ticket.numbers.map((x) => x.toString()),
            +action.round,
          );

          stateM.removeLastTicket(+action.round);

          // if (stateM.processedTicketData.round == +action.round) {
          //   stateM.processedTicketData.ticketId--;
          // } else {
          //   stateM.processedTicketData.ticketId = 1;
          //   stateM.processedTicketData.round = +action.round;
          // }
        });
      }
    }

    this.state[networkID] = stateM;
    this.boughtTickets[networkID] = boughtTickets;
  }

  updateProcessedTicketData(stateM: PStateManager) {
    const ticketIdField = stateM.contract.lastProcessedTicketId.get();
    const round = +stateM.contract.lastReduceInRound.get();
    const ticketId = ticketIdField.equals(Field(-1)).toBoolean()
      ? -1
      : +ticketIdField;

    stateM.processedTicketData = {
      ticketId,
      round,
    };
  }
    */
}
