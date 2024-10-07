import { NestFactory } from '@nestjs/core';
import { Transport, TcpOptions, MicroserviceOptions } from '@nestjs/microservices';

import { StateManagerModule } from './state-manager.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(StateManagerModule, {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://rabbitmq:5672'],
      queue: 'state_manager_queue',
      queueOptions: {
        durable: false,
      },
    },
  });
    await app.listen();
}
bootstrap();
