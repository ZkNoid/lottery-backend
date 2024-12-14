import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  private isRunning = false;
  private lastRevealInRound = process.env.START_FROM_ROUND
    ? +process.env.START_FROM_ROUND
    : 0;

  constructor(
    private stateManager: StateService,
    @InjectModel(CommitData.name)
    private commitData: Model<CommitData>,
  ) {}

  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkRoundConditions(roundId: number) {
    const contract = this.stateManager.state.randomManagers[roundId].contract;

    await fetchAccount({ publicKey: contract.address });

    const COMMIT_PARTY_ID = Number(process.env.COMMIT_PARTY_ID);

    const commit =
      COMMIT_PARTY_ID == 0
        ? contract.firstCommit.get()
        : contract.secondCommit.get();

    const result = contract.result.get();

    if (commit.toBigInt() != 0 && result.toBigInt() == 0) {
      const commitData = await this.commitData.findOne({
        round: roundId,
        hash: commit.toString(),
      });

      if (!commitData) {
        this.logger.error(
          'No commit data for round.',
          roundId,
          commit.toString(),
        );
        return {
          shouldStart: false,
        };
      }

      return {
        shouldStart: true,
        commitValue: commitData.commitValue,
        commitSalt: commitData.commitSalt,
      };
    }

    if (result.toBigInt() != 0) {
      return {
        shouldStart: false,
        isRevealed: true,
      };
    }

    return {
      shouldStart: false,
      isRevealed: false,
    };

    // for (const elem of unrevealed) {
    //   const round = elem.round;

    //   const rm =
    //     this.stateManager.state[networkId].randomManagers[round].contract;

    //   await fetchAccount({ publicKey: rm.address });

    //   // Commented for better time with ZKON
    //   // const randomValue = rm.curRandomValue.get();
    //   const randomValue = '2';

    //   if (+randomValue == 0 || rm.commit.get().toBigInt() == 0) {
    //     continue;
    //   } else {
    //     return {
    //       shouldStart: true,
    //       round,
    //       commitValue: elem.commitValue,
    //       commitSalt: elem.commitSalt,
    //       doc: elem,
    //     };
    //   }
    // }

    // return {
    //   shouldStart: false,
    //   round: 0,
    // };
  }

  @Cron('*/2 * * * *')
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('Already running');
      return;
    }
    this.isRunning = true;
    console.log('Reveal value module started');

    try {
      const currentRound = await this.stateManager.getCurrentRound();

      this.logger.debug('Last reveal in round: ', this.lastRevealInRound);
      this.logger.debug('Current round: ', currentRound);

      for (
        let roundId = this.lastRevealInRound;
        roundId < currentRound;
        roundId++
      ) {
        this.logger.debug('Checking round: ', roundId);
        const { shouldStart, commitValue, commitSalt, isRevealed } =
          await this.checkRoundConditions(roundId);

        if (isRevealed) {
          this.lastRevealInRound = roundId;
          continue;
        }

        // If can't reveal current round - do not check following rounds
        if (!shouldStart) {
          break;
        }

        if (shouldStart) {
          await this.stateManager.transactionMutex.runExclusive(async () => {
            this.logger.debug('Revealing value for round: ', roundId);

            const sender = PrivateKey.fromBase58(process.env.PK);

            this.logger.log(
              'Revealing value ',
              commitValue,
              ' salt: ',
              commitSalt,
            );

            const contract =
              this.stateManager.state.randomManagers[roundId].contract;

            console.log(`Value: ${commitValue} salt: ${commitSalt}`);

            const commitValueValue = new CommitValue({
              value: Field(commitValue),
              salt: Field(commitSalt),
            });

            const COMMIT_PARTY_ID = Number(process.env.COMMIT_PARTY_ID);

            const commit =
              COMMIT_PARTY_ID == 0
                ? contract.firstCommit.get()
                : contract.secondCommit.get();

            console.log(
              `Commit value hash: ${commitValueValue.hash().toString()}`,
            );
            console.log(`Onchain state: ${commit.toString()}`);

            console.log(
              `${commitValueValue.hash().toString()} =? ${commit.toString()}`,
            );

            let tx = await Mina.transaction(
              { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
              async () => {
                COMMIT_PARTY_ID == 0
                  ? await contract.revealFirstCommit(commitValueValue)
                  : await contract.revealSecondCommit(commitValueValue);
              },
            );
            this.logger.debug('Proving tx');
            await tx.prove();
            this.logger.debug('Proved tx');
            let txResult = await tx.sign([sender]).send();

            this.logger.debug(`Tx successful. Hash: `, txResult.hash);
            this.logger.debug('Waiting for tx');
            await txResult.wait();
          });
        }
      }
    } catch (e) {
      this.logger.error('Error', e.stack);
    }

    this.isRunning = false;
  }
}
