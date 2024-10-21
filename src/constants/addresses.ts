import { NETWORKS, NetworkIds } from './networks.js';

// export const LOTTERY_ADDRESS: {
//   readonly [networkId: string]: string | 'not-deployed';
// } = {
//   [NetworkIds.MINA_DEVNET]:
//     'B62qrrQ7HNEehSKYwuuApu8DNrCMjDi18UjQYs7nEGRvo3cA1zcMG8U',
//   [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
// };

export const FACTORY_ADDRESS: {
  readonly [networkId: string]: string | 'not-deployed';
} = {
  [NetworkIds.MINA_DEVNET]:
    'B62qqBirm9eB7q53Ejg6fodYNoWVG2LHqp3uyvBe542cQEMUCoA9w6u',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
