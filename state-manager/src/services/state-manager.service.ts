import { MessagePattern } from '@nestjs/microservices';
import { DistributionProof } from 'l1-lottery-contracts/build/src/DistributionProof';
import { Mina, Cache, PublicKey, UInt32, fetchAccount, Field } from 'o1js';
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
import { LOTTERY_ADDRESS } from '../constants/addresses';
import { MinaEventDocument } from '../schemas/events.schema';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NETWORKS } from '../constants/networks';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StateService implements OnModuleInit {
  blockHeight?: number;
  slotSinceGenesis?: number;
  roundIds?: number;
  initialized: boolean;
  stateInitialized?: boolean;

  inReduceProving = false;

  distributionProof: DistributionProof;
  lottery?: PLottery;
  state?: PStateManager;
  boughtTickets?: Ticket[][];

  async onModuleInit() {
    await this.initialize();
  }

  constructor(private configService: ConfigService) {}

  @MessagePattern({ cmd: 'state-manager' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = NETWORKS[this.configService.getOrThrow('NETWORK_ID')];
    console.log('Network choosing', network);

    const Network = Mina.Network({
      mina: network?.graphql,
      archive: network?.archive,
    });

    console.log('Network setting');

    Mina.setActiveInstance(Network);
    console.log('Network set');

    const lottery = new PLottery(
      PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
    );
    await fetchAccount({
      publicKey: lottery.address,
    });
    console.log('Lottery', lottery.startBlock.get());

    this.lottery = lottery;

    this.state = new PStateManager(
      lottery,
      UInt32.from(lottery.startBlock.get()).toFields()[0],
      false,
    );
    this.state.processedTicketData.ticketId = Number(
      lottery.lastProcessedTicketId.get().toBigInt(),
    );
    this.state.processedTicketData.round = Number(
      lottery.lastReduceInRound.get().toBigInt(),
    );

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

  async fetchEvents(startBlock: number = 0) {
    const lottery = this.lottery!;

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

  async initState(events: MinaEventDocument[], stateM?: PStateManager) {
    const updateOnly: boolean = false;
    const startBlock = this.lottery.startBlock.get();
    // if (!stateM) {
    stateM = new PStateManager(
      this.lottery,
      UInt32.from(startBlock).toFields()[0],
      false,
    );
    // }

    const syncBlockSlot =
      events.length > 0 ? events.at(-1).globalSlot : +startBlock;

    if (events.length != 0) stateM.syncWithCurBlock(syncBlockSlot);

    const boughtTickets = updateOnly ? this.boughtTickets : ([] as Ticket[][]);

    if (updateOnly) {
      console.log(
        '[sm] initing bought tickets',
        boughtTickets.length,
        boughtTickets.length,
      );
      for (let i = boughtTickets.length; i < stateM.roundTickets.length; i++) {
        boughtTickets.push([]);
      }
    } else {
      console.log(
        '[sm] initing bought tickets2',
        boughtTickets.length,
        stateM.roundTickets.length,
        events.length,
      );

      for (let i = 0; i < stateM.roundTickets.length; i++) {
        boughtTickets.push([]);
      }
    }

    for (let event of events) {
      if (
        (event.event.data as undefined as any)?.ticket?.owner ==
        'B62qiTKpEPjGTSHZrtM8uXiKgn8So916pLmNJKDhKeyBQL9TDb3nvBG'
      ) {
        (event.event.data as unknown as any).ticket.owner =
          'B62qrSG3pg83XvjtcEhywDz8CYhAZodhevPfjYSeXgsfeutWSbk29eM';
      }
      const data = this.lottery.events[event.type].fromJSON(
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

        let actions = await this.lottery.reducer.fetchActions({
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
    this.state = stateM;
    this.stateInitialized = true;
    console.log('Setting bought tickets', boughtTickets);
    this.boughtTickets = boughtTickets;
  }

  // !processedTicketData should be update according to contract state after that call
  async undoLastEvents(events: MinaEventDocument[], stateM: PStateManager) {
    const boughtTickets = this.boughtTickets;

    for (let event of events) {
      const data = this.lottery.events[event.type].fromJSON(
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

        let actions = await this.lottery.reducer.fetchActions({
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

    this.state = stateM;
    this.boughtTickets = boughtTickets;
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
}
