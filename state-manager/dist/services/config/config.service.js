"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
class ConfigService {
    envConfig = null;
    constructor() {
        this.envConfig = {
            port: process.env.SM_SERVICE_PORT,
            networkId: process.env.NETWORK_ID,
        };
    }
    get(key) {
        return this.envConfig[key];
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=config.service.js.map