import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type RoundsDocument = BaseRoundsDocument & Document;

class BaseRoundsDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  roundId: number;
  @Prop()
  dp: string;
}

@Schema({ timestamps: true, collection: 'rounds' })
export class RoundsData extends BaseRoundsDocument {}

export const RoundsDataSchema = SchemaFactory.createForClass(RoundsData);
