"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsSyncModule = void 0;
const common_1 = require("@nestjs/common");
const events_sync_controller_1 = require("./events-sync.controller");
const microservices_1 = require("@nestjs/microservices");
const config_service_1 = require("./services/config/config.service");
const schedule_1 = require("@nestjs/schedule");
let EventsSyncModule = class EventsSyncModule {
};
exports.EventsSyncModule = EventsSyncModule;
exports.EventsSyncModule = EventsSyncModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot()
        ],
        controllers: [events_sync_controller_1.EventsSyncController],
        providers: [
            config_service_1.ConfigService,
            {
                provide: 'SM_SERVICE',
                useFactory: (configService) => {
                    const mailerServiceOptions = configService.get('stateManagerService');
                    return microservices_1.ClientProxyFactory.create(mailerServiceOptions);
                },
                inject: [config_service_1.ConfigService],
            },
        ],
    })
], EventsSyncModule);
//# sourceMappingURL=events-sync.module.js.map