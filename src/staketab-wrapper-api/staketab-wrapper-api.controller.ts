import { HttpService } from '@nestjs/axios';
import { Body, Controller, Post, Get, Res, Req } from '@nestjs/common';
import { NETWORKS, NetworkIds } from '../constants/networks.js';
import { Response } from 'express';

@Controller('mina-node')
export class StaketabProxyController {
  constructor(private readonly httpService: HttpService) {}

  @Post('devnet-main-node')
  async devnetMainNode(
    @Body() body,
    @Res() response: Response,
  ) {

    const data = await this.httpService.axiosRef.post(
      NETWORKS[NetworkIds.MINA_DEVNET].graphql,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        responseType: 'json',
      },
    );

    response
      .status(data.status)
      .send(data.data);
  }

  @Post('devnet-archive-node')
  async devnetArchiveNode(
    @Body() body,
    @Res() response: Response,
  ) {

    const data = await this.httpService.axiosRef.post(
      NETWORKS[NetworkIds.MINA_DEVNET].archive,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        responseType: 'json',
      },
    );

    response
      .status(data.status)
      .send(data.data);
  }
}
