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
// import { ProduceResultModule } from './produce-result/produce-result.module.js';
import { RoundInfoUpdaterModule } from './round-infos-updater/round-infos-updater.module.js';
import { ApproveGiftCodesModule } from './approve-gift-codes/approve-gift-codes.module.js';

// import { StateService } from 'src/state-service/state.service.js';
import { GiftTicketBuyerModule } from './gift-ticket-buyer/gift-ticket-buyer.module.js';
import { QuestUpdateModule } from './quest-update/quest-update.module.js';
import { RewardClaimerModule } from './reward-claimer/reward-claimer.module.js';
import { DeployRoundModule } from './deploy-rounds/deploy-rounds.module.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [
        ZknoidConfigModule,
        SyncEventsModule,
        CommitValueModule,
        RevealValueModule,
        // ProduceResultModule, Removed due to updated contract architecture
        RoundInfoUpdaterModule,
        ApproveGiftCodesModule,
        GiftTicketBuyerModule,
        QuestUpdateModule,
        RewardClaimerModule,
        DeployRoundModule,
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
