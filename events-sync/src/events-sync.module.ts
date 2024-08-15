import { Module } from '@nestjs/common';
import { EventsSyncController } from './events-sync.controller';
import { ClientProxyFactory } from '@nestjs/microservices';
import { ConfigService } from './services/config/config.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot()
  ],
  controllers: [EventsSyncController],
  providers: [
    ConfigService,
    {
      provide: 'SM_SERVICE',
      useFactory: (configService: ConfigService) => {
        const mailerServiceOptions = configService.get('stateManagerService');
        return ClientProxyFactory.create(mailerServiceOptions);
      },
      inject: [ConfigService],
    },
  ],
})
export class EventsSyncModule {}
