import { Module } from '@nestjs/common';
import {
  MinaEventData,
  MinaEventDataSchema,
} from '../workers/schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { DistributionProvingService } from './distribution-proving.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import {
  RoundsData,
  RoundsDataSchema,
} from '../workers/schema/rounds.schema.js';
import { StateModule } from '../state-service/state.module.js';

import { ZknoidConfigModule } from '../config/config.module.js';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from '../workers/sync-events/sync-events.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    StateModule,
  ],
  providers: [DistributionProvingService],
})
class DistributionProvingModule {}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        DistributionProvingModule
      ],
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DistributionProvingWorkersModule {}
