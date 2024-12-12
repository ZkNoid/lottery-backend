import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { StateService } from '../../state-service/state.service.js';
import { RewardClaimerService } from './reward-claimer.service.js';
import {
  ClaimRequestData,
  ClaimRequestDataSchema,
} from '../schema/claim-request.schema.js';
import { StateModule } from '../../state-service/state.module.js';
import { RoundInfoUpdaterModule } from '../round-infos-updater/round-infos-updater.module.js';
import { RoundInfoUpdaterService } from '../round-infos-updater/round-infos-updater.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: ClaimRequestData.name,
        schema: ClaimRequestDataSchema,
      },
    ]),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
    StateModule,
    RoundInfoUpdaterModule,
  ],
  providers: [RewardClaimerService],
})
export class RewardClaimerModule {}
