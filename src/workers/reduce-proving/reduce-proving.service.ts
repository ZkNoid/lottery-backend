// import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { ALL_NETWORKS } from 'src/constants/networks.js';
// import { Mina, PrivateKey } from 'o1js';
// import { StateService } from 'src/state-service/state.service.js';

// @Injectable()
// export class ProveReduceService implements OnApplicationBootstrap {
//   private readonly logger = new Logger(ProveReduceService.name);

//   constructor(private stateManager: StateService) {}
//   async onApplicationBootstrap() {
//     // await this.handleCron();
//   }

//   async checkConditions(networkId: string) {
//     const currentRoundId = this.stateManager.roundIds[networkId];

//     const lastReduceInRound = this.stateManager.lottery[networkId].lastReduceInRound
//       .get()
//       .toBigInt();

//     this.logger.debug(
//       'Current round id',
//       currentRoundId,
//       'ttr',
//       lastReduceInRound,
//     );

//     // Checking that at least one ticket bought after the last reduce round
//     let ticketBoughtAfterReduce = false;

//     for (let i = Number(lastReduceInRound) + 1; i <= currentRoundId; i++) {
//       if (this.stateManager.boughtTickets[networkId][i].length > 0) {
//         this.logger.debug(`Found ticket in round ${i}`);
//         ticketBoughtAfterReduce = true;
//         break;
//       }
//     }

//     if (lastReduceInRound < currentRoundId && !ticketBoughtAfterReduce) {
//       this.logger.debug('No tickets bought in the round');
//     }
//     return lastReduceInRound < currentRoundId && ticketBoughtAfterReduce;
//   }

//   @Cron(CronExpression.EVERY_5_MINUTES)
//   async handleCron() {
//     if (this.stateManager.inReduceProving) return;
//     this.stateManager.inReduceProving = true;

//     try {
//       this.logger.debug('REDUCE PROVING');
//       for (let network of ALL_NETWORKS) {
//         if (await this.checkConditions(network.networkID)) {
//           this.logger.debug('Time to reduce');
//           const sender = PrivateKey.fromBase58(process.env.PK);

//           const stateM = this.stateManager.state[network.networkID];

//           // Reduce tickets
//           let reduceProof = await stateM.reduceTickets();

//           this.logger.debug(
//             'Reduce proof',
//             'initial state',
//             reduceProof.publicOutput.initialState.toString(),
//             'Final state',
//             reduceProof.publicOutput.finalState.toString(),
//           );

//           let tx2_1 = await Mina.transaction(
//             { sender: sender.toPublicKey(), fee: Number('0.01') * 1e9 },
//             async () => {
//               await this.stateManager.lottery[network.networkID].reduceTickets(
//                 reduceProof,
//               );
//             },
//           );
//           this.logger.debug('Proving reduce tx');
//           await tx2_1.prove();
//           this.logger.debug('Proved reduce tx');
//           let txResult = await tx2_1.sign([sender]).send();

//           this.logger.debug(`Reduce tx successful. Hash: `, txResult.hash);
//           this.logger.debug('Waiting for reduce tx');
//           await txResult.wait();
//         }
//       }
//     } catch (e) {
//       console.error('Error in reduce proving', e.stack);
//     }
//     this.stateManager.inReduceProving = false;
//   }
// }
