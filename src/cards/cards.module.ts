import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { DebugController } from '../debug/debug.controller';
import { createRequestLogger } from '../common/middleware/request-logger.middleware';
import {
  cardPriceRateLimiter,
  optimalPurchaseRateLimiter,
  cardSearchRateLimiter,
} from './cards.rate-limiters';
import { cardRequestLimiter } from '../crawlers/rate-limiter';

@Module({
  imports: [TypeOrmModule.forFeature([CardPriceCache])],
  controllers: [CardsController, DebugController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(createRequestLogger('searchNaverShopApi'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/naver-api', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('searchTCGShop'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/tcgshop', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('searchCardDC'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/carddc', method: RequestMethod.GET });
    consumer
      .apply(
        createRequestLogger('getYugiohPricesByRarity'),
        cardPriceRateLimiter,
        cardRequestLimiter
      )
      .forRoutes({ path: 'api/cards/yugioh-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(
        createRequestLogger('getVanguardPricesByRarity'),
        cardPriceRateLimiter,
        cardRequestLimiter
      )
      .forRoutes({ path: 'api/cards/vanguard-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(
        createRequestLogger('getOnepiecePricesByRarity'),
        cardPriceRateLimiter,
        cardRequestLimiter
      )
      .forRoutes({ path: 'api/cards/onepiece-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('getOptimalPurchaseCombination'), optimalPurchaseRateLimiter)
      .forRoutes({ path: 'api/cards/optimal-purchase', method: RequestMethod.POST });
    consumer
      .apply(createRequestLogger('getCachedPrices'), cardSearchRateLimiter)
      .forRoutes({ path: 'api/cards/prices-cache/:id', method: RequestMethod.GET });
  }
}
