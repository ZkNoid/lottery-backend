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
import { NetworkIds } from '../../constants/networks.js';

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

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    if (this.isRunning) {
      this.logger.debug('Already running');
      return;
    }
    this.isRunning = true;

    try {
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

      const dbPromo = await this.giftCodes.findOneAndUpdate(
        {
          code: giftRequested.giftCode,
          used: false,
        },
        {
          $set: {
            used: true,
          },
        },
      );

      if (dbPromo) {
        await this.stateManager.transactionMutex.runExclusive(async () => {
          try {
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

            const curRound = await this.stateManager.getCurrentRound(
              NetworkIds.MINA_DEVNET,
            );

            let tx = await Mina.transaction(
              { sender: signerAccount, fee: Number('0.1') * 1e9 },
              async () => {
                this.stateManager.state[
                  NetworkIds.MINA_DEVNET
                ].plotteryManagers[curRound].contract.buyTicket(ticket);
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
                  processingStarted: false,
                },
              },
            );

            await this.giftCodes.updateOne(
              {
                _id: giftRequested._id,
              },
              {
                $set: {
                  buyTxHash: sentTx.hash,
                },
              },
            );
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
                },
              },
            );
          }
        });
      }
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    }

    this.isRunning = false;
  }
}
