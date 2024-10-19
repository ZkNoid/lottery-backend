import { NestFactory } from '@nestjs/core';
import { DistributionProvingWorkersModule } from './distribution-proving/distribution-proving.module.js';

async function bootstrap() {
  const app = await NestFactory.create(DistributionProvingWorkersModule);
  app.enableCors();
  await app.listen(3041);
}
bootstrap();
