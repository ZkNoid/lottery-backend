import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import configuration from './config/configuration';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MinaEventData, MinaEventDataSchema } from './schemas/events.schema';
import { MurLockModule } from 'murlock';
import { RoundsData, RoundsDataSchema } from './schemas/rounds.schema';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundsInfoUpdaterService } from './services/rounds-info-updater.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
    ]),
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
    ConfigModule.forRoot({
      load: [configuration],
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    MurLockModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redisOptions: {
          url: 'redis://redis:6379',
          password: process.env.REDIS_PASSWORD,
        },
        wait: 1000,
        maxAttempts: 3,
        logLevel: 'log',
        ignoreUnlockFail: false,
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
  ],
  providers: [RoundsInfoUpdaterService],
  controllers: [],
})
export class RoundInfosUpdaterModule {}
