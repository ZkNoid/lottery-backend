import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { WorkersModule } from './workers/workers.module.js';
import { ClaimApiModule } from './claim-api/claim-api.module.js';

@Module({
  imports: [WorkersModule, ClaimApiModule],
})
export class AppModule {}
