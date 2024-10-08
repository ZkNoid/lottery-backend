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
import { EmptyTicketBuyingModule } from './empty-ticket-buying/empty-ticket-buying.module';
import { ApproveGiftCodesModule } from './approve-gift-codes/approve-gift-codes.module';

import { StateService } from 'src/state-service/state.service';
import { GiftTicketBuyerModule } from './gift-ticket-buyer/gift-ticket-buyer.module';

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
        EmptyTicketBuyingModule,
        ApproveGiftCodesModule,
        GiftTicketBuyerModule
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
