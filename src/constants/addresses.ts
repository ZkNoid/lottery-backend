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
    'B62qp3X3dcSSwCFidpdVPxrgrhVk4T3HjzhFXPZ6BEXyuaH4ky52Cyj',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
