import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type DefaultBankDocument = BaseDefaultBankDocument & Document;

export class BaseDefaultBankDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  roundId: number;
  @Prop()
  account: string;
  @Prop()
  tx: string;
  @Prop()
  amount: number;
  @Prop()
  numbers: number[];
}

@Schema({ timestamps: true, collection: 'default_bank' })
export class DefaultBankData extends BaseDefaultBankDocument {}

export const DefaultBankSchema = SchemaFactory.createForClass(DefaultBankData);
