import { NETWORKS, NetworkIds } from './networks';

export const LOTTERY_ADDRESS: {
  readonly [networkId: string]: string | 'not-deployed';
} = {
  [NetworkIds.MINA_DEVNET]: 'B62qnQELCoxrQp7fHhBSmEr3qMRDipZrxb6HPFpv3U5feadJjsfJPXn',
  [NetworkIds.ZEKO_TESTNET]: 'not-deployed',
};
