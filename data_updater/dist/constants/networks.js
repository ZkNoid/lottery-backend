"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORKS = exports.NetworkIds = void 0;
exports.NetworkIds = {
    ZEKO_TESTNET: 'zeko:testnet',
    MINA_DEVNET: 'mina:testnet',
};
exports.NETWORKS = {
    [exports.NetworkIds.MINA_DEVNET]: {
        networkID: exports.NetworkIds.MINA_DEVNET,
        name: 'Devnet',
        graphql: 'https://api.minascan.io/node/devnet/v1/graphql',
        archive: 'https://api.minascan.io/archive/devnet/v1/graphql',
    },
    [exports.NetworkIds.ZEKO_TESTNET]: {
        networkID: exports.NetworkIds.ZEKO_TESTNET,
        name: 'Zeko',
        graphql: 'https://devnet.zeko.io/graphql',
        archive: ''
    }
};
//# sourceMappingURL=networks.js.map