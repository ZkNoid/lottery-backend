import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  RoundsData,
  RoundsDataSchema,
} from '../workers/schema/rounds.schema.js';
import { BuyApiService } from './buy-api.service.js';
import { BuyApiController } from './buy-api.controller.js';
import { StateModule } from '../state-service/state.module.js';
import { ZknoidConfigModule } from '../config/config.module.js';
import { ConfigService } from '@nestjs/config';
import { HealthController } from '../health-api/health-api.controller.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ZknoidConfigModule,
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_QUEST_DB,
      }),
      inject: [ConfigService],
      connectionName: 'questDb'
    }),
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      {
        name: RoundsData.name,
        schema: RoundsDataSchema,
      },
    ]),
    StateModule
  ],
  providers: [BuyApiService],
  controllers: [BuyApiController, HealthController],
})
export class BuyApiModule {}