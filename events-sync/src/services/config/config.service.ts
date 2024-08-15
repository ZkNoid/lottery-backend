import { Transport } from '@nestjs/microservices';

export class ConfigService {
  private readonly envConfig: { [key: string]: any } = null;

  constructor() {
    this.envConfig = {
      port: process.env.EVENTS_SYNC_SERVICE_PORT,
      networkId: process.env.NETWORK_ID
    };
    this.envConfig.stateManagerService = {
      options: {
        port: process.env.SM_SERVICE_PORT,
        host: process.env.SM_SERVICE_HOST,
      },
      transport: Transport.TCP,
    };
  }

  get(key: string): any {
    return this.envConfig[key];
  }
}
