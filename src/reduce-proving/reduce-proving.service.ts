import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ALL_NETWORKS } from '../constants/networks.js';
import { fetchAccount, Field, Mina, PrivateKey, Proof } from 'o1js';
import { StateService } from '../state-service/state.service.js';
import {
  LotteryAction,
  TicketReduceProgram,
  TicketReduceProofPublicInput,
} from 'node_modules/l1-lottery-contracts/build/src/Proofs/TicketReduceProof.js';
import {
  generateNumbersSeed,
  NumberPacked,
  TicketReduceProof,
} from 'l1-lottery-contracts';
import { MerkleMap20, Ticket } from 'l1-lottery-contracts';
import { Model } from 'mongoose';
import { RoundsData } from '../workers/schema/rounds.schema.js';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ProveReduceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProveReduceService.name);
  private isRunning = false;
  private lastProducedRound = process.env.START_FROM_ROUND
    ? +process.env.START_FROM_ROUND
    : 0;

  constructor(
    @InjectModel(RoundsData.name)
    private rounds: Model<RoundsData>,
    private stateManager: StateService,
  ) {}
  async onApplicationBootstrap() {
    // await this.handleCron();
  }

  async checkConditions(
    networkId: string,
    round: number,
    currentRound: number,
  ) {
    const contract =
      this.stateManager.state[networkId].plotteryManagers[round].contract;
    const rm =
      this.stateManager.state[networkId].randomManagers[round].contract;

    await fetchAccount({ publicKey: contract.address });
    await fetchAccount({ publicKey: rm.address });

    const isProduced = contract.result.get();
    const haveRandomValue = rm.result.get();

    console.log(`Round is produced: ${isProduced.toBoolean()}`);
    return {
      shouldStart:
        round < currentRound &&
        !isProduced.toBoolean() &&
        haveRandomValue.toBoolean(),
      isProduced: isProduced.toBoolean(),
    };
  }

  async reduceTickets(
    networkId: string,
    roundId: number,
  ): Promise<TicketReduceProof> {
    const contract =
      this.stateManager.state[networkId].plotteryManagers[roundId].contract;
    const rm =
      this.stateManager.state[networkId].randomManagers[roundId].contract;
    const actionLists = await contract.reducer.fetchActions();

    // Compute winning numbers
    const rmResult = rm.result.get();
    const winningNumbers = generateNumbersSeed(rmResult);
    const winningNumbersPacked = NumberPacked.pack(winningNumbers);

    const ticketMap = new MerkleMap20();

    // ticketMap.set(Field.from(0), F)

    // All this params can be random for init function, because init do not use them
    let input = new TicketReduceProofPublicInput({
      action: new LotteryAction({
        ticket: Ticket.random(contract.address),
      }),
      ticketWitness: ticketMap.getWitness(Field(0)),
    });

    let savedReduceInfo = await this.rounds.findOne({ roundId });

    let processedTicketData = {
      ticketId: -1,
      round: 0,
    };
    let lastReducedTicket = savedReduceInfo?.lastReducedTicket || -1;

    let curProof = savedReduceInfo?.reduceProof
      ? // @ts-ignore
        await TicketReduceProof.fromJSON(savedReduceInfo?.reduceProof as any)
      : await TicketReduceProgram.init(input, winningNumbersPacked);

    let actionsPackId = -1;

    for (let actionList of actionLists) {
      actionsPackId++;
      console.log(`Processing pack ${actionsPackId}`);
      let cached = false;

      if (actionsPackId <= lastReducedTicket) {
        cached = true;
      }

      for (let action of actionList) {
        processedTicketData.ticketId++;

        if (cached) {
          console.log(`Cached ticket: <${processedTicketData.ticketId}>`);
          ticketMap.set(
            Field.from(processedTicketData.ticketId),
            action.ticket.hash(),
          );

          continue;
        } else {
          console.log(`Process ticket: <${processedTicketData.ticketId}>`);
        }

        input = new TicketReduceProofPublicInput({
          action: action,
          ticketWitness: ticketMap.getWitness(
            Field(processedTicketData.ticketId),
          ),
        });

        curProof = await TicketReduceProgram.addTicket(input, curProof);

        ticketMap.set(
          Field.from(processedTicketData.ticketId),
          action.ticket.hash(),
        );
        lastReducedTicket++;
        break;
      }

      if (!cached) {
        // Again here we do not need specific input, as it is not using here
        curProof = await TicketReduceProgram.cutActions(input, curProof);

        await this.rounds.updateOne(
          { roundId },
          {
            $set: {
              lastReducedTicket: lastReducedTicket,
              reduceProof: curProof.toJSON(),
            },
          },
        );
      }
    }

    // Process refunds
    const events = await contract.fetchEvents();
    const refundTicketsEvents = events
      .filter((event) => event.type === 'get-refund')
      // @ts-ignore
      .map((event) => event.event.data as RefundEvent);

    for (const refundEvent of refundTicketsEvents) {
      console.log(`Remove ticket: <${refundEvent.ticketId.toString()}>`);
      const input = new TicketReduceProofPublicInput({
        action: new LotteryAction({
          ticket: refundEvent.ticket,
        }),
        ticketWitness: ticketMap.getWitness(refundEvent.ticketId),
      });
      curProof = await TicketReduceProgram.refund(input, curProof);

      ticketMap.set(refundEvent.ticketId, Field(0));
    }

    return curProof;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      this.logger.log('Already running');
      return;
    }

    this.isRunning = true;
    // if (this.stateManager.inReduceProving) return;
    // this.stateManager.inReduceProving = true;

    try {
      this.logger.debug('REDUCE PROVING');
      for (let network of ALL_NETWORKS) {
        const currentRound = await this.stateManager.getCurrentRound(
          network.networkID,
        );

        for (
          let roundId = this.lastProducedRound;
          roundId < currentRound;
          roundId++
        ) {
          this.logger.debug(`Checking round ${roundId}`);
          const { shouldStart, isProduced } = await this.checkConditions(
            network.networkID,
            roundId,
            currentRound,
          );

          if (isProduced) {
            this.lastProducedRound = roundId;
            continue;
          }

          // Don not check next rounds, if current round is not ready to be reduced
          if (!shouldStart) {
            break;
          }

          if (shouldStart) {
            await this.stateManager.transactionMutex.runExclusive(async () => {
              this.logger.debug(`Time to reduce ${roundId}`);
              const sender = PrivateKey.fromBase58(process.env.PK);

              const plotteryState =
                this.stateManager.state[network.networkID].plotteryManagers[
                  roundId
                ];

              // Reduce tickets
              let reduceProof = await this.reduceTickets(
                network.networkID,
                roundId,
              );

              this.logger.debug(
                'Reduce proof',
                'Final state',
                reduceProof.publicOutput.finalState.toString(),
              );

              this.logger.debug('Creating transaction');
              let tx2_1 = await Mina.transaction(
                { sender: sender.toPublicKey(), fee: Number('0.1') * 1e9 },
                async () => {
                  await plotteryState.contract.reduceTicketsAndProduceResult(
                    reduceProof,
                  );
                },
              );
              this.logger.debug('Proving reduce tx');
              await tx2_1.prove();
              this.logger.debug('Proved reduce tx');
              let txResult = await tx2_1.sign([sender]).send();

              this.logger.debug(`Reduce tx successful. Hash: `, txResult.hash);
              this.logger.debug('Waiting for reduce tx');
              await txResult.wait();
            });
          }
        }
      }
    } catch (e) {
      console.error('Error in reduce proving', e.stack);
    }

    this.isRunning = false;
    // this.stateManager.inReduceProving = false;
  }
}
