import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
} from '@nestjs/microservices';
import { ReduceProverModule } from './reduce-prover.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ReduceProverModule,
  );
  await app.listen();
}
bootstrap();
