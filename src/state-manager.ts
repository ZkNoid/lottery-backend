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
  COMMISION,
  DistibutionProgram,
  PLottery,
  PRESICION,
  PStateManager,
  Ticket,
  TicketReduceProgram,
  getNullifierId,
} from 'l1-lottery-contracts';
import { LOTTERY_ADDRESS } from './constants/addresses';
import {
  BuyTicketEvent,
  GetRewardEvent,
  ProduceResultEvent,
} from 'l1-lottery-contracts/build/src/PLottery';
import { MinaEventDocument } from './workers/schema/events.schema';

export class StateSinglton {
  static blockHeight: Record<string, number> = {};
  static slotSinceGenesis: Record<string, number> = {};
  static roundIds: Record<string, number> = {};
  static initialized: boolean;
  static stateInitialized: Record<string, boolean> = {};

  static inReduceProving = false;

  static distributionProof: DistributionProof;
  static lottery: Record<string, PLottery> = {};
  static state: Record<string, PStateManager> = {};
  static boughtTickets: Record<string, Ticket[][]> = {};

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
      const lottery = new PLottery(
        PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
      );
      await fetchAccount({
        publicKey: lottery.address,
      });
      console.log('Lottery', lottery.startBlock.get());

      this.lottery[network.networkID] = lottery;

      this.state[network.networkID] = new PStateManager(
        lottery,
        UInt32.from(lottery.startBlock.get()).toFields()[0],
        false,
      );
      this.state[network.networkID].processedTicketData.ticketId = Number(
        lottery.lastProcessedTicketId.get().toBigInt(),
      );
      this.state[network.networkID].processedTicketData.round = Number(
        lottery.lastReduceInRound.get().toBigInt(),
      );
    }

    console.log('Compilation');
    await DistibutionProgram.compile({
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

  static async initState(
    networkID: string,
    events: MinaEventDocument[],
    stateM?: PStateManager,
  ) {
    const updateOnly: boolean = stateM != undefined;
    const startBlock = this.lottery[networkID].startBlock.get();
    if (!stateM) {
      stateM = new PStateManager(
        this.lottery[networkID],
        UInt32.from(startBlock).toFields()[0],
        false,
      );
    }

    const syncBlockSlot =
      events.length > 0 ? events.at(-1).globalSlot : +startBlock;

    if (events.length != 0) stateM.syncWithCurBlock(syncBlockSlot);

    const boughtTickets = updateOnly
      ? this.boughtTickets[networkID]
      : ([] as Ticket[][]);

    if (updateOnly) {
      console.log('[sm] initing bought tickets', boughtTickets.length, boughtTickets.length)
      for (let i = boughtTickets.length; i < stateM.roundTickets.length; i++) {
        boughtTickets.push([]);
      }
    } else {
      console.log('[sm] initing bought tickets', boughtTickets.length)

      for (let i = 0; i < stateM.roundTickets.length; i++) {
        boughtTickets.push([]);
      }
    }

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
        boughtTickets[data.round].push(data.ticket);
        // this.state[networkID].addTicket(data.ticket, +data.round, false);
        console.log('Adding ticket');
      }
      if (event.type == 'produce-result') {
        console.log('Produced result', event.event.data, 'round' + data.round);

        stateM.roundResultMap.set(data.round, data.result);

        const curBankValue = stateM.bankMap.get(data.round);
        const newBankValue = curBankValue
          .mul(PRESICION - COMMISION)
          .div(PRESICION);
        stateM.bankMap.set(data.round, newBankValue);
      }
      if (event.type == 'get-reward') {
        console.log('Got reward', event.event.data, 'round' + data.round);

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
          Field(1),
        );
      }

      if (event.type == 'reduce') {
        console.log('Reduce: ', event.event.data, 'round' + data.round);
        let fromActionState = data.startActionState;
        let endActionState = data.endActionState;

        let actions = await this.lottery[networkID].reducer.fetchActions({
          fromActionState,
          endActionState,
        });

        actions.flat(1).map((action) => {
          console.log(
            'Adding ticket in reduce',
            action.ticket.numbers.map((x) => x.toString()),
            +action.round,
          );

          stateM.addTicket(action.ticket, +action.round, true);

          if (stateM.processedTicketData.round == +action.round) {
            stateM.processedTicketData.ticketId++;
          } else {
            stateM.processedTicketData.ticketId = 0;
            stateM.processedTicketData.round = +action.round;
          }
        });
      }
    }
    this.state[networkID] = stateM;
    this.stateInitialized[networkID] = true;
    this.boughtTickets[networkID] = boughtTickets;
  }

  // !processedTicketData should be update according to contract state after that call
  static async undoLastEvents(
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

  static updateProcessedTicketData(stateM: PStateManager) {
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
}
