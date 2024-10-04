import mongoose, { Document, Mixed } from 'mongoose';
export type MinaEventDocument = BaseEventDocument & Document;
declare class MinaEventTransactionInfo {
    transactionHash: string;
    transactionStatus: string;
    transactionMemo: string;
}
declare class MinaEvent {
    data: Mixed;
    transactionInfo: MinaEventTransactionInfo;
}
export declare class BaseEventDocument extends Document {
    type: string;
    event: MinaEvent;
    blockHeight: number;
    blockHash: string;
    parentBlockHash: string;
    globalSlot: number;
    chainStatus: string;
}
export declare class MinaEventData extends BaseEventDocument {
}
export declare const MinaEventDataSchema: mongoose.Schema<MinaEventData, mongoose.Model<MinaEventData, any, any, any, mongoose.Document<unknown, any, MinaEventData> & MinaEventData & Required<{
    _id: unknown;
}>, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, MinaEventData, mongoose.Document<unknown, {}, mongoose.FlatRecord<MinaEventData>> & mongoose.FlatRecord<MinaEventData> & Required<{
    _id: unknown;
}>>;
export {};
