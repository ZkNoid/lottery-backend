"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const microservices_1 = require("@nestjs/microservices");
class ConfigService {
    constructor() {
        this.envConfig = null;
        this.envConfig = {
            port: process.env.EVENTS_SYNC_SERVICE_PORT,
        };
        this.envConfig.stateManagerService = {
            options: {
                port: process.env.SM_SERVICE_PORT,
                host: process.env.SM_SERVICE_HOST,
            },
            transport: microservices_1.Transport.TCP,
        };
    }
    get(key) {
        return this.envConfig[key];
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=config.service.js.map