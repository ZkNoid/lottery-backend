import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [WorkersModule],
})
export class AppModule {}
