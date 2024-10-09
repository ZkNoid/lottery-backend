// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { RoundInfoUpdaterService } from './round-infos-updater.service';
// import { ScheduleModule } from '@nestjs/schedule';
// import { HttpModule } from '@nestjs/axios';
// import { RoundsData, RoundsDataSchema } from '../schema/rounds.schema';
// import { StateModule } from 'src/state-service/state.module';

// @Module({
//   imports: [
//     ScheduleModule.forRoot(),
//     MongooseModule.forFeature([
//       {
//         name: RoundsData.name,
//         schema: RoundsDataSchema,
//       },
//     ]),
//     HttpModule.registerAsync({
//       useFactory: () => ({
//         timeout: 5000,
//         maxRedirects: 5,
//       }),
//     }),
//     StateModule
//   ],
//   providers: [RoundInfoUpdaterService],
// })
// export class RoundInfoUpdaterModule {}
