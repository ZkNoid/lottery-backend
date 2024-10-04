"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateService = void 0;
const microservices_1 = require("@nestjs/microservices");
const o1js_1 = require("o1js");
const l1_lottery_contracts_1 = require("l1-lottery-contracts");
const addresses_1 = require("../constants/addresses");
const common_1 = require("@nestjs/common");
const networks_1 = require("../constants/networks");
const config_1 = require("@nestjs/config");
let StateService = class StateService {
    configService;
    blockHeight;
    slotSinceGenesis;
    roundIds;
    initialized;
    stateInitialized;
    inReduceProving = false;
    distributionProof;
    lottery;
    state;
    boughtTickets;
    async onModuleInit() {
        await this.initialize();
    }
    constructor(configService) {
        this.configService = configService;
    }
    accumulate(data, context) {
        return (data || []).reduce((a, b) => a + b);
    }
    async initialize() {
        if (this.initialized)
            return;
        const network = networks_1.NETWORKS[this.configService.getOrThrow('NETWORK_ID')];
        console.log('Network choosing', network);
        const Network = o1js_1.Mina.Network({
            mina: network?.graphql,
            archive: network?.archive,
        });
        console.log('Network setting');
        o1js_1.Mina.setActiveInstance(Network);
        console.log('Network set');
        const lottery = new l1_lottery_contracts_1.PLottery(o1js_1.PublicKey.fromBase58(addresses_1.LOTTERY_ADDRESS[network.networkID]));
        await (0, o1js_1.fetchAccount)({
            publicKey: lottery.address,
        });
        console.log('Lottery', lottery.startBlock.get());
        this.lottery = lottery;
        this.state = new l1_lottery_contracts_1.PStateManager(lottery, o1js_1.UInt32.from(lottery.startBlock.get()).toFields()[0], false);
        this.state.processedTicketData.ticketId = Number(lottery.lastProcessedTicketId.get().toBigInt());
        this.state.processedTicketData.round = Number(lottery.lastReduceInRound.get().toBigInt());
        console.log('Compilation');
        await l1_lottery_contracts_1.DistibutionProgram.compile({
            cache: o1js_1.Cache.FileSystem('./cache'),
        });
        console.log('Compilation ended');
        console.log('Compilation');
        await l1_lottery_contracts_1.TicketReduceProgram.compile({
            cache: o1js_1.Cache.FileSystem('./cache'),
        });
        console.log('Compilation ended');
        console.log('Compilation');
        await l1_lottery_contracts_1.PLottery.compile({
            cache: o1js_1.Cache.FileSystem('./cache'),
        });
        console.log('Compilation ended');
        this.initialized = true;
    }
    async fetchEvents(startBlock = 0) {
        const lottery = this.lottery;
        const start = o1js_1.UInt32.from(startBlock);
        const events = (await o1js_1.Mina.fetchEvents(lottery.address, undefined, {
            from: start,
        }))
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
        let sortedEventTypes = Object.keys(lottery.events).sort();
        console.log('sortedEventTypes', sortedEventTypes);
        return events.map((eventData) => {
            if (sortedEventTypes.length === 1) {
                let type = sortedEventTypes[0];
                let event = lottery.events[type].toJSON(lottery.events[type].fromFields(eventData.event.data.map((f) => (0, o1js_1.Field)(f))));
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
            else {
                let eventObjectIndex = Number(eventData.event.data[0]);
                let type = sortedEventTypes[eventObjectIndex];
                let eventProps = eventData.event.data.slice(1);
                let event = lottery.events[type].toJSON(lottery.events[type].fromFields(eventProps.map((f) => (0, o1js_1.Field)(f))));
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
    async initState(events, stateM) {
        const updateOnly = false;
        const startBlock = this.lottery.startBlock.get();
        stateM = new l1_lottery_contracts_1.PStateManager(this.lottery, o1js_1.UInt32.from(startBlock).toFields()[0], false);
        const syncBlockSlot = events.length > 0 ? events.at(-1).globalSlot : +startBlock;
        if (events.length != 0)
            stateM.syncWithCurBlock(syncBlockSlot);
        const boughtTickets = updateOnly ? this.boughtTickets : [];
        if (updateOnly) {
            console.log('[sm] initing bought tickets', boughtTickets.length, boughtTickets.length);
            for (let i = boughtTickets.length; i < stateM.roundTickets.length; i++) {
                boughtTickets.push([]);
            }
        }
        else {
            console.log('[sm] initing bought tickets2', boughtTickets.length, stateM.roundTickets.length, events.length);
            for (let i = 0; i < stateM.roundTickets.length; i++) {
                boughtTickets.push([]);
            }
        }
        for (let event of events) {
            if (event.event.data?.ticket?.owner ==
                'B62qiTKpEPjGTSHZrtM8uXiKgn8So916pLmNJKDhKeyBQL9TDb3nvBG') {
                event.event.data.ticket.owner =
                    'B62qrSG3pg83XvjtcEhywDz8CYhAZodhevPfjYSeXgsfeutWSbk29eM';
            }
            const data = this.lottery.events[event.type].fromJSON(event.event.data);
            if (event.type == 'buy-ticket') {
                console.log('Adding ticket to state', event.event.data, 'round', data.round);
                boughtTickets[data.round].push(data.ticket);
                console.log('Adding ticket');
            }
            if (event.type == 'produce-result') {
                console.log('Produced result', event.event.data, 'round' + data.round);
                stateM.roundResultMap.set(data.round, data.result);
                const curBankValue = stateM.bankMap.get(data.round);
                const newBankValue = curBankValue
                    .mul(l1_lottery_contracts_1.PRESICION - l1_lottery_contracts_1.COMMISION)
                    .div(l1_lottery_contracts_1.PRESICION);
                stateM.bankMap.set(data.round, newBankValue);
            }
            if (event.type == 'get-reward') {
                console.log('Got reward', event.event.data, 'round' + data.round);
                let ticketId = 0;
                let roundTicketWitness;
                for (; ticketId < stateM.lastTicketInRound[+data.round]; ticketId++) {
                    if (stateM.roundTicketMap[+data.round]
                        .get((0, o1js_1.Field)(ticketId))
                        .equals(data.ticket.hash())
                        .toBoolean()) {
                        roundTicketWitness = stateM.roundTicketMap[+data.round].getWitness(o1js_1.Field.from(ticketId));
                        break;
                    }
                }
                stateM.ticketNullifierMap.set((0, l1_lottery_contracts_1.getNullifierId)(o1js_1.Field.from(data.round), o1js_1.Field.from(ticketId)), (0, o1js_1.Field)(1));
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
                    console.log('Adding ticket in reduce', action.ticket.numbers.map((x) => x.toString()), +action.round);
                    stateM.addTicket(action.ticket, +action.round, true);
                    if (stateM.processedTicketData.round == +action.round) {
                        stateM.processedTicketData.ticketId++;
                    }
                    else {
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
    async undoLastEvents(events, stateM) {
        const boughtTickets = this.boughtTickets;
        for (let event of events) {
            const data = this.lottery.events[event.type].fromJSON(event.event.data);
            if (event.type == 'buy-ticket') {
                console.log('Removing ticket from state', event.event.data, 'round', data.round);
                boughtTickets[data.round].pop();
            }
            if (event.type == 'produce-result') {
                console.log('Remove Produced result', event.event.data, 'round' + data.round);
                stateM.roundResultMap.set(data.round, (0, o1js_1.Field)(0));
            }
            if (event.type == 'get-reward') {
                console.log('Remove got reward', event.event.data, 'round' + data.round);
                let ticketId = 0;
                let roundTicketWitness;
                for (; ticketId < stateM.lastTicketInRound[+data.round]; ticketId++) {
                    if (stateM.roundTicketMap[+data.round]
                        .get((0, o1js_1.Field)(ticketId))
                        .equals(data.ticket.hash())
                        .toBoolean()) {
                        roundTicketWitness = stateM.roundTicketMap[+data.round].getWitness(o1js_1.Field.from(ticketId));
                        break;
                    }
                }
                stateM.ticketNullifierMap.set((0, l1_lottery_contracts_1.getNullifierId)(o1js_1.Field.from(data.round), o1js_1.Field.from(ticketId)), (0, o1js_1.Field)(0));
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
                    console.log('Remove ticket in reduce', action.ticket.numbers.map((x) => x.toString()), +action.round);
                    stateM.removeLastTicket(+action.round);
                });
            }
        }
        this.state = stateM;
        this.boughtTickets = boughtTickets;
    }
    updateProcessedTicketData(stateM) {
        const ticketIdField = stateM.contract.lastProcessedTicketId.get();
        const round = +stateM.contract.lastReduceInRound.get();
        const ticketId = ticketIdField.equals((0, o1js_1.Field)(-1)).toBoolean()
            ? -1
            : +ticketIdField;
        stateM.processedTicketData = {
            ticketId,
            round,
        };
    }
};
exports.StateService = StateService;
__decorate([
    (0, microservices_1.MessagePattern)({ cmd: 'state-manager' }),
    __param(0, (0, microservices_1.Payload)()),
    __param(1, (0, microservices_1.Ctx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, microservices_1.RmqContext]),
    __metadata("design:returntype", Number)
], StateService.prototype, "accumulate", null);
exports.StateService = StateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StateService);
//# sourceMappingURL=state-manager.service.js.map