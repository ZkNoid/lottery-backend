import { Body, Controller, Post, Get } from '@nestjs/common';

@Controller('health-api')
export class HealthController {
  constructor() {}

  @Get('health')
  async health(): Promise<{ status: 'OK' }> {
    return {
      status: 'OK',
    };
  }
}
