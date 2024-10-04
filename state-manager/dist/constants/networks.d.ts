export interface Network {
    networkID: string;
    name: string;
    graphql: string;
    archive: string;
}
export declare const NetworkIds: {
    ZEKO_TESTNET: string;
    MINA_DEVNET: string;
};
export declare const NETWORKS: {
    readonly [networkId: string]: Network;
};
