import axios from 'axios';
import { NETWORKS } from './constants/networks.js';

export const getLatestBlock = async (networkId: string) => {
  const data = await axios.post(
    NETWORKS[networkId].graphql,
    JSON.stringify({
      query: `
      query {
        bestChain(maxLength:1) {
          protocolState {
            consensusState {
              blockHeight,
              slotSinceGenesis
            }
          }
        }
      }
    `,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'json',
    },
  );

  return data;
};

export const getCurrentSlot = async (): Promise<number> => {
  const latestBlock = await getLatestBlock(process.env.NETWORK_ID);

  return latestBlock.data.data.bestChain[0].protocolState.consensusState
    .slotSinceGenesis;
};
