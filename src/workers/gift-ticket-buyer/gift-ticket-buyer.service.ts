import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GiftCodesRequestedData } from '../schema/gift-codes-requested.schema.js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';
import { PromoQueueData } from '../schema/promo-queue.schema.js';
import { Ticket } from 'l1-lottery-contracts';
import { Field, Mina, PrivateKey, PublicKey } from 'o1js';
import { StateService } from '../../state-service/state.service.js';

@Injectable()
export class GiftCodesBuyerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GiftCodesBuyerService.name);
  private isRunning = false;

  constructor(
    @InjectModel(PromoQueueData.name)
    private promoQueueData: Model<PromoQueueData>,
    @InjectModel(GiftCodesData.name)
    private giftCodes: Model<GiftCodesData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {}

  async processPromoRequest(giftRequested) {
    const dbPromo = await this.giftCodes.findOneAndUpdate(
      {
        code: giftRequested.giftCode,
        used: {$ne: true},
      },
      {
        $set: {
          used: true,
        },
      },
    );

    if (!dbPromo) {
      throw new Error('No promo');
    }

    await this.stateManager.transactionMutex.runExclusive(async () => {
      const signer = PrivateKey.fromBase58(
        process.env.GIFT_CODES_TREASURY_PRIVATE,
      );
      console.log('Db promo found', dbPromo);
      const signerAccount = PublicKey.fromBase58(
        signer.toPublicKey().toBase58(),
      );

      const ticket = Ticket.from(
        giftRequested.ticket.numbers,
        PublicKey.fromBase58(giftRequested.userAddress),
        1,
      );
      console.log('Making tx from', signerAccount.toBase58());

      const curRound = await this.stateManager.getCurrentRound();

      let tx = await Mina.transaction(
        { sender: signerAccount, fee: Number('0.1') * 1e9 },
        async () => {
          await this.stateManager.state.plotteryManagers[
            curRound
          ].contract.buyTicket(ticket);
        },
      );

      this.logger.log('BUY TX', tx);

      await tx.prove();
      this.logger.log('Proved, Waiting for send');
      const sentTx = await tx.sign([signer]).send();
      this.logger.log('Got tx');

      await this.promoQueueData.updateOne(
        {
          _id: giftRequested._id,
        },
        {
          $set: {
            processed: true,
            buyTxHash: sentTx.hash,
            processingStarted: false,
          },
        },
      );

      await this.giftCodes.updateOne(
        {
          code: giftRequested.giftCode,
        },
        {
          $set: {
            buyTxHash: sentTx.hash,
          },
        },
      );
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }
    this.isRunning = true;

    this.logger.log('Promo queue checking');

    const giftRequested = await this.promoQueueData.findOneAndUpdate(
      {
        failed: { $ne: true },
        processed: { $ne: true },
        processingStarted: { $ne: true },
      },
      {
        $set: {
          processingStarted: true,
        },
      },
    );

    if (!giftRequested) {
      this.logger.log('No gift codes left');
      this.isRunning = false;
      return;
    }

    this.logger.log('Promo queue request', giftRequested);

    try {
      await this.processPromoRequest(giftRequested);
    } catch (e) {
      this.logger.error('Buy gift codes error', e);

      await this.promoQueueData.updateOne(
        {
          _id: giftRequested._id,
        },
        {
          $set: {
            failed: true,
            processingStarted: false,
            reason: e.toString(),
          },
        },
      );
    }

    this.isRunning = false;
  }
}
