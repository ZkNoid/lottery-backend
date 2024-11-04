import { NestFactory } from '@nestjs/core';
import { StaketabProxyModule } from './staketab-wrapper-api/staketab-wrapper-api.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(StaketabProxyModule);
  app.useBodyParser('text');

  app.enableCors();
  await app.listen(3043);
}
bootstrap();
