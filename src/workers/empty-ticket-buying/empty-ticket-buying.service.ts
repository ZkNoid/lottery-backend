import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { Mina, PrivateKey } from 'o1js';

@Injectable()
export class EmptyTicketBuyinService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmptyTicketBuyinService.name);

  constructor() {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    if (StateSinglton.inReduceProving) return;
    StateSinglton.inReduceProving = true;

    try {
      this.logger.debug('Empty ticket buying');
      for (let network of ALL_NETWORKS) {
        const currentRoundId = StateSinglton.roundIds[network.networkID];

        const lastReduceInRound = StateSinglton.lottery[
          network.networkID
        ].lastReduceInRound
          .get()
          .toBigInt();

        this.logger.debug(
          'Checking round id',
          currentRoundId,
          'ttb',
          lastReduceInRound,
        );
        const stateM = StateSinglton.state[network.networkID];

        // Checking that at least one ticket bought after the last reduce round
        let ticketBoughtAfterReduce = false;

        for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
          if (StateSinglton.boughtTickets[i].length > 0) {
            ticketBoughtAfterReduce = true;
            break;
          }
        }

        if (lastReduceInRound < currentRoundId && ticketBoughtAfterReduce) {
          this.logger.debug('There is ticket in current round');
        }

        if (lastReduceInRound < currentRoundId && !ticketBoughtAfterReduce) {
          this.logger.debug('Time to buy empty ticket');
          const sender = PrivateKey.fromBase58(process.env.PK);

          // Reduce tickets
          let reduceProof = await stateM.reduceTickets();

          this.logger.debug(
            'Reduce proof',
            'initial state',
            reduceProof.publicOutput.initialState.toString(),
            'Final state',
            reduceProof.publicOutput.finalState.toString(),
          );

          let tx2_1 = await Mina.transaction(
            { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
            async () => {
              await StateSinglton.lottery[network.networkID].reduceTickets(
                reduceProof,
              );
            },
          );
          this.logger.debug('Proving reduce tx');
          await tx2_1.prove();
          this.logger.debug('Proved reduce tx');
          let txResult = await tx2_1.sign([sender]).send();

          this.logger.debug(
            `Reduce tx successful. Hash: `,
            txResult.hash,
          );
          this.logger.debug('Waiting for reduce tx');
          await txResult.wait();
        }
      }
    } catch (e) {
      this.logger.error('Error', e);
    }
    StateSinglton.inReduceProving = false;
  }
}
