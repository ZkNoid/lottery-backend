import { RmqContext } from '@nestjs/microservices';
import { DistributionProof } from 'l1-lottery-contracts/build/src/DistributionProof';
import { UInt32 } from 'o1js';
import { PLottery, PStateManager, Ticket } from 'l1-lottery-contracts';
import { MinaEventDocument } from '../schemas/events.schema';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class StateService implements OnModuleInit {
    private configService;
    blockHeight?: number;
    slotSinceGenesis?: number;
    roundIds?: number;
    initialized: boolean;
    stateInitialized?: boolean;
    inReduceProving: boolean;
    distributionProof: DistributionProof;
    lottery?: PLottery;
    state?: PStateManager;
    boughtTickets?: Ticket[][];
    onModuleInit(): Promise<void>;
    constructor(configService: ConfigService);
    accumulate(data: number[], context: RmqContext): number;
    initialize(): Promise<void>;
    fetchEvents(startBlock?: number): Promise<{
        type: string;
        event: {
            data: any;
            transactionInfo: {
                transactionHash: string;
                transactionStatus: string;
                transactionMemo: string;
            };
        };
        blockHeight: UInt32;
        blockHash: string;
        parentBlockHash: string;
        globalSlot: UInt32;
        chainStatus: string;
    }[]>;
    initState(events: MinaEventDocument[], stateM?: PStateManager): Promise<void>;
    undoLastEvents(events: MinaEventDocument[], stateM: PStateManager): Promise<void>;
    updateProcessedTicketData(stateM: PStateManager): void;
}
