import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ZknoidConfigModule } from '../config/config.module.js';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from '../workers/sync-events/sync-events.module.js';
import { CommitValueModule } from '../workers/commit-value/commit-value.module.js';
import { RevealValueModule } from '../workers/reveal-value/reveal-value.module.js';
import { HealthController } from 'src/health-api/health-api.controller.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        CommitValueModule,
        RevealValueModule,
      ],
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [HealthController]

})
export class SecondPartyModule {}
