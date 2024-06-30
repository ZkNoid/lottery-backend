import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StateSinglton } from './state-manager';
import { ALL_NETWORKS } from './constants/networks';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    await StateSinglton.initialize();
  }
}
