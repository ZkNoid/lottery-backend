import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type RoundsDocument = BaseRoundsDocument & Document;
class Proof {
  @Prop()
  publicInput: string[];
  @Prop()
  publicOutput: string[];
  @Prop()
  maxProofsVerified: 0 | 1 | 2;
  @Prop()
  proof: string;
}
class RoundTickets {
  @Prop()
  amount: number;
  @Prop()
  numbers: number[];
  @Prop()
  owner: string;
}

class BaseRoundsDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  roundId: number;
  @Prop()
  bank: bigint;
  @Prop()
  tickets: RoundTickets[];
  @Prop()
  winningCombination: number[] | null;
  @Prop()
  events: Mixed[];
  @Prop()
  total: number;
  @Prop()
  plotteryAddress: string;
  @Prop()
  randomManagerAddress: string;
  @Prop()
  lastReducedTicket: number
  @Prop()
  reduceProof: Proof
}

@Schema({ timestamps: true, collection: 'rounds' })
export class RoundsData extends BaseRoundsDocument {}

export const RoundsDataSchema = SchemaFactory.createForClass(RoundsData);
