"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManagerModule = void 0;
const common_1 = require("@nestjs/common");
const state_manager_controller_1 = require("./state-manager.controller");
const state_manager_service_1 = require("./services/state-manager.service");
const config_service_1 = require("./services/config/config.service");
const microservices_1 = require("@nestjs/microservices");
let StateManagerModule = class StateManagerModule {
};
exports.StateManagerModule = StateManagerModule;
exports.StateManagerModule = StateManagerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            microservices_1.ClientsModule.register([
                {
                    name: 'MATH_SERVICE',
                    transport: microservices_1.Transport.RMQ,
                    options: {
                        urls: ['amqp://localhost:5672'],
                        queue: 'state_manager_queue',
                        queueOptions: {
                            durable: false
                        },
                    },
                },
            ]),
        ],
        providers: [
            state_manager_service_1.StateService,
            config_service_1.ConfigService
        ],
        controllers: [state_manager_controller_1.StateManagerController],
    })
], StateManagerModule);
//# sourceMappingURL=state-manager.module.js.map