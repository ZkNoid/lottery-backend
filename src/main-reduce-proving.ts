import { NestFactory } from '@nestjs/core';
import { ProveReduceWorkersModule } from './reduce-proving/reduce-proving.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ProveReduceWorkersModule);
  app.enableCors();
  await app.listen(3042);
}
bootstrap();
