import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { ProveReduceService } from './reduce-proving.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { StateModule } from '../../state-service/state.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
    ]),
    StateModule,
  ],
  providers: [ProveReduceService],
})
export class ProveReduceModule {}
