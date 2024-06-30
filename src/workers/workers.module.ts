import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ZknoidConfigModule } from 'src/config/config.module';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from './sync-events/sync-events.module';
import { ProduceResultEvent } from 'l1-lottery-contracts/build/src/Lottery';
import { ProduceResultModule } from './produce-result/produce-result.module';

@Module({
  imports: [MongooseModule.forRootAsync({
    imports: [ZknoidConfigModule, SyncEventsModule, ProduceResultModule],
    useFactory: async () => ({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB,
    }),
    inject: [ConfigService],
  }),
],
})
export class WorkersModule {}
