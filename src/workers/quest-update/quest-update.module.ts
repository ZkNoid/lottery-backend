import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestUpdateService } from './quest-update.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { StateModule } from '../../state-service/state.module.js';
import { QuestData, QuestDataSchema } from '../schema/quest.schema.js';
import { StatusesData, StatusesDataSchema } from '../schema/statuses.schema.js';
import {
  GiftCodesData,
  GiftCodesDataSchema,
} from '../schema/gift-codes.schema.js';
import {
  PromoQueueData,
  PromoQueueDataSchema,
} from '../schema/promo-queue.schema.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
      {
        name: QuestData.name,
        schema: QuestDataSchema,
      },
      {
        name: GiftCodesData.name,
        schema: GiftCodesDataSchema,
      },
      {
        name: PromoQueueData.name,
        schema: PromoQueueDataSchema,
      },
    ]),

    MongooseModule.forFeature(
      [
        {
          name: StatusesData.name,
          schema: StatusesDataSchema,
        },
      ],
      'questDb',
    ),
    StateModule,
  ],
  providers: [QuestUpdateService],
})
export class QuestUpdateModule {}
