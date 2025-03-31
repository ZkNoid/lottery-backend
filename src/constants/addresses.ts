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
    'B62qjYJU7zoMmH9eSxoJPZzi3XkLKUiFoGaBy8559rhzA7rdU9vvSfu',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
