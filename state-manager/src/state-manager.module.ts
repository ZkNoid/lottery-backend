import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { StateManagerController } from './state-manager.controller';
import { StateService } from './services/state-manager.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import configuration from './config/configuration';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MinaEventData, MinaEventDataSchema } from './schemas/events.schema';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      {
        name: MinaEventData.name,
        schema: MinaEventDataSchema,
      },
    ]),
    ClientsModule.register([
      {
        name: 'STATE_MANAGER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://rabbitmq:5672'],
          queue: 'state_manager_queue',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [StateService],
  controllers: [StateManagerController],
})
export class StateManagerModule {}
