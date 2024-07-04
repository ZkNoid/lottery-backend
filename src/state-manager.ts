import { DistributionProof } from 'l1-lottery-contracts/build/src/DistributionProof';
import {
  Mina,
  Cache,
  PublicKey,
  UInt32,
  fetchAccount,
  Field,
  Struct,
} from 'o1js';
import { ALL_NETWORKS, NETWORKS, NetworkIds } from './constants/networks';
import {
  DistibutionProgram,
  Lottery,
  StateManager,
  getNullifierId,
} from 'l1-lottery-contracts';
import { LOTTERY_ADDRESS } from './constants/addresses';
import {
  BuyTicketEvent,
  GetRewardEvent,
  ProduceResultEvent,
} from 'l1-lottery-contracts/build/src/Lottery';
import { MinaEventDocument } from './workers/schema/events.schema';

export class StateSinglton {
  static initialized: boolean;
  static stateInitialized: Record<string, boolean> = {};

  static distributionProof: DistributionProof;
  static lottery: Record<string, Lottery> = {};
  static state: Record<string, StateManager> = {};

  static async initialize(): Promise<void> {
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
      const lottery = new Lottery(
        PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
      );
      await fetchAccount({
        publicKey: lottery.address,
      });
      console.log('Lottery', lottery.startBlock.get());

      this.lottery[network.networkID] = lottery;
      this.state[network.networkID] = new StateManager(
        UInt32.from(lottery.startBlock.get()).toFields()[0],
        false,
      );
    }

    console.log('Compilation');
    await DistibutionProgram.compile({
      cache: Cache.FileSystem('./cache'),
    });
    console.log('Compilation ended');

    console.log('Compilation');
    await Lottery.compile({
      cache: Cache.FileSystem('./cache'),
    });
    console.log('Compilation ended');

    this.initialized = true;
  }

  static async fetchEvents(networkID: string, startBlock: number = 0) {
    const lottery = this.lottery[networkID]!;

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

  static async initState(networkID: string, events: MinaEventDocument[]) {
    this.state[networkID] = new StateManager(
      UInt32.from(this.lottery[networkID].startBlock.get()).toFields()[0],
      false,
    );
    this.state[networkID].syncWithCurBlock(events.at(-1).globalSlot);
    for (let event of events) {
      const data = this.lottery[networkID].events[event.type].fromJSON(
        event.event.data as undefined as any,
      );

      if (event.type == 'buy-ticket') {
        console.log(
          'Adding ticket to state',
          event.event.data,
          'round',
          data.round,
        );

        this.state[networkID].addTicket(data.ticket, +data.round);
      }
      if (event.type == 'produce-result') {
        console.log('Produced result', event.event.data, 'round' + data.round);

        this.state[networkID].roundResultMap.set(data.round, data.result);
      }
      if (event.type == 'get-reward') {
        console.log('Got reward', event.event.data, 'round' + data.round);

        let ticketId = 0;
        let roundTicketWitness;

        for (
          ;
          ticketId < this.state[networkID].lastTicketInRound[+data.round];
          ticketId++
        ) {
          if (
            this.state[networkID].roundTicketMap[+data.round]
              .get(Field(ticketId))
              .equals(data.ticket.hash())
              .toBoolean()
          ) {
            roundTicketWitness = this.state[networkID].roundTicketMap[
              +data.round
            ].getWitness(Field.from(ticketId));
            break;
          }
        }

        this.state[networkID].ticketNullifierMap.set(
          getNullifierId(Field.from(data.round), Field.from(ticketId)),
          Field(1),
        );
      }
    }
    this.stateInitialized[networkID] = true;
  }
}
