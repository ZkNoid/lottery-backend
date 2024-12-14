import { NestFactory } from '@nestjs/core';
import { SecondPartyModule } from './second-party/second-party.module.js';

async function bootstrap() {
  const app = await NestFactory.create(SecondPartyModule);
  app.enableCors();
  await app.listen(3044);
}
bootstrap();
