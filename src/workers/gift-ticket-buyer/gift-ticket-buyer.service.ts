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
export class ApproveGiftCodesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApproveGiftCodesService.name);

  constructor(
    @InjectModel(PromoQueueData.name)
    private promoQueueData: Model<PromoQueueData>,
    @InjectModel(GiftCodesData.name)
    private giftCodes: Model<GiftCodesData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.stateManager.inReduceProving) return;
    this.stateManager.inReduceProving = true;

    try {
      this.logger.log('Promo queue checking');

      const queueRequests = await this.promoQueueData.find({
        failed: { $ne: true },
        processed: { $ne: true },
        processingStarted: { $ne: true },
      });
      this.logger.log('Promo queue checking', queueRequests);

      for (const giftRequested of queueRequests) {
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
            { sender: signerAccount, fee: Number('0.01') * 1e9 },
            async () => {
              this.stateManager.state[NetworkIds.MINA_DEVNET].plotteryManagers[
                curRound
              ].contract.buyTicket(ticket);
            },
          );

          console.log('BUY TX', tx);

          await tx.prove();
          const sentTx = await tx.sign([signer]).send();

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
        }
      }
    } catch (e) {
      this.logger.error('Approve gift codes error', e.stack);
    }
    this.stateManager.inReduceProving = false;
  }
}
