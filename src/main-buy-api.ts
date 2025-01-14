import { NestFactory } from '@nestjs/core';
import { BuyApiModule } from './buy-api/buy-api.module.js';

async function bootstrap() {
  const app = await NestFactory.create(BuyApiModule);
  app.enableCors();
  await app.listen(3049);
}
bootstrap();
