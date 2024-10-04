import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type MinaEventDocument = BaseEventDocument & Document;

class MinaEventTransactionInfo {
  @Prop()
  transactionHash: string;
  @Prop()
  transactionStatus: string;
  @Prop()
  transactionMemo: string;
}

class MinaEvent {
  @Prop({type: Object})
  data: Mixed;
  @Prop()
  transactionInfo: MinaEventTransactionInfo;
}

export class BaseEventDocument extends Document {
  // @Prop({ type: SchemaTypes.ObjectId, auto: true })
  // _id: Types.ObjectId;
  @Prop()
  type: string;
  @Prop()
  event: MinaEvent;
  @Prop()
  blockHeight: number;
  @Prop()
  blockHash: string;
  @Prop()
  parentBlockHash: string;
  @Prop()
  globalSlot: number;
  @Prop()
  chainStatus: string;
}

@Schema({ timestamps: true, collection: 'mina_events' })
export class MinaEventData extends BaseEventDocument {}

export const MinaEventDataSchema = SchemaFactory.createForClass(MinaEventData);
