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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanupService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const card_price_cache_entity_1 = require("../entities/card-price-cache.entity");
let CleanupService = class CleanupService {
    cacheRepo;
    constructor(cacheRepo) {
        this.cacheRepo = cacheRepo;
    }
    onApplicationBootstrap() {
        // 기존 app.js: startPeriodicCleanup(60)
        this.startPeriodicCleanup(60);
    }
    async cleanupExpiredCardPriceCache() {
        try {
            const result = await this.cacheRepo.delete({ expiresAt: (0, typeorm_2.LessThan)(new Date()) });
            return result.affected ?? 0;
        }
        catch (error) {
            console.error('[ERROR] CardPriceCache 정리 중 오류 발생:', error);
            return 0;
        }
    }
    async cleanupAllExpiredData() {
        console.log('[CLEANUP] 만료된 데이터 정리 시작...');
        const startTime = new Date();
        try {
            const cardPriceCache = await this.cleanupExpiredCardPriceCache();
            const endTime = new Date();
            const duration = endTime.getTime() - startTime.getTime();
            console.log(`[CLEANUP] 정리 완료: CardPriceCache(${cardPriceCache}), 소요시간: ${duration}ms`);
        }
        catch (error) {
            console.error('[ERROR] 데이터 정리 중 전체 오류 발생:', error);
        }
    }
    startPeriodicCleanup(intervalMinutes = 60) {
        const intervalMs = intervalMinutes * 60 * 1000;
        console.log(`[CLEANUP] 정기 데이터 정리 시작 (${intervalMinutes}분마다 실행)`);
        this.cleanupAllExpiredData();
        const cleanupInterval = setInterval(() => {
            this.cleanupAllExpiredData();
        }, intervalMs);
        return cleanupInterval;
    }
};
exports.CleanupService = CleanupService;
exports.CleanupService = CleanupService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(card_price_cache_entity_1.CardPriceCache)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], CleanupService);
//# sourceMappingURL=cleanup.service.js.map