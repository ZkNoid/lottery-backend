export interface Network {
  networkID: string;
  name: string;
  graphql: string;
  archive: string;
  isMainnet: boolean,
}

export const NetworkIds = {
  ZEKO_TESTNET: 'zeko:testnet',
  MINA_DEVNET: 'mina:testnet',
  MINA_MAINNET: 'mina:mainnet',
};

export const NETWORKS: {readonly [networkId: string]: Network} = {
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
    graphql: 'https://proxy.zknoid.io/mina-node/devnet-main-node',
    archive: 'https://proxy.zknoid.io/mina-node/devnet-archive-node',
  },
  [NetworkIds.ZEKO_TESTNET]: {
    isMainnet: false,
    networkID: NetworkIds.ZEKO_TESTNET,
    name: 'Zeko',
    graphql: 'https://devnet.zeko.io/graphql',
    archive: ''
  }
};
