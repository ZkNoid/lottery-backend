import { Network, NetworkIds } from "src/constants/networks.js";

export const STAKETAB_NETWORKS: {readonly [networkId: string]: Network} = {
  [NetworkIds.MINA_DEVNET]: {
    networkID: NetworkIds.MINA_DEVNET,
    name: 'Devnet',
    graphql: 'https://proxy.zknoid.io/mina-node/devnet-main-node',
    archive: 'https://proxy.zknoid.io/mina-node/devnet-archive-node',
  },
  [NetworkIds.ZEKO_TESTNET]: {
    networkID: NetworkIds.ZEKO_TESTNET,
    name: 'Zeko',
    graphql: 'https://devnet.zeko.io/graphql',
    archive: ''
  }
};
