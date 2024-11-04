import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type RoundsDocument = BaseGiftCodesRequestedDocument & Document;

class BaseGiftCodesRequestedDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  userAddress: string;
  @Prop()
  paymentHash: string;
  @Prop()
  codes: string[];
  @Prop()
  signature: string;
  @Prop()
  processingStarted: boolean;
  @Prop()
  processed: boolean;
  @Prop()
  failed: boolean;
  @Prop()
  reason: string;
}

@Schema({ timestamps: true, collection: 'gift-codes-requested' })
export class GiftCodesRequestedData extends BaseGiftCodesRequestedDocument {}

export const GiftCodesRequestedDataSchema = SchemaFactory.createForClass(GiftCodesRequestedData);
