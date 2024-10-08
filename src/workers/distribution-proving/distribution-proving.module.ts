import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { DistributionProvingService } from './distribution-proving.service';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { RoundsData, RoundsDataSchema } from '../schema/rounds.schema';
import { StateModule } from 'src/state-service/state.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    StateModule
  ],
  providers: [DistributionProvingService],
})
export class DistributionProvingModule {}
