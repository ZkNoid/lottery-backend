import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundsData, RoundsDataSchema } from '../workers/schema/rounds.schema';
import { ClaimApiService } from './claim-api.service';
import { ClaimApiController } from './claim-api.controller';
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
    StateModule,
    ScheduleModule.forRoot(),
  ],
  providers: [ClaimApiService],
  controllers: [ClaimApiController],
})
export class ClaimApiModule {}
