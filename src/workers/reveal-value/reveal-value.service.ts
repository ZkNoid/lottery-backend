import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import {
  Field,
  Mina,
  PrivateKey,
  UInt32,
  fetchAccount,
  fetchLastBlock,
} from 'o1js';
import { BLOCK_PER_ROUND, NumberPacked } from 'l1-lottery-contracts';
import { StateService } from '../../state-service/state.service.js';
import { getCurrentSlot, getLatestBlock } from '../../lib.js';
import { Model } from 'mongoose';
import { CommitData } from '../schema/commits.schema.js';
import {
  CommitValue,
  RandomManager,
} from 'node_modules/l1-lottery-contracts/build/src/Random/RandomManager.js';
import { InjectModel } from '@nestjs/mongoose';
import { ZkonRequestCoordinator, ZkonZkProgram } from 'zkon-zkapp';

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

@Injectable()
export class RevealValueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RevealValueService.name);

  constructor(
    private stateManager: StateService,
    @InjectModel(CommitData.name)
    private commitData: Model<CommitData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(networkId: string) {
    const unrevealed = await this.commitData.find({ revealed: { $eq: false } });

    for (const elem of unrevealed) {
      const round = elem.round;

      const rm =
        this.stateManager.state[networkId].randomManagers[round].contract;

      await fetchAccount({ publicKey: rm.address });

      // const randomValue = rm.curRandomValue.get();
      const randomValue = '2';

      console.log(`elem`);
      console.log(elem);

      if (+randomValue == 0 || rm.commit.get().toBigInt() == 0) {
        continue;
      } else {
        return {
          shouldStart: true,
          round,
          commitValue: elem.commitValue,
          commitSalt: elem.commitSalt,
          doc: elem,
        };
      }
    }

    return {
      shouldStart: false,
      round: 0,
    };
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    console.log('Reveal value module started');

    for (let network of ALL_NETWORKS) {
      try {
        const { shouldStart, round, commitValue, commitSalt, doc } =
          await this.checkRoundConditions(network.networkID);
        if (shouldStart) {
          this.logger.debug('Revealing value for round: ', round);

          const sender = PrivateKey.fromBase58(process.env.PK);

          this.logger.log(
            'Revealing value ',
            commitValue,
            ' salt: ',
            commitSalt,
          );

          const contract =
            this.stateManager.state[network.networkID].randomManagers[round]
              .contract;

          console.log(
            `Using: ${contract.address.toBase58()} for round: ${round}`,
          );

          console.log(`Value: ${commitValue} salt: ${commitSalt}`);

          const commitValueValue = new CommitValue({
            value: Field(commitValue),
            salt: Field(commitSalt),
          });

          console.log(
            `Commit value hash: ${commitValueValue.hash().toString()}`,
          );
          console.log(`Onchain state: ${contract.commit.get().toString()}`);

          console.log(
            `${commitValueValue.hash().toString()} =? ${contract.commit.get().toString()}`,
          );

          let tx = await Mina.transaction(
            { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
            async () => {
              contract.reveal(commitValueValue);
            },
          );
          this.logger.debug('Proving tx');
          await tx.prove();
          this.logger.debug('Proved tx');
          let txResult = await tx.sign([sender]).send();

          await this.commitData.updateOne(
            {
              _id: doc._id,
            },
            {
              $set: { revealed: true },
            },
            {
              upsert: true,
            },
          );

          this.logger.debug(`Tx successful. Hash: `, txResult.hash);
          this.logger.debug('Waiting for tx');
          await txResult.wait();
        }
      } catch (e) {
        this.logger.error('Error', e.stack);
      }
    }
  }
}
