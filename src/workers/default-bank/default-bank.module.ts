import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DefaultBankData,
  DefaultBankSchema,
} from '../schema/default-bank.schema.js';
import { DefaultBankService } from './default-bank.service.js';
import { StateModule } from '../../state-service/state.module.js';
import { ConfigService } from '@nestjs/config';
import { SyncEventsModule } from '../sync-events/sync-events.module.js';
import { ZknoidConfigModule } from '../../config/config.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: DefaultBankData.name,
        schema: DefaultBankSchema,
      },
    ]),
    StateModule,
  ],
  providers: [DefaultBankService],
  exports: [],
})
export class DefaultBankModule {}
