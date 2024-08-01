import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { Field, Mina, PrivateKey, PublicKey } from 'o1js';
import { Ticket } from 'l1-lottery-contracts';
import { StateService } from 'src/state-service/state.service';

@Injectable()
export class EmptyTicketBuyinService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmptyTicketBuyinService.name);

  constructor(private stateManager: StateService) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkConditions(networkId: string) {
    const currentRoundId = this.stateManager.roundIds[networkId];

    const lastReduceInRound = this.stateManager.lottery[networkId].lastReduceInRound
      .get()
      .toBigInt();

    this.logger.debug(
      'Checking round id',
      currentRoundId,
      'ttb',
      lastReduceInRound,
    );
    const stateM = this.stateManager.state[networkId];

    // Checking that at least one ticket bought after the last reduce round
    let ticketBoughtAfterReduce = false;

    for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
      if (this.stateManager.boughtTickets[networkId][i].length > 0) {
        this.logger.debug(`Found ticket in round ${i}`);

        ticketBoughtAfterReduce = true;
        break;
      }
    }

    for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
      if (this.stateManager.boughtTickets[networkId][i].length > 0) {
        this.logger.debug(`Found ticket in round ${i}`);

        ticketBoughtAfterReduce = true;
        break;
      }
    }

    if (lastReduceInRound < currentRoundId && ticketBoughtAfterReduce) {
      this.logger.debug('There is ticket in current round');
    }

    return lastReduceInRound < currentRoundId && !ticketBoughtAfterReduce;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    if (this.stateManager.inReduceProving) return;
    this.stateManager.inReduceProving = true;

    try {
      this.logger.debug('Empty ticket buying');
      for (let network of ALL_NETWORKS) {
        if (await this.checkConditions(network.networkID)) {
          this.logger.debug('Time to buy empty ticket');
          const sender = PrivateKey.fromBase58(process.env.PK);
          const ticket = Ticket.from(
            [1, 1, 1, 1, 1, 1],
            this.stateManager.lottery[network.networkID].address,
            0,
          );

          // Buy empty ticket
          let tx2_1 = await Mina.transaction(
            { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
            async () => {
              await this.stateManager.lottery[network.networkID].buyTicket(
                ticket,
                Field.from(this.stateManager.roundIds[network.networkID]),
              );
            },
          );

          this.logger.debug('Proving buy tx');
          await tx2_1.prove();
          this.logger.debug('Proved buy tx');
          let txResult = await tx2_1.sign([sender]).send();

          this.logger.debug(`Buy tx successful. Hash: `, txResult.hash);
          this.logger.debug('Waiting for buy tx');
          await txResult.wait();
        }
      }
    } catch (e) {
      this.logger.error('Error', e.stack);
    }
    this.stateManager.inReduceProving = false;
  }
}
