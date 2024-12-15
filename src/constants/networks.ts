export interface Network {
  networkID: string;
  name: string;
  graphql: string;
  archive: string;
}

export const NetworkIds = {
  ZEKO_TESTNET: 'zeko:testnet',
  MINA_DEVNET: 'mina:testnet',
  MINA_MAINNET: 'mina:mainnet',
};

export const NETWORKS: {readonly [networkId: string]: Network} = {
  [NetworkIds.MINA_MAINNET]: {
    networkID: NetworkIds.MINA_MAINNET,
    name: 'Mainnet',
    graphql: 'https://proxy.zknoid.io/mina-node/mainnet-main-node',
    archive: 'https://proxy.zknoid.io/mina-node/mainnet-archive-node',
  },
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
