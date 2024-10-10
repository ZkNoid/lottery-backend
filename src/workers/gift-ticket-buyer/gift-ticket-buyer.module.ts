// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { ScheduleModule } from '@nestjs/schedule';
// import { HttpModule } from '@nestjs/axios';
// import {
//   GiftCodesRequestedData,
//   GiftCodesRequestedDataSchema,
// } from '../schema/gift-codes-requested.schema.js';

// import {
//   PromoQueueData,
//   PromoQueueDataSchema,
// } from '../schema/promo-queue.schema.js';

// import {
//   GiftCodesData,
//   GiftCodesDataSchema,
// } from '../schema/gift-codes.schema.js';

// import { ApproveGiftCodesService } from './gift-ticket-buyer.service.js';
// import { StateService } from 'src/state-service/state.service.js';

// @Module({
//   imports: [
//     ScheduleModule.forRoot(),
//     MongooseModule.forFeature([
//       {
//         name: GiftCodesRequestedData.name,
//         schema: GiftCodesRequestedDataSchema,
//       },
//       {
//         name: GiftCodesData.name,
//         schema: GiftCodesDataSchema,
//       },
//       {
//         name: PromoQueueData.name,
//         schema: PromoQueueDataSchema,
//       },
//     ]),
//     HttpModule.registerAsync({
//       useFactory: () => ({
//         timeout: 5000,
//         maxRedirects: 5,
//       }),
//     }),
//   ],
//   providers: [ApproveGiftCodesService, StateService],
// })
// export class GiftTicketBuyerModule {}
