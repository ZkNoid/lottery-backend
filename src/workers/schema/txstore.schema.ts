import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type txStoreDocument = BaseTxStoreDocument & Document;

export class BaseTxStoreDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  userAddress: string;
  @Prop()
  txHash: string;
  @Prop()
  type: string;
  @Prop()
  createdAt: string;
}

@Schema({ timestamps: true, collection: 'transactionStore' })
export class TxStoreData extends BaseTxStoreDocument {}

export const TxStoreDataSchema = SchemaFactory.createForClass(TxStoreData);
