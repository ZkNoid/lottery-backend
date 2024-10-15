import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type StatueseDocument = BaseStatusesDocument & Document;

export class BaseStatusesDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  address: string;
  @Prop({ type: SchemaTypes.Mixed })
  counter: Mixed;
  @Prop({ type: SchemaTypes.Mixed })
  statuses: Mixed;
}

@Schema({ timestamps: true, collection: 'statuses' })
export class StatusesData extends BaseStatusesDocument {}

export const StatusesDataSchema = SchemaFactory.createForClass(StatusesData);
