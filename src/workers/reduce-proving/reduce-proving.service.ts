import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../../constants/networks.js';
import { fetchAccount, Mina, PrivateKey } from 'o1js';
import { StateService } from '../../state-service/state.service.js';

@Injectable()
export class ProveReduceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProveReduceService.name);
  private isRunning = false;
  private lastReducedRound = 52;

  constructor(private stateManager: StateService) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkConditions(
    networkId: string,
    round: number,
    currentRound: number,
  ) {
    const contract =
      this.stateManager.state[networkId].plotteryManagers[round].contract;

    await fetchAccount({ publicKey: contract.address });

    const isReduced = contract.reduced.get();

    // const currentRoundId = this.stateManager.roundIds[networkId];

    // const lastReduceInRound = this.stateManager.lottery[
    //   networkId
    // ].lastReduceInRound
    //   .get()
    //   .toBigInt();

    // this.logger.debug(
    //   'Current round id',
    //   currentRoundId,
    //   'ttr',
    //   lastReduceInRound,
    // );

    // // Checking that at least one ticket bought after the last reduce round
    // let ticketBoughtAfterReduce = false;

    // for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
    //   if (this.stateManager.boughtTickets[networkId][i].length > 0) {
    //     this.logger.debug(`Found ticket in round ${i}`);
    //     ticketBoughtAfterReduce = true;
    //     break;
    //   }
    // }

    // if (lastReduceInRound < currentRoundId && !ticketBoughtAfterReduce) {
    //   this.logger.debug('No tickets bought in the round');
    // }
    console.log(`Round is reduced: ${isReduced.toBoolean()}`);
    return {
      shouldStart: round < currentRound && !isReduced.toBoolean(),
      isReduced: isReduced.toBoolean(),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('Already running');
      return;
    }

    this.isRunning = true;
    // if (this.stateManager.inReduceProving) return;
    // this.stateManager.inReduceProving = true;

    try {
      this.logger.debug('REDUCE PROVING');
      for (let network of ALL_NETWORKS) {
        const currentRound = await this.stateManager.getCurrentRound(
          network.networkID,
        );

        for (
          let roundId = this.lastReducedRound;
          roundId < currentRound;
          roundId++
        ) {
          this.logger.debug(`Checking round ${roundId}`);
          const { shouldStart, isReduced } = await this.checkConditions(
            network.networkID,
            roundId,
            currentRound,
          );

          if (isReduced) {
            this.lastReducedRound = roundId;
            continue;
          }

          // Don not check next rounds, if current round is not ready to be reduced
          if (!shouldStart) {
            break;
          }

          if (shouldStart) {
            await this.stateManager.transactionMutex.runExclusive(async () => {
              this.logger.debug(`Time to reduce ${roundId}`);
              const sender = PrivateKey.fromBase58(process.env.PK);

              const plotteryState =
                this.stateManager.state[network.networkID].plotteryManagers[
                  roundId
                ];

              // Reduce tickets
              let reduceProof = await plotteryState.reduceTickets();

              this.logger.debug(
                'Reduce proof',
                'Final state',
                reduceProof.publicOutput.finalState.toString(),
              );

              this.logger.debug('Creating transaction');
              let tx2_1 = await Mina.transaction(
                { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
                async () => {
                  await plotteryState.contract.reduceTickets(reduceProof);
                },
              );
              this.logger.debug('Proving reduce tx');
              await tx2_1.prove();
              this.logger.debug('Proved reduce tx');
              let txResult = await tx2_1.sign([sender]).send();

              this.logger.debug(`Reduce tx successful. Hash: `, txResult.hash);
              this.logger.debug('Waiting for reduce tx');
              await txResult.wait();
            });
          }
        }
      }
    } catch (e) {
      console.error('Error in reduce proving', e.stack);
    }

    this.isRunning = false;
    // this.stateManager.inReduceProving = false;
  }
}
