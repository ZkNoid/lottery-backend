import { Module } from '@nestjs/common';
import { StaketabProxyController } from '../staketab-wrapper-api/staketab-wrapper-api.controller.js';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [StaketabProxyController],
})
export class StaketabProxyModule {}
