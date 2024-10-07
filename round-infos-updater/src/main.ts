import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
} from '@nestjs/microservices';
import { RoundInfosUpdaterModule } from './rounds-info-updater.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    RoundInfosUpdaterModule,
  );
  await app.listen();
}
bootstrap();
