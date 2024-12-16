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
    'B62qrEZ2z4ERbYKVW8RMChVEaWE8hDEzSuoAV46RHFZyyxv5oR6NXda',
  [NetworkIds.MINA_MAINNET]:
    'B62qoJ59ASv7orJxqM7uVXeyeBf2C3TaPC3rcCe1viJCrQnUb5Hv65X',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
