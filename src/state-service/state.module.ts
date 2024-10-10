import { Module } from '@nestjs/common';
import { StateService } from './state.service.js';

@Module({
  imports: [],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
