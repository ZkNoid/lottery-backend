import { Module } from '@nestjs/common';
import { StateManagerController } from './state-manager.controller';
import { ConfigModule } from '@nestjs/config';
import { StateService } from './services/state-manager.service';

@Module({
  imports: [
    ConfigModule.forRoot({}),
  ],
  providers: [
    StateService
  ],
  controllers: [StateManagerController],
})
export class StateManagerModule {}