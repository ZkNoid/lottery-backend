import { Body, Controller, Post, Get } from '@nestjs/common';
import { ClaimRequestDTO } from './claim-api.dto.js';
import { ClaimApiService } from './claim-api.service.js';

@Controller('claim-api')
export class ClaimApiController {
  constructor(private readonly claimApiService: ClaimApiService) {}

  @Post('get-claim-data')
  async generateClaimParams(
    @Body() claimData: ClaimRequestDTO,
  ): Promise<{ rp: any }> {
    console.log('Received model', claimData);
    try {
      return await this.claimApiService.getClaimData(
        claimData.roundId,
        claimData.networkID,
        claimData.ticketNums,
        claimData.senderAccount,
        claimData.amount,
      );
    } catch (e) {
      console.log('Claim error', e.stack);
    }
  }
  @Get('health')
  async health(): Promise<{ status: 'OK' }> {
    return {
      status: 'OK',
    };
  }
}
