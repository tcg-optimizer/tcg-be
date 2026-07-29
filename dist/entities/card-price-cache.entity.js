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
exports.CardPriceCache = void 0;
const typeorm_1 = require("typeorm");
const uuid_1 = require("uuid");
const game_types_1 = require("../common/constants/game-types");
// Sequelize가 생성한 기존 테이블(CardPriceCaches)을 그대로 사용한다. synchronize: false.
let CardPriceCache = class CardPriceCache {
    // strict 모드(strictPropertyInitialization)에서 TypeORM 엔티티는 `!` 한정자 필요
    id;
    cardName;
    image;
    gameType;
    // 레어도별 가격 정보 JSON 객체
    rarityPrices;
    expiresAt;
    // Create/UpdateDateColumn을 쓰지 않는다: 기존 테이블은 Sequelize가 DEFAULT 없이
    // NOT NULL로 생성했고(타임스탬프를 앱에서 채움), TypeORM의 날짜 데코레이터는 INSERT 시
    // DB 기본값(DEFAULT)에 의존해 ER_NO_DEFAULT_FOR_FIELD로 실패한다.
    createdAt;
    updatedAt;
    generateId() {
        if (!this.id) {
            this.id = (0, uuid_1.v7)();
        }
    }
    // Sequelize의 timestamps: true 동작 재현 — INSERT/UPDATE 시 앱에서 타임스탬프 설정
    setInsertTimestamps() {
        const now = new Date();
        if (!this.createdAt) {
            this.createdAt = now;
        }
        this.updatedAt = now;
    }
    setUpdateTimestamp() {
        this.updatedAt = new Date();
    }
};
exports.CardPriceCache = CardPriceCache;
__decorate([
    (0, typeorm_1.PrimaryColumn)('char', { length: 36 }),
    __metadata("design:type", String)
], CardPriceCache.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], CardPriceCache.prototype, "cardName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], CardPriceCache.prototype, "image", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, default: game_types_1.GAME_TYPES.YUGIOH }),
    __metadata("design:type", String)
], CardPriceCache.prototype, "gameType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json' }),
    __metadata("design:type", Object)
], CardPriceCache.prototype, "rarityPrices", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime' }),
    __metadata("design:type", Date)
], CardPriceCache.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime' }),
    __metadata("design:type", Date)
], CardPriceCache.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime' }),
    __metadata("design:type", Date)
], CardPriceCache.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.BeforeInsert)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CardPriceCache.prototype, "generateId", null);
__decorate([
    (0, typeorm_1.BeforeInsert)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CardPriceCache.prototype, "setInsertTimestamps", null);
__decorate([
    (0, typeorm_1.BeforeUpdate)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CardPriceCache.prototype, "setUpdateTimestamp", null);
exports.CardPriceCache = CardPriceCache = __decorate([
    (0, typeorm_1.Entity)({ name: 'CardPriceCaches' }),
    (0, typeorm_1.Index)(['cardName', 'gameType', 'expiresAt'])
], CardPriceCache);
//# sourceMappingURL=card-price-cache.entity.js.map