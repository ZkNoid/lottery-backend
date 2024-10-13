import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  RoundsData,
  RoundsDataSchema,
} from '../workers/schema/rounds.schema.js';
import { ClaimApiService } from './claim-api.service.js';
import { ClaimApiController } from './claim-api.controller.js';
import { StateModule } from '../state-service/state.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    StateModule,
  ],
  providers: [ClaimApiService],
  controllers: [ClaimApiController],
})
export class ClaimApiModule {}
