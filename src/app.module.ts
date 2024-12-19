import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { WorkersModule } from './workers/workers.module.js';
import { ClaimApiModule } from './claim-api/claim-api.module.js';
import { BuyApiModule } from './buy-api/buy-api.module.js';

import { StaketabProxyModule } from './staketab-wrapper-api/staketab-wrapper-api.module.js';

@Module({
  imports: [WorkersModule, ClaimApiModule, BuyApiModule],
})
export class AppModule {}
