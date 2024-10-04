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
exports.StateManagerController = void 0;
const common_1 = require("@nestjs/common");
const state_manager_service_1 = require("./services/state-manager.service");
const microservices_1 = require("@nestjs/microservices");
const networks_1 = require("./constants/networks");
const config_service_1 = require("./services/config/config.service");
const mongoose_1 = require("@nestjs/mongoose");
const events_schema_1 = require("./schemas/events.schema");
const axios_1 = require("@nestjs/axios");
const mongoose_2 = require("mongoose");
const l1_lottery_contracts_1 = require("l1-lottery-contracts");
const BLOCK_UPDATE_DEPTH = 6;
let StateManagerController = class StateManagerController {
    stateManager;
    configService;
    httpService;
    minaEventData;
    constructor(stateManager, configService, httpService, minaEventData) {
        this.stateManager = stateManager;
        this.configService = configService;
        this.httpService = httpService;
        this.minaEventData = minaEventData;
    }
    onModuleInit() { }
    async fetchEvents(startBlock = 0) {
        return await this.stateManager.fetchEvents(startBlock);
    }
    async update() {
        if (this.stateManager.inReduceProving) {
            console.log('It will kill reduce. Do not do it');
            return;
        }
        const network = networks_1.NETWORKS[this.configService.get('networkId')];
        try {
            console.log('Events sync');
            const data = await this.httpService.axiosRef.post(network.graphql, JSON.stringify({
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
            }), {
                headers: {
                    'Content-Type': 'application/json',
                },
                responseType: 'json',
            });
            const slotSinceGenesis = data.data.data.bestChain[0].protocolState.consensusState
                .slotSinceGenesis;
            const currBlockHeight = data.data.data.bestChain[0].protocolState.consensusState.blockHeight;
            const lastEvent = await this.minaEventData.findOne({}).sort({ _id: -1 });
            const updateEventsFrom = lastEvent
                ? lastEvent.blockHeight - BLOCK_UPDATE_DEPTH
                : 0;
            const events = await this.stateManager.fetchEvents(lastEvent ? updateEventsFrom : 0);
            let fetchedEvents = events.map((x) => new this.minaEventData({
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
            }));
            console.log('New events', events);
            let eventsToBeDeleted = await this.minaEventData.find({
                blockHeight: { $gte: updateEventsFrom },
            });
            let eventsIdForDelete = [];
            let deleteStartIndex = 0;
            for (; deleteStartIndex < eventsToBeDeleted.length; deleteStartIndex++) {
                let dbEvent = eventsToBeDeleted[deleteStartIndex];
                let nodeEvent = fetchedEvents[deleteStartIndex];
                if (dbEvent.event.transactionInfo.transactionHash !==
                    nodeEvent.event.transactionInfo.transactionHash) {
                    break;
                }
            }
            eventsIdForDelete = eventsToBeDeleted
                .slice(deleteStartIndex)
                .map((event) => event._id);
            eventsToBeDeleted = eventsToBeDeleted.slice(deleteStartIndex);
            const newEventsToAdd = fetchedEvents.slice(deleteStartIndex);
            await this.minaEventData.deleteMany({
                _id: { $in: eventsIdForDelete },
            });
            for (const eventToAdd of newEventsToAdd) {
                await this.minaEventData.updateOne({
                    'event.transactionInfo.transactionHash': eventToAdd.event.transactionInfo.transactionHash,
                }, {
                    $set: eventToAdd,
                }, {
                    upsert: true,
                });
            }
            if (!this.stateManager.stateInitialized[network.networkID] ||
                newEventsToAdd) {
                const allEvents = await this.minaEventData.find({});
                await this.stateManager.initState(allEvents);
            }
            else {
            }
            console.log(`Curr slot ${slotSinceGenesis}. \
          Start block: ${Number(this.stateManager.lottery[network.networkID].startBlock.get())}`);
            const currentRoundId = Math.floor((slotSinceGenesis -
                Number(this.stateManager.lottery[network.networkID].startBlock.get())) /
                l1_lottery_contracts_1.BLOCK_PER_ROUND);
            this.stateManager.blockHeight[network.networkID] = currBlockHeight;
            this.stateManager.slotSinceGenesis[network.networkID] = slotSinceGenesis;
            this.stateManager.roundIds[network.networkID] = currentRoundId;
        }
        catch (e) {
            console.log('Events sync error', e.stack);
        }
    }
};
exports.StateManagerController = StateManagerController;
__decorate([
    (0, microservices_1.MessagePattern)('fetch_events'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], StateManagerController.prototype, "fetchEvents", null);
__decorate([
    (0, microservices_1.MessagePattern)('update'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StateManagerController.prototype, "update", null);
exports.StateManagerController = StateManagerController = __decorate([
    (0, common_1.Controller)(),
    __param(3, (0, mongoose_1.InjectModel)(events_schema_1.MinaEventData.name)),
    __metadata("design:paramtypes", [state_manager_service_1.StateService,
        config_service_1.ConfigService,
        axios_1.HttpService,
        mongoose_2.Model])
], StateManagerController);
//# sourceMappingURL=state-manager.controller.js.map