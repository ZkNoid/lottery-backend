import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestUpdateService } from './quest-update.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { StateModule } from '../../state-service/state.module.js';
import { CommitData, CommitDataSchema } from '../schema/commits.schema.js';
import { QuestData, QuestDataSchema } from '../schema/quest.schema.js';

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
    ]),
    StateModule,
  ],
  providers: [QuestUpdateService],
})
export class QuestUpdateModule {}
