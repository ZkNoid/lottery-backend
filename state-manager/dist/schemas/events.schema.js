"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinaEventDataSchema = exports.MinaEventData = exports.BaseEventDocument = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
class MinaEventTransactionInfo {
    transactionHash;
    transactionStatus;
    transactionMemo;
}
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MinaEventTransactionInfo.prototype, "transactionHash", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MinaEventTransactionInfo.prototype, "transactionStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MinaEventTransactionInfo.prototype, "transactionMemo", void 0);
class MinaEvent {
    data;
    transactionInfo;
}
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], MinaEvent.prototype, "data", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", MinaEventTransactionInfo)
], MinaEvent.prototype, "transactionInfo", void 0);
class BaseEventDocument extends mongoose_2.Document {
    type;
    event;
    blockHeight;
    blockHash;
    parentBlockHash;
    globalSlot;
    chainStatus;
}
exports.BaseEventDocument = BaseEventDocument;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], BaseEventDocument.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", MinaEvent)
], BaseEventDocument.prototype, "event", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], BaseEventDocument.prototype, "blockHeight", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], BaseEventDocument.prototype, "blockHash", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], BaseEventDocument.prototype, "parentBlockHash", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], BaseEventDocument.prototype, "globalSlot", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], BaseEventDocument.prototype, "chainStatus", void 0);
let MinaEventData = class MinaEventData extends BaseEventDocument {
};
exports.MinaEventData = MinaEventData;
exports.MinaEventData = MinaEventData = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'mina_events' })
], MinaEventData);
exports.MinaEventDataSchema = mongoose_1.SchemaFactory.createForClass(MinaEventData);
//# sourceMappingURL=events.schema.js.map