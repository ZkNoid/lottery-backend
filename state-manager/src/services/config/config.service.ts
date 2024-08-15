export class ConfigService {
  private readonly envConfig: { [key: string]: any } = null;

  constructor() {
    this.envConfig = {
      port: process.env.SM_SERVICE_PORT,
      networkId: process.env.NETWORK_ID,
    };
  }

  get(key: string): any {
    return this.envConfig[key];
  }
}