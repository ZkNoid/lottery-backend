import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type MinaCommitDocument = BaseCommitDocument & Document;

export class BaseCommitDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  type: string;
  @Prop()
  round: number;
  @Prop()
  commitValue: string;
  @Prop()
  commitSalt: string;
  @Prop()
  revealed: boolean;
}

@Schema({ timestamps: true, collection: 'random_commits' })
export class CommitData extends BaseCommitDocument {}

export const CommitDataSchema = SchemaFactory.createForClass(CommitData);
