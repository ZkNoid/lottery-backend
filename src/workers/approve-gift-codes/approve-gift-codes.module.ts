import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import {
  GiftCodesRequestedData,
  GiftCodesRequestedDataSchema,
} from '../schema/gift-codes-requested.schema';
import {
  GiftCodesData,
  GiftCodesDataSchema,
} from '../schema/gift-codes.schema';

import { ApproveGiftCodesService } from './approve-gift-codes.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: GiftCodesRequestedData.name,
        schema: GiftCodesRequestedDataSchema,
      },
      {
        name: GiftCodesData.name,
        schema: GiftCodesDataSchema,
      },
    ]),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [ApproveGiftCodesService],
})
export class ApproveGiftCodesModule {}