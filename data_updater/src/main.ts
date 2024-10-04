import { NestFactory } from '@nestjs/core';
import { Transport, TcpOptions, MicroserviceOptions } from '@nestjs/microservices';

import { DataUpdaterModule } from './data-updater.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(DataUpdaterModule, {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://rabbitmq:5672'],
      queue: 'data_updater_queue',
      queueOptions: {
        durable: false
      },
    },
  });
    await app.listen();
}
bootstrap();
