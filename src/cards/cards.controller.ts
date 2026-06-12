import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CardsService } from './cards.service';
import { findOptimalPurchaseCombination } from '../optimal-purchase';
import { searchAndSaveCardPricesApi } from '../crawlers/naver-shop-api';
import { searchAndSaveTCGShopPrices } from '../crawlers/tcgshop-crawler';
import { searchAndSaveCardDCPrices } from '../crawlers/carddc-crawler';
import { shouldSkipMarketplace } from '../common/utils/shipping-info';
import { GAME_TYPES } from '../common/constants/game-types';
import { normalizeGameType } from '../common/utils/game-type';

@Controller('api/cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get('search/naver-api')
  async searchNaverShopApi(@Req() req: Request, @Res() res: Response) {
    try {
      const { cardName } = req.query as { cardName?: string };
      const gameType = normalizeGameType(req.query.gameType, GAME_TYPES.YUGIOH);

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      const result = await searchAndSaveCardPricesApi(cardName, { gameType });

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: '검색 결과가 없습니다.',
          card: result.card,
        });
      }

      res.status(200).json({
        success: true,
        gameType,
        message: `${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: result.card,
          prices: result.prices,
        },
      });
    } catch (error: any) {
      console.error('[ERROR] 네이버 쇼핑 API 컨트롤러 오류:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('search/tcgshop')
  async searchTCGShop(@Req() req: Request, @Res() res: Response) {
    try {
      const { cardName } = req.query as { cardName?: string };
      const gameType = normalizeGameType(req.query.gameType, GAME_TYPES.YUGIOH);

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      const card = null;

      const result = await searchAndSaveTCGShopPrices(cardName, gameType);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: 'TCGShop에서 검색 결과가 없습니다.',
          card: card,
        });
      }

      res.status(200).json({
        success: true,
        gameType,
        message: `TCGShop에서 ${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: card,
          prices: result.prices,
        },
      });
    } catch (error: any) {
      console.error('[ERROR] TCGShop 검색 컨트롤러 오류:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('search/carddc')
  async searchCardDC(@Req() req: Request, @Res() res: Response) {
    try {
      const { cardName } = req.query as { cardName?: string };
      const gameType = normalizeGameType(req.query.gameType, GAME_TYPES.YUGIOH);

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      const card = null;

      const result = await searchAndSaveCardDCPrices(cardName, gameType);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: 'CardDC에서 검색 결과가 없습니다.',
          card: card,
        });
      }

      res.status(200).json({
        success: true,
        gameType,
        message: `CardDC에서 ${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: card,
          prices: result.prices,
        },
      });
    } catch (error: any) {
      console.error('[ERROR] CardDC 검색 컨트롤러 오류:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('yugioh-rarity-prices')
  getYugiohPricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.YUGIOH, '유희왕');
  }

  @Get('vanguard-rarity-prices')
  getVanguardPricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.VANGUARD, '뱅가드');
  }

  @Get('onepiece-rarity-prices')
  getOnepiecePricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.ONEPIECE, '원피스');
  }

  private async handleGetPricesByRarity(
    req: Request,
    res: Response,
    gameType: string,
    gameTypeLabel: string
  ) {
    try {
      const { cardName } = req.query as { cardName?: string };

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      try {
        const result = await this.cardsService.getOrCreateCardPriceData(cardName, null, gameType);

        return res.status(200).json({
          success: true,
          source: result.source,
          gameType,
          data: {
            cardName: result.card.name,
            image: result.card.image || null,
            totalProducts: result.totalProducts,
          },
          rarityPrices: result.rarityPrices,
          cacheId: result.cacheId,
          cacheExpiresAt: result.cacheExpiresAt,
        });
      } catch (error: any) {
        if (error.message.includes('센터 카드')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        if (error.message.includes('구매 가능한 가격 정보가 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        if (error.message.includes('카드를 찾을 수 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    } catch (error: any) {
      console.error(`[ERROR] ${gameTypeLabel} 레어도별 가격 검색 오류:`, error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('optimal-purchase')
  async getOptimalPurchaseCombination(@Req() req: Request, @Res() res: Response) {
    try {
      // Express 5는 JSON 본문이 없으면 req.body가 undefined다 — Express 4처럼 {}로
      // 폴백해 기존의 400 응답 경로를 유지한다.
      const {
        cards,
        excludedProductIds = [],
        excludedStores = [],
        takeout = [],
        ...purchaseOptions
      } = req.body || {};

      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({
          error: 'Invalid input: cards array is required and must not be empty',
        });
      }

      const filteredCards = cards.filter(card => {
        if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
          console.log(`[INFO] 센터 카드(${card.cardCode}) "${card.name || card.cardName}" 제외됨`);
          return false;
        }

        if (
          (card.name && /^ST19-KRFC[1-4]$/i.test(card.name)) ||
          (card.cardName && /^ST19-KRFC[1-4]$/i.test(card.cardName))
        ) {
          console.log(`[INFO] 센터 카드 "${card.name || card.cardName}" 제외됨`);
          return false;
        }

        return true;
      });

      if (filteredCards.length === 0) {
        return res.status(400).json({
          success: false,
          error: '유효한 카드 정보가 없습니다. 센터 카드가 아닌 카드를 선택해주세요.',
        });
      }

      const enhancedCards = await this.cardsService.enhanceCardsWithCacheData(filteredCards);

      const processedCards = this.cardsService.processCardDataStructure(enhancedCards);

      if (processedCards.length === 0) {
        return res.status(400).json({
          success: false,
          error: '유효한 카드 정보가 없습니다. 레어도와 언어를 선택했는지 확인해주세요.',
        });
      }

      // 제외할 상품 ID와 상점 기반으로 필터링 적용
      const filteredCardsData = processedCards
        .map(card => {
          const beforeFilterCount = card.products.length;

          const filteredProducts = card.products.filter((product: any) => {
            const productId =
              product.product && product.product.id
                ? String(product.product.id)
                : product.id
                  ? String(product.id)
                  : null;

            let isExcluded = false;

            if (productId) {
              for (const excludedId of excludedProductIds) {
                if (String(excludedId) === productId) {
                  isExcluded = true;
                  break;
                }
              }
            }

            const siteToCheck = product.site || (product.product && product.product.site);
            const isSiteExcluded = siteToCheck && excludedStores.includes(siteToCheck);

            // 마켓플레이스 제외 확인 (쿠팡, G마켓 등)
            let isMarketplaceExcluded = false;
            if (siteToCheck) {
              let sellerName = siteToCheck;
              if (sellerName.startsWith('Naver_')) {
                sellerName = sellerName.substring(6);
              }
              isMarketplaceExcluded = shouldSkipMarketplace(sellerName);
            }

            return !isExcluded && !isSiteExcluded && !isMarketplaceExcluded;
          });

          const afterFilterCount = filteredProducts.length;
          if (beforeFilterCount !== afterFilterCount) {
            console.log(
              `[INFO] "${card.cardName}" 카드: ${beforeFilterCount - afterFilterCount}개 상품이 제외 목록에 따라 필터링됨`
            );
          }

          return {
            ...card,
            products: filteredProducts,
          };
        })
        .filter(card => card.products.length > 0);

      if (filteredCardsData.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            '모든 카드의 상품이 제외 목록에 의해 필터링되었습니다. 제외 목록을 다시 확인해주세요.',
        });
      }

      if (filteredCardsData.length < processedCards.length) {
        console.log(
          `[WARN] 제외 목록에 의해 ${processedCards.length - filteredCardsData.length}개 카드가 완전히 제외됨`
        );
      }

      const options = {
        maxSellersPerCard: 30,
        maxIterations: 50,
        shippingRegion: purchaseOptions.shippingRegion,
        takeout: takeout,
        pointsOptions: {
          tcgshop: purchaseOptions.tcgshopPoints || false,
          carddc: purchaseOptions.carddcPoints || false,
          naverBasic: purchaseOptions.naverBasicPoints || false,
          naverBankbook: purchaseOptions.naverBankbookPoints || false,
          naverMembership: purchaseOptions.naverMembershipPoints || false,
          naverHyundaiCard: purchaseOptions.naverHyundaiCardPoints || false,
        },
      };

      console.log('계산 옵션:', {
        maxSellersPerCard: options.maxSellersPerCard,
        maxIterations: options.maxIterations,
        shippingRegion: options.shippingRegion,
        pointsOptions: options.pointsOptions,
      });

      const result = findOptimalPurchaseCombination(filteredCardsData, {
        ...options,
        excludedProductIds,
        excludedStores,
      });

      if (!result.excludedFilters) {
        result.excludedFilters = {
          excludedProductIds,
          excludedStores,
        };
      }

      const processSellerDetails = (sellerDetails: any) => {
        if (!sellerDetails) return sellerDetails;

        Object.entries(sellerDetails).forEach(([, details]: [string, any]) => {
          if (details && details.cards && Array.isArray(details.cards)) {
            details.cards = details.cards.map((card: any) => {
              if (!card.product) {
                let productId = null;
                if (
                  card.url &&
                  card.url.includes('tcgshop.co.kr') &&
                  card.url.includes('goodsIdx=')
                ) {
                  const match = card.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                card.product = {
                  id: (
                    card.id ||
                    card.productId ||
                    productId ||
                    `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                  ).toString(),
                  url: card.url,
                  site: card.site,
                  price: card.price,
                  available: card.available,
                  cardCode: card.cardCode,
                  condition: card.condition,
                  language: card.language,
                  rarity: card.rarity,
                  illustration: card.illustration || 'default',
                };
              } else if (card.product && !card.product.id) {
                let productId = null;
                if (
                  card.product.url &&
                  card.product.url.includes('tcgshop.co.kr') &&
                  card.product.url.includes('goodsIdx=')
                ) {
                  const match = card.product.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                card.product.id = (
                  card.id ||
                  card.productId ||
                  productId ||
                  `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                ).toString();
              } else if (card.product && card.product.id && typeof card.product.id === 'number') {
                card.product.id = card.product.id.toString();
              }
              return card;
            });
          }
        });
        return sellerDetails;
      };

      if (result.optimalSellers) {
        result.optimalSellers = processSellerDetails(result.optimalSellers);
      }

      if (result.alternativeSellers) {
        result.alternativeSellers = processSellerDetails(result.alternativeSellers);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('최적 구매 조합 찾기 오류:', error);
      return res.status(500).json({ error: '최적 구매 조합을 계산하는 중 오류가 발생했습니다.' });
    }
  }

  @Get('prices-cache/:id')
  async getCachedPrices(@Req() req: Request, @Res() res: Response) {
    try {
      const { id } = req.params as { id: string };

      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 캐시 ID입니다.',
        });
      }

      const priceCache = await this.cardsService.findCacheById(id);

      if (!priceCache) {
        return res.status(404).json({
          success: false,
          message: '해당 ID의 가격 정보를 찾을 수 없습니다.',
        });
      }

      if (new Date() > new Date(priceCache.expiresAt)) {
        return res.status(410).json({
          success: false,
          message: '가격 정보가 만료되었습니다. 새로운 정보를 조회해주세요.',
        });
      }

      return res.json({
        success: true,
        data: {
          cardName: priceCache.cardName,
          image: priceCache.image,
          totalProducts: this.cardsService.calculateTotalProducts(priceCache.rarityPrices),
        },
        rarityPrices: priceCache.rarityPrices,
        cacheId: priceCache.id,
        cacheExpiresAt: priceCache.expiresAt,
      });
    } catch (error: any) {
      console.error('캐시된 가격 정보 조회 중 오류 발생:', error);
      return res.status(500).json({
        success: false,
        message: '가격 정보 조회 중 오류가 발생했습니다.',
        error: error.message,
      });
    }
  }
}
