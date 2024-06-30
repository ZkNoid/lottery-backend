import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ZknoidConfigModule } from 'src/config/config.module';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from './sync-events/sync-events.module';

@Module({
  imports: [MongooseModule.forRootAsync({
    imports: [ZknoidConfigModule, SyncEventsModule],
    useFactory: async () => ({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB,
    }),
    inject: [ConfigService],
  }),
],
})
export class WorkersModule {}
