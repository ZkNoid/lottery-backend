import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type DbSyncStateDocument = BaseSyncStateDocument & Document;

class BaseSyncStateDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  lastEventBlockProcessed: number;
}

@Schema({ timestamps: true, collection: 'sync_state' })
export class SyncStateData extends BaseSyncStateDocument {}

export const SyncStateDataSchema = SchemaFactory.createForClass(SyncStateData);
