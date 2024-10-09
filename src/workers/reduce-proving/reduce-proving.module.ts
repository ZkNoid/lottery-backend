// import { Module } from '@nestjs/common';
// import { MinaEventData, MinaEventDataSchema } from '../schema/events.schema';
// import { MongooseModule } from '@nestjs/mongoose';
// import { ProveReduceService } from './reduce-proving.service';
// import { ScheduleModule } from '@nestjs/schedule';
// import { StateModule } from 'src/state-service/state.module';

// @Module({
//   imports: [
//     ScheduleModule.forRoot(),
//     MongooseModule.forFeature([
//       {
//         name: MinaEventData.name,
//         schema: MinaEventDataSchema,
//       },
//     ]),
//     StateModule
//   ],
//   providers: [ProveReduceService],
// })
// export class ProveReduceModule {}
