import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SyncEventsModule } from '../workers/sync-events/sync-events.module.js';
import { CommitValueModule } from '../workers/commit-value/commit-value.module.js';
import { RevealValueModule } from '../workers/reveal-value/reveal-value.module.js';
import { HealthController } from '../health-api/health-api.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env.second-party',
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [
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
