import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import configuration from './config/configuration';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MinaEventData, MinaEventDataSchema } from './schemas/events.schema';
import { DataUpdaterService } from './services/data-updater.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'STATE_MANAGER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://rabbitmq:5672'],
          queue: 'state_manager_queue',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [DataUpdaterService],
  controllers: [],
})
export class DataUpdaterModule {}
