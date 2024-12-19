import { Body, Controller, Post, Get } from '@nestjs/common';
import { BuyRequestDTO } from './buy-api.dto.js';
import { BuyApiService } from './buy-api.service.js';

@Controller('buy-api')
export class BuyApiController {
  constructor(private readonly buyApiService: BuyApiService) {}

  @Post('get-buy-data')
  async generateBuyParams(
    @Body() buyData: BuyRequestDTO,
  ): Promise<{ txJson: any }> {
    console.log('Received model', buyData);
    try {
      return await this.buyApiService.getBuyData(
        buyData.roundId,
        buyData.ticketNums,
        buyData.senderAccount,
        buyData.amount,
      );
    } catch (e) {
      console.log('Buy error', e.stack);
    }
  }
}
