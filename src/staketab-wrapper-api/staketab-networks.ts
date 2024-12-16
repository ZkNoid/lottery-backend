import { Network, NetworkIds } from "../constants/networks.js";

export const STAKETAB_NETWORKS: {readonly [networkId: string]: Network} = {
  [NetworkIds.MINA_MAINNET]: {
    isMainnet: true,
    networkID: NetworkIds.MINA_MAINNET,
    name: 'Mainnet',
    graphql: 'https://api.minascan.io/node/mainnet/v1/graphql',
    archive: 'https://api.minascan.io/archive/mainnet/v1/graphql',
  },
  [NetworkIds.MINA_DEVNET]: {
    isMainnet: false,
    networkID: NetworkIds.MINA_DEVNET,
    name: 'Devnet',
    graphql: 'https://api.minascan.io/node/devnet/v1/graphql',
    archive: 'https://api.minascan.io/archive/devnet/v1/graphql',
  },
  [NetworkIds.ZEKO_TESTNET]: {
    isMainnet: false,
    networkID: NetworkIds.ZEKO_TESTNET,
    name: 'Zeko',
    graphql: 'https://devnet.zeko.io/graphql',
    archive: ''
  }
};
