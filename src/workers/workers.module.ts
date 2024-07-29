import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ZknoidConfigModule } from 'src/config/config.module';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from './sync-events/sync-events.module';
import { ProduceResultEvent } from 'l1-lottery-contracts/build/src/PLottery';
import { ProduceResultModule } from './produce-result/produce-result.module';
import { DistributionProvingModule } from './distribution-proving/distribution-proving.module';
import { ProveReduceModule } from './reduce-proving/reduce-proving.module';
import { RoundInfoUpdaterModule } from './round-infos-updater/round-infos-updater.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        ProduceResultModule,
        DistributionProvingModule,
        RoundInfoUpdaterModule,
        ProveReduceModule,
      ],
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class WorkersModule {}
