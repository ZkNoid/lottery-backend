import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ProduceResultService } from './produce-result.service';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { StateModule } from 'src/state-service/state.module';


@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
    ]),
    StateModule
  ],
  providers: [ProduceResultService],
})
export class ProduceResultModule {}
