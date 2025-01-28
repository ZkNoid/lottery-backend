import axios from 'axios';
import { NETWORKS } from './constants/networks.js';
import { Account, fetchAccount, Field, Mina, PublicKey } from 'o1js';
import {
  addCachedAccount,
  getCachedAccount,
} from 'node_modules/o1js/dist/node/lib/mina/fetch.js';

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

export const LocalContext = async (zkAppAddress: PublicKey) => {
  await fetchAccount({ publicKey: zkAppAddress });
  let cachedZkappAccount = getCachedAccount(zkAppAddress, Field(1))!;

  if (!cachedZkappAccount.zkapp) {
    throw Error(`Account ${zkAppAddress.toBase58()} is not a zkApp`);
  }

  const restoreState = (state: Account) => {
    addCachedAccount(state);
  };

  const restoreCurrentState = () => {
    restoreState(cachedZkappAccount);
  };

  const updateCurrentState = (tx: Mina.Transaction<false, false>) => {
    for (const accountUpdate of tx.transaction.accountUpdates) {
      for (let i = 0; i < accountUpdate.body.update.appState.length; i++) {
        const update = accountUpdate.body.update.appState[i];
        if (update.isSome.toBoolean()) {
          cachedZkappAccount.zkapp!.appState[i] = update.value;
        }
      }
    }
  };

  return {
    transaction: async (
      txParams: Mina.FeePayerSpec,
      f: () => Promise<void>,
    ) => {
      let tx = await Mina.transaction(txParams, async () => {
        restoreCurrentState();
        await f();
      });

      updateCurrentState(tx);

      return tx;
    },
  };
};
