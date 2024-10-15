import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Mixed, SchemaTypes, Types } from 'mongoose';

export type MinaQuestDocument = BaseQuestDocument & Document;

export class BaseQuestDocument extends Document {
  @Prop({ type: SchemaTypes.ObjectId, auto: true })
  _id: Types.ObjectId;
  @Prop()
  address: string;
  @Prop()
  userEvents: Mixed[];
  @Prop()
  boughtGiftCodes: string[];
  @Prop()
  usedGiftCodes: string[];
  @Prop()
  firstTicketBought: boolean;
  @Prop()
  twoSameTicketsBought: boolean;
  @Prop()
  twoDifferentTicketBought: boolean;
  @Prop()
  wonInRound: boolean;
  @Prop()
  playedIn3Rounds: boolean;
  @Prop()
  generatedGiftCode: boolean;
  @Prop()
  usedGiftCode: boolean;
  @Prop()
  generated2GiftCodes: boolean;
  @Prop()
  boughtGiftCodeRedeemed: boolean;
  @Prop()
  usedGiftCodeGeneratedByOtherUser: boolean;
}

@Schema({ timestamps: true, collection: 'quest' })
export class QuestData extends BaseQuestDocument {}

export const QuestDataSchema = SchemaFactory.createForClass(QuestData);
