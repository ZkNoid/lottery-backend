import { Module } from '@nestjs/common';
import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema.js';
import { MongooseModule } from '@nestjs/mongoose';
import { DeployRoundService } from './deploy-rounds.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { StateModule } from '../../state-service/state.module.js';
import { CommitData, CommitDataSchema } from '../schema/commits.schema.js';
import { RoundsData, RoundsDataSchema } from '../schema/rounds.schema.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    StateModule,
  ],
  providers: [DeployRoundService],
})
export class DeployRoundModule {}
