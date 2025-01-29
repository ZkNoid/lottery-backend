import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GiftCodesRequestedData } from '../schema/gift-codes-requested.schema.js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';
import { StateService } from '../../state-service/state.service.js';
import { TICKET_PRICE } from 'l1-lottery-contracts';

@Injectable()
export class ApproveGiftCodesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApproveGiftCodesService.name);

  constructor(
    @InjectModel(GiftCodesRequestedData.name)
    private giftCodesRequested: Model<GiftCodesRequestedData>,
    @InjectModel(GiftCodesData.name)
    private giftCodes: Model<GiftCodesData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {}

  async processGiftCodeRequest(giftRequested) {
    this.logger.log('Requested gift', giftRequested);
    this.logger.log('Checking tx status', giftRequested);

    if (!giftRequested.paymentHash.match(/^[5KL][1-9A-HJ-NP-Za-km-z]{50,58}$/))
      throw new Error('Incorrect tx hash');

    const txInfoRequest = await fetch(
      `${this.stateManager.network.blockberryEndpoint}/transactions/${giftRequested.paymentHash}`,
      {
        headers: {
          'x-api-key': process.env.BLOCKBERRY_API_KEY,
        },
      },
    );

    const confirmationInfoRequest = await fetch(
      `${this.stateManager.network.blockberryEndpoint}/block-confirmation/${giftRequested.paymentHash}`,
      {
        headers: {
          'x-api-key': process.env.BLOCKBERRY_API_KEY,
        },
      },
    );

    const confirmationInfo = await confirmationInfoRequest.json();
    const txInfo = await txInfoRequest.json();

    this.logger.log('Confirmation info', confirmationInfo);
    this.logger.log('Tx info', txInfo);

    if (
      txInfo.amount !=
      giftRequested.codes.length * Number(TICKET_PRICE.toBigInt() / 10n ** 9n)
    ) {
      throw new Error('Incorrect gift code amount');
    }

    const paymentHashData = await this.giftCodesRequested.findOne({
      paymentHash: giftRequested.paymentHash,
      processed: true,
    });

    if (paymentHashData) {
      throw new Error('Code already requested');
    }

    if (
      confirmationInfo.blockConfirmationsCount > 20 &&
      confirmationInfo.isCanonical &&
      confirmationInfo.txStatus == 'applied'
    ) {
      await this.giftCodesRequested.updateOne(
        {
          _id: giftRequested._id,
        },
        {
          $set: {
            processed: true,
          },
        },
      );
      for (const code of giftRequested.codes) {
        await this.giftCodes.updateOne(
          { code },
          {
            $set: {
              userAddress: txInfo.sourceAddress,
              paymentHash: txInfo.hash,
              code,
            },
          },
          {
            upsert: true,
          },
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    try {
      this.logger.log('Requested gifts checking');

      const giftsRequested = await this.giftCodesRequested.find({
        processed: { $ne: true },
        failed: { $ne: true },
      });
      this.logger.log('Requested gifts', giftsRequested);

      for (const giftRequested of giftsRequested) {
        try {
          await this.processGiftCodeRequest(giftRequested);
        } catch (e) {
          this.logger.error('Process error', e);
          await this.giftCodesRequested.updateOne(
            {
              _id: giftRequested._id,
            },
            {
              $set: {
                failed: true,
                reason: e.toString() || 'Unknown',
              },
            },
          );
        }
      }
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    }
  }
}
