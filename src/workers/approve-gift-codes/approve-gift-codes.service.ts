import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Field } from 'o1js';
import { HttpService } from '@nestjs/axios';
import { StateService } from '../../state-service/state.service.js';
import { GiftCodesRequestedData } from '../schema/gift-codes-requested.schema.js';
import { checkZkappTransaction } from 'o1js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';

@Injectable()
export class ApproveGiftCodesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApproveGiftCodesService.name);

  constructor(
    @InjectModel(GiftCodesRequestedData.name)
    private giftCodesRequested: Model<GiftCodesRequestedData>,
    @InjectModel(GiftCodesData.name)
    private giftCodes: Model<GiftCodesData>,
  ) {}
  async onApplicationBootstrap() {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    try {
      this.logger.log('Requested gifts checking');

      const giftsRequested = await this.giftCodesRequested.find({
        failed: { $ne: true },
        processed: { $ne: true },
        processingStarted: { $ne: true },
      });
      this.logger.log('Requested gifts', giftsRequested);

      for (const giftRequested of giftsRequested) {
        this.logger.log('Requested gift', giftRequested);
        this.logger.log('Checking tx status', giftRequested);

        const txInfoRequest = await fetch(
          `https://api.blockberry.one/mina-devnet/v1/transactions/${giftRequested.transactionHash}`,
          {
            headers: {
              'x-api-key': process.env.BLOCKBERRY_API_KEY,
            },
          },
        );

        const confirmationInfoRequest = await fetch(
          `https://api.blockberry.one/mina-devnet/v1/block-confirmation/${giftRequested.transactionHash}`,
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
          confirmationInfo.blockConfirmationsCount > 5 &&
          confirmationInfo.isCanonical &&
          confirmationInfo.txStatus == 'applied'
        ) {
          await this.giftCodesRequested.updateOne(
            {
              _id: giftRequested._id,
            },
            {
              $set: {
                processingStarted: true,
              },
            },
          );
          for (const code of giftRequested.codes) {
            await this.giftCodes.updateOne(
              { code },
              {
                $set: {
                  userAddress: txInfo.sourceAddress,
                  transactionHash: txInfo.hash,
                  code,
                  used: false,
                  deleted: false,
                },
              },
              {
                upsert: true,
              },
            );
          }
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
        }
      }
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    }
  }
}
