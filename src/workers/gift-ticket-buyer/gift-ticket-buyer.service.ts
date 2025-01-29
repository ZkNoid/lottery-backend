import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document, ObjectId, Types } from 'mongoose';
import { GiftCodesRequestedData } from '../schema/gift-codes-requested.schema.js';
import { GiftCodesData } from '../schema/gift-codes.schema.js';
import { PromoQueueData } from '../schema/promo-queue.schema.js';
import { Ticket } from 'l1-lottery-contracts';
import { fetchAccount, Field, Mina, PrivateKey, PublicKey } from 'o1js';
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

  async rejectRequests(_ids: Types.ObjectId[], reason: string) {
    await this.promoQueueData.updateOne(
      {
        _id: { $in: _ids },
      },
      {
        $set: {
          failed: true,
          processingStarted: false,
          reason,
        },
      },
    );
  }

  async rejectDuplicateRequests(
    giftRequested: (Document<unknown, {}, PromoQueueData> & PromoQueueData)[],
  ) {
    let usedGiftCodes = [];
    let uniqueRequests = [];

    for (const request of giftRequested) {
      if (usedGiftCodes.includes(request.giftCode)) {
        await this.rejectRequests([request._id], 'Gift code already used');
        continue;
      }

      usedGiftCodes.push(request.giftCode);
      uniqueRequests.push(request);
    }

    return uniqueRequests;
  }

  async rejectRequestsWithInvalidCodes(
    uniqueRequests: (Document<unknown, {}, PromoQueueData> & PromoQueueData)[],
  ) {
    let readyRequests = [];

    for (const request of uniqueRequests) {
      const dbPromo = await this.giftCodes.updateOne(
        {
          code: request.giftCode,
          used: { $ne: true },
        },
        {
          $set: {
            used: true,
          },
        },
      );

      if (dbPromo.modifiedCount == 0) {
        await this.rejectRequests([request._id], 'No such unused gift code');
      } else {
        readyRequests.push(request);
      }
    }

    return readyRequests;
  }

  async processGiftCodeChunk(
    requests: Document<unknown, {}, PromoQueueData> & PromoQueueData[],
    nonce: number,
    signer: PrivateKey,
  ) {
    const signerAccount = signer.toPublicKey();

    const tickets = requests.map((request) =>
      Ticket.from(
        request.ticket.numbers,
        PublicKey.fromBase58(request.userAddress),
        1,
      ),
    );
    const requestIds = requests.map((request) => request._id);
    const giftCodes = requests.map((request) => request.giftCode);

    const curRound = await this.stateManager.getCurrentRound();

    try {
      let tx = await Mina.transaction(
        {
          sender: signerAccount,
          fee: Number('0.1') * 1e9,
          nonce,
          memo: 'ZkNoid: Gift tickets purchase',
        },
        async () => {
          for (const ticket of tickets) {
            await this.stateManager.state.plotteryManagers[
              curRound
            ].contract.buyTicket(ticket);
          }
        },
      );

      // this.logger.log('BUY TX', tx);

      await tx.prove();
      this.logger.log('Proved, Waiting for send');
      const sentTx = await tx.sign([signer]).send();

      // Update buyTxHash so if server is restarted, we would be able to check if transaction was successful
      await this.promoQueueData.updateOne(
        {
          _id: { $in: requestIds },
        },
        {
          $set: {
            buyTxHash: sentTx.hash,
          },
        },
      );

      let waitPromise = sentTx
        .wait()
        .then(async (tx) => {
          await this.promoQueueData.updateOne(
            {
              _id: { $in: requestIds },
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
              code: { $in: giftCodes },
            },
            {
              $set: {
                buyTxHash: sentTx.hash,
              },
            },
          );
        })
        .catch(async (e) => {
          await this.rejectRequests(requestIds, e.toString());
        });

      return { transaction: waitPromise, source: requests, success: true };
    } catch (e) {
      await this.rejectRequests(requestIds, e.toString());
      return { success: false };
    }
  }

  async processManyPromoRequest(
    giftRequested: (Document<unknown, {}, PromoQueueData> & PromoQueueData)[],
  ) {
    // Start processing
    await this.promoQueueData.updateMany(
      {
        _id: { $in: giftRequested.map((request) => request._id) },
      },
      { $set: { processingStarted: true } },
    );

    // Remove requests with same gift code
    let uniqueRequests = await this.rejectDuplicateRequests(giftRequested);

    // Remove requests with invalid gift codes
    let readyRequests =
      await this.rejectRequestsWithInvalidCodes(uniqueRequests);

    // Run batch of buy gift codes
    await this.stateManager.transactionMutex.runExclusive(async () => {
      const signer = PrivateKey.fromBase58(
        process.env.GIFT_CODES_TREASURY_PRIVATE,
      );

      const signerAccount = PublicKey.fromBase58(
        signer.toPublicKey().toBase58(),
      );

      const account = await fetchAccount({ publicKey: signerAccount });
      let nonce = +account.account.nonce;

      let transactions = [];

      let requestChunks = [];

      const chunkSize = process.env.PROMO_CHUNK_SIZE
        ? +process.env.PROMO_CHUNK_SIZE
        : 1;

      for (let i = 0; i < readyRequests.length; i += chunkSize) {
        requestChunks.push(readyRequests.slice(i, i + chunkSize));
      }

      for (const chunk of requestChunks) {
        transactions.push(
          await this.processGiftCodeChunk(chunk, nonce++, signer),
        );
      }

      await Promise.all(
        transactions.filter((tx) => tx.success).map((tx) => tx.transaction),
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

    const batchSize = process.env.PROMO_BATCH_SIZE
      ? +process.env.PROMO_BATCH_SIZE
      : 1;

    try {
      this.logger.log('Promo queue checking');

      // Get waiting gift codes
      const giftRequested = await this.promoQueueData
        .find({
          failed: { $ne: true },
          processed: { $ne: true },
          processingStarted: { $ne: true },
        })
        .limit(batchSize);

      if (giftRequested.length == 0) {
        this.logger.log('No gift codes left');
        this.isRunning = false;
        return;
      }

      this.logger.log('Promo queue request', giftRequested);

      try {
        await this.processManyPromoRequest(giftRequested);
      } catch (e) {
        for (const request of giftRequested) {
          await this.rejectRequests([request._id], e.toString());
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
