import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type PromoQueueDocument = BasePromoQueueDocument & Document;

class PromoTicket {
  @Prop()
  numbers: number[];
}

class BasePromoQueueDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  userAddress: string;
  @Prop()
  giftCode: string;
  @Prop()
  roundId: number;
  @Prop()
  ticket: PromoTicket;
}

@Schema({ timestamps: true, collection: 'promo_tickets_queue' })
export class PromoQueueData extends BasePromoQueueDocument {}

export const PromoQueueDataSchema =
  SchemaFactory.createForClass(PromoQueueData);
