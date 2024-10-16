import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type RoundsDocument = BaseGiftCodesdDocument & Document;

class BaseGiftCodesdDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  userAddress: string;
  @Prop()
  transactionHash: string;
  @Prop()
  code: string;
  @Prop()
  used: boolean;
  @Prop()
  deleted: boolean;
  @Prop()
  createdAt: string;
  @Prop()
  buyTxHash: string;
}

@Schema({ timestamps: true, collection: 'gift-codes' })
export class GiftCodesData extends BaseGiftCodesdDocument {}

export const GiftCodesDataSchema = SchemaFactory.createForClass(GiftCodesData);
