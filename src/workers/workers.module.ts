import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ZknoidConfigModule } from '../config/config.module.js';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from './sync-events/sync-events.module.js';
import { CommitValueModule } from './commit-value/commit-value.module.js';
import { RevealValueModule } from './reveal-value/reveal-value.module.js';
// import { ProduceResultEvent } from 'l1-lottery-contracts/build/src/PLottery';
import { ProduceResultModule } from './produce-result/produce-result.module.js';
import { DistributionProvingModule } from './distribution-proving/distribution-proving.module.js';
import { ProveReduceModule } from './reduce-proving/reduce-proving.module.js';
import { RoundInfoUpdaterModule } from './round-infos-updater/round-infos-updater.module.js';
// import { EmptyTicketBuyingModule } from './empty-ticket-buying/empty-ticket-buying.module.js';
import { ApproveGiftCodesModule } from './approve-gift-codes/approve-gift-codes.module.js';

// import { StateService } from 'src/state-service/state.service.js';
import { GiftTicketBuyerModule } from './gift-ticket-buyer/gift-ticket-buyer.module.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        CommitValueModule,
        RevealValueModule,
        ProduceResultModule,
        DistributionProvingModule,
        RoundInfoUpdaterModule,
        ProveReduceModule,
        // ApproveGiftCodesModule,
        // GiftTicketBuyerModule,
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
