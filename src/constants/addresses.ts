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
  [NetworkIds.MINA_DEVNET]: '',
  [NetworkIds.MINA_MAINNET]:
    'B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
