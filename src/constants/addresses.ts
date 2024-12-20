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
    'B62qqtJ6BbCPzPK7ncn5ZrA2mSKD3VjdGHBA7eTjKVZgceKKE1dm249',
  [NetworkIds.MINA_MAINNET]:
    'B62qkmwNKgW5TsU95HhzLd1jFAEpsiGG27aiga1crLaUkPBeR4pZ5FU',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
