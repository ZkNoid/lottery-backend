import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';
import { prop } from 'node_modules/o1js/dist/node/lib/provable/types/circuit-value.js';

export type MinaClaimRequestDocument = BaseClaimRequestDocument & Document;

export class BaseClaimRequestDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  userAddress: string;
  @Prop()
  roundId: number;
  @Prop()
  ticketNumbers: number[];
  @Prop()
  ticketAmount: number;
  @Prop()
  status: string;
  @Prop()
  tx: string;
}

@Schema({ timestamps: true, collection: 'claim_requests' })
export class ClaimRequestData extends BaseClaimRequestDocument {}

export const ClaimRequestDataSchema =
  SchemaFactory.createForClass(ClaimRequestData);
