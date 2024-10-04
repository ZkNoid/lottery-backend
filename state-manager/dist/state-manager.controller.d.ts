import { OnModuleInit } from '@nestjs/common';
import { StateService } from './services/state-manager.service';
import { ConfigService } from './services/config/config.service';
import { MinaEventData } from './schemas/events.schema';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
export declare class StateManagerController implements OnModuleInit {
    private stateManager;
    private configService;
    private readonly httpService;
    private minaEventData;
    constructor(stateManager: StateService, configService: ConfigService, httpService: HttpService, minaEventData: Model<MinaEventData>);
    onModuleInit(): void;
    fetchEvents(startBlock?: number): Promise<object[]>;
    update(): Promise<void>;
}
