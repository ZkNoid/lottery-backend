import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from 'src/constants/networks';
import { StateSinglton } from 'src/state-manager';
import { InjectModel } from '@nestjs/mongoose';
import {
  BaseEventDocument,
  MinaEventData,
  MinaEventDocument,
} from '../schema/events.schema';
import { Model } from 'mongoose';
import { Field, Mina, PrivateKey, UInt32, fetchLastBlock } from 'o1js';
import { HttpService } from '@nestjs/axios';
import { BLOCK_PER_ROUND, NumberPacked } from 'l1-lottery-contracts';
import { RoundsData } from '../schema/rounds.schema';

@Injectable()
export class ProveReduceService implements OnApplicationBootstrap {
  constructor() {}
  async onApplicationBootstrap() {
    await this.handleCron();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    if (StateSinglton.inReduceProving) return;
    StateSinglton.inReduceProving = true;

    try {
      console.log('REDUCE PROVING');
      for (let network of ALL_NETWORKS) {
        const slotSinceGenesis = StateSinglton.slotSinceGenesis[network.networkID];
        const startBlock =
          StateSinglton.lottery[network.networkID].startBlock.get();

        const currentRoundId = Math.floor(
          (slotSinceGenesis - Number(startBlock)) / BLOCK_PER_ROUND,
        );

        const lastReduceInRound = StateSinglton.lottery[
          network.networkID
        ].lastReduceInRound
          .get()
          .toBigInt();

        console.log(
          'Current round id',
          currentRoundId,
          'ttr',
          lastReduceInRound,
        );

        if (lastReduceInRound < currentRoundId) {
          console.log('Time to reduce');
          const sender = PrivateKey.fromBase58(process.env.PK);

          const stateM = StateSinglton.state[network.networkID];
          console.log('processedTicketData', stateM.processedTicketData);
          // Reduce tickets
          let reduceProof =
            await stateM.reduceTickets();

          console.log(
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
          console.log('Proving reduce tx');
          await tx2_1.prove();
          console.log('Proved reduce tx');
          let txResult = await tx2_1.sign([sender]).send();

          console.log(`Reduce tx successful. Hash: `, txResult.hash);
          console.log('Waiting for reduce tx');
          await txResult.wait();
        }
      }
    } catch (e) {
      console.log('Error in reduce proving', e);
    }
    StateSinglton.inReduceProving = false;
  }
}
