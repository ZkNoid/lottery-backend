import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncEventsService } from './sync-events.service';
import { ScheduleModule } from '@nestjs/schedule';
import {
  SyncStateData,
  SyncStateDataSchema,
} from '../schema/sync-state.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
      {
        name: SyncStateData.name,
        schema: SyncStateDataSchema,
      },
    ]),
  ],
  providers: [SyncEventsService],
})
export class SyncEventsModule {}
