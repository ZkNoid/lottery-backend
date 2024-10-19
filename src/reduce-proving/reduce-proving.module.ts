import { Module } from '@nestjs/common';
import {
  MinaEventData,
  MinaEventDataSchema,
} from '../workers/schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { ProveReduceService } from './reduce-proving.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { StateModule } from '../state-service/state.module.js';
import {
  RoundsData,
  RoundsDataSchema,
} from '../workers/schema/rounds.schema.js';
import { ZknoidConfigModule } from '../config/config.module.js';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from '../workers/sync-events/sync-events.module.js';
import { HealthController } from '../health-api/health-api.controller.js';


@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
    ]),
    StateModule,
  ],
  providers: [ProveReduceService],
  controllers: [HealthController]
})
export class ProveReduceModule {}


@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        ProveReduceModule
      ],
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class ProveReduceWorkersModule {}
