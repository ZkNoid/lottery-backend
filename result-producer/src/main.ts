import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
} from '@nestjs/microservices';
import { ResultProducerModule } from './result-producer.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ResultProducerModule,
  );
  await app.listen();
}
bootstrap();
