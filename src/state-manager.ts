import { DistributionProof } from 'l1-lottery-contracts/build/src/DistributionProof';
import { Mina, Cache, PublicKey, UInt32, fetchAccount } from 'o1js';
import { ALL_NETWORKS, NETWORKS, NetworkIds } from './constants/networks';
import {
  DistibutionProgram,
  Lottery,
  StateManager,
} from 'l1-lottery-contracts';
import { LOTTERY_ADDRESS } from './constants/addresses';
import {
  BuyTicketEvent,
  ProduceResultEvent,
} from 'l1-lottery-contracts/build/src/Lottery';

export class StateSinglton {
  static initialized: boolean;
  static distributionProof: DistributionProof;
  static lottery: Record<string, Lottery> = {};
  static state: Record<string, StateManager> = {};

  static async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = NETWORKS[NetworkIds.MINA_DEVNET];
    console.log('Network choosing', network);

    const Network = Mina.Network({
      mina: network?.graphql,
      archive: network?.archive,
    });

    console.log('Network setting');

    Mina.setActiveInstance(Network);
    console.log('Network set');

    for (let network of ALL_NETWORKS) {
      const lottery = new Lottery(
        PublicKey.fromBase58(LOTTERY_ADDRESS[network.networkID]),
      );
      await fetchAccount({
        publicKey: lottery.address,
      });
      console.log('Lottery', lottery.startBlock.get());

      this.lottery[network.networkID] = lottery;
      this.state[network.networkID] = new StateManager(
        UInt32.from(lottery.startBlock.get()).toFields()[0],
        false,
      );
    }

    console.log('Compilation');
    await DistibutionProgram.compile({
      cache: Cache.FileSystem('./cache'),
    });
    console.log('Compilation ended');

    console.log('Compilation');
    await Lottery.compile({
      cache: Cache.FileSystem('./cache'),
    });
    console.log('Compilation ended');

    this.initialized = true;
  }

  static async fetchEvents(networkID: string, startBlock: number = 0) {
    return (await this.lottery[networkID]!.fetchEvents(UInt32.from(startBlock))).filter(
      (x) => x.event.transactionInfo.transactionStatus == 'applied',
    );
  }
}
