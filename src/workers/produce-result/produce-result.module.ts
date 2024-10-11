import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { ProduceResultService } from './produce-result.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
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
  providers: [ProduceResultService],
})
export class ProduceResultModule {}
