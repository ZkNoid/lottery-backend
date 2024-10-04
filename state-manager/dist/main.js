"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const microservices_1 = require("@nestjs/microservices");
const state_manager_module_1 = require("./state-manager.module");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(state_manager_module_1.StateManagerModule, {
        transport: microservices_1.Transport.RMQ,
        options: {
            urls: ['amqp://localhost:5672'],
            queue: 'cats_queue',
            queueOptions: {
                durable: false
            },
        },
    });
    await app.listen();
}
bootstrap();
//# sourceMappingURL=main.js.map