"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const card_price_cache_entity_1 = require("../entities/card-price-cache.entity");
const cards_service_1 = require("./cards.service");
const cards_controller_1 = require("./cards.controller");
const debug_controller_1 = require("../debug/debug.controller");
const request_logger_middleware_1 = require("../common/middleware/request-logger.middleware");
const cards_rate_limiters_1 = require("./cards.rate-limiters");
const rate_limiter_1 = require("../crawlers/rate-limiter");
let CardsModule = class CardsModule {
    configure(consumer) {
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('searchNaverShopApi'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/search/naver-api', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('searchTCGShop'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/search/tcgshop', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('searchCardDC'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/search/carddc', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('getYugiohPricesByRarity'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/yugioh-rarity-prices', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('getVanguardPricesByRarity'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/vanguard-rarity-prices', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('getOnepiecePricesByRarity'), cards_rate_limiters_1.cardPriceRateLimiter, rate_limiter_1.cardRequestLimiter)
            .forRoutes({ path: 'api/cards/onepiece-rarity-prices', method: common_1.RequestMethod.GET });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('getOptimalPurchaseCombination'), cards_rate_limiters_1.optimalPurchaseRateLimiter)
            .forRoutes({ path: 'api/cards/optimal-purchase', method: common_1.RequestMethod.POST });
        consumer
            .apply((0, request_logger_middleware_1.createRequestLogger)('getCachedPrices'), cards_rate_limiters_1.cardSearchRateLimiter)
            .forRoutes({ path: 'api/cards/prices-cache/:id', method: common_1.RequestMethod.GET });
    }
};
exports.CardsModule = CardsModule;
exports.CardsModule = CardsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([card_price_cache_entity_1.CardPriceCache])],
        controllers: [cards_controller_1.CardsController, debug_controller_1.DebugController],
        providers: [cards_service_1.CardsService],
        exports: [cards_service_1.CardsService],
    })
], CardsModule);
//# sourceMappingURL=cards.module.js.map