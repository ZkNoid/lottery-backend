import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ALL_NETWORKS } from './constants/networks';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {}
}
