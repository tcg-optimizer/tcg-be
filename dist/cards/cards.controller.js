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
exports.CardsController = void 0;
const common_1 = require("@nestjs/common");
const cards_service_1 = require("./cards.service");
const optimal_purchase_1 = require("../optimal-purchase");
const naver_shop_api_1 = require("../crawlers/naver-shop-api");
const tcgshop_crawler_1 = require("../crawlers/tcgshop-crawler");
const carddc_crawler_1 = require("../crawlers/carddc-crawler");
const shipping_info_1 = require("../common/utils/shipping-info");
const game_types_1 = require("../common/constants/game-types");
const game_type_1 = require("../common/utils/game-type");
let CardsController = class CardsController {
    cardsService;
    constructor(cardsService) {
        this.cardsService = cardsService;
    }
    async searchNaverShopApi(req, res) {
        try {
            const { cardName } = req.query;
            const gameType = (0, game_type_1.normalizeGameType)(req.query.gameType, game_types_1.GAME_TYPES.YUGIOH);
            if (!cardName) {
                return res.status(400).json({
                    success: false,
                    error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
                });
            }
            const result = await (0, naver_shop_api_1.searchAndSaveCardPricesApi)(cardName, { gameType });
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
        }
        catch (error) {
            console.error('[ERROR] 네이버 쇼핑 API 컨트롤러 오류:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    async searchTCGShop(req, res) {
        try {
            const { cardName } = req.query;
            const gameType = (0, game_type_1.normalizeGameType)(req.query.gameType, game_types_1.GAME_TYPES.YUGIOH);
            if (!cardName) {
                return res.status(400).json({
                    success: false,
                    error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
                });
            }
            const card = null;
            const result = await (0, tcgshop_crawler_1.searchAndSaveTCGShopPrices)(cardName, gameType);
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
        }
        catch (error) {
            console.error('[ERROR] TCGShop 검색 컨트롤러 오류:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    async searchCardDC(req, res) {
        try {
            const { cardName } = req.query;
            const gameType = (0, game_type_1.normalizeGameType)(req.query.gameType, game_types_1.GAME_TYPES.YUGIOH);
            if (!cardName) {
                return res.status(400).json({
                    success: false,
                    error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
                });
            }
            const card = null;
            const result = await (0, carddc_crawler_1.searchAndSaveCardDCPrices)(cardName, gameType);
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
        }
        catch (error) {
            console.error('[ERROR] CardDC 검색 컨트롤러 오류:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    getYugiohPricesByRarity(req, res) {
        return this.handleGetPricesByRarity(req, res, game_types_1.GAME_TYPES.YUGIOH, '유희왕');
    }
    getVanguardPricesByRarity(req, res) {
        return this.handleGetPricesByRarity(req, res, game_types_1.GAME_TYPES.VANGUARD, '뱅가드');
    }
    getOnepiecePricesByRarity(req, res) {
        return this.handleGetPricesByRarity(req, res, game_types_1.GAME_TYPES.ONEPIECE, '원피스');
    }
    async handleGetPricesByRarity(req, res, gameType, gameTypeLabel) {
        try {
            const { cardName } = req.query;
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
            }
            catch (error) {
                // message가 없는 에러는 원본과 동일하게 여기서 TypeError로 바깥 catch에 넘어간다
                const err = error;
                if (err.message.includes('센터 카드')) {
                    return res.status(404).json({
                        success: false,
                        error: err.message,
                    });
                }
                if (err.message.includes('구매 가능한 가격 정보가 없습니다')) {
                    return res.status(404).json({
                        success: false,
                        error: err.message,
                    });
                }
                if (err.message.includes('카드를 찾을 수 없습니다')) {
                    return res.status(404).json({
                        success: false,
                        error: err.message,
                    });
                }
                throw error;
            }
        }
        catch (error) {
            console.error(`[ERROR] ${gameTypeLabel} 레어도별 가격 검색 오류:`, error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    async getOptimalPurchaseCombination(req, res) {
        try {
            // Express 5는 JSON 본문이 없으면 req.body가 undefined다 — Express 4처럼 {}로
            // 폴백해 기존의 400 응답 경로를 유지한다.
            const { cards, excludedProductIds = [], excludedStores = [], takeout = [], ...purchaseOptions } = req.body || {};
            if (!cards || !Array.isArray(cards) || cards.length === 0) {
                return res.status(400).json({
                    error: 'Invalid input: cards array is required and must not be empty',
                });
            }
            // 입력 크기 상한. 정상적인 덱/구매 목록은 이 선을 넘지 않으며, 비정상적으로 큰
            // 카트가 동기 최적화 계산을 폭주시키는 것을 1차로 차단한다(데드라인과 별개의 방어선).
            const MAX_CARDS = 100;
            if (cards.length > MAX_CARDS) {
                console.warn(`[WARN] optimal-purchase 입력 카드 수 초과: ${cards.length} > ${MAX_CARDS}, 요청 거부`);
                return res.status(400).json({
                    error: `카드 수가 너무 많습니다. 최대 ${MAX_CARDS}장까지 계산할 수 있습니다. (요청: ${cards.length}장)`,
                });
            }
            const filteredCards = cards.filter(card => {
                if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
                    console.log(`[INFO] 센터 카드(${card.cardCode}) "${card.name || card.cardName}" 제외됨`);
                    return false;
                }
                if ((card.name && /^ST19-KRFC[1-4]$/i.test(card.name)) ||
                    (card.cardName && /^ST19-KRFC[1-4]$/i.test(card.cardName))) {
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
            // (processCardDataStructure가 products 비어있는 카드를 걸러냈음을 타입이 표현 못해
            //  콜백만 any 유지 — 원본 검증 완료 본문 무변경)
            const filteredCardsData = processedCards
                .map((card) => {
                const beforeFilterCount = card.products.length;
                const filteredProducts = card.products.filter((product) => {
                    const productId = product.product && product.product.id
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
                        isMarketplaceExcluded = (0, shipping_info_1.shouldSkipMarketplace)(sellerName);
                    }
                    return !isExcluded && !isSiteExcluded && !isMarketplaceExcluded;
                });
                const afterFilterCount = filteredProducts.length;
                if (beforeFilterCount !== afterFilterCount) {
                    console.log(`[INFO] "${card.cardName}" 카드: ${beforeFilterCount - afterFilterCount}개 상품이 제외 목록에 따라 필터링됨`);
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
                    error: '모든 카드의 상품이 제외 목록에 의해 필터링되었습니다. 제외 목록을 다시 확인해주세요.',
                });
            }
            if (filteredCardsData.length < processedCards.length) {
                console.log(`[WARN] 제외 목록에 의해 ${processedCards.length - filteredCardsData.length}개 카드가 완전히 제외됨`);
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
            const result = (0, optimal_purchase_1.findOptimalPurchaseCombination)(filteredCardsData, {
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
            const processSellerDetails = (sellerDetails) => {
                if (!sellerDetails)
                    return sellerDetails;
                Object.entries(sellerDetails).forEach(([, details]) => {
                    if (details && details.cards && Array.isArray(details.cards)) {
                        details.cards = details.cards.map((card) => {
                            if (!card.product) {
                                let productId = null;
                                if (card.url &&
                                    card.url.includes('tcgshop.co.kr') &&
                                    card.url.includes('goodsIdx=')) {
                                    const match = card.url.match(/goodsIdx=(\d+)/);
                                    if (match && match[1]) {
                                        productId = match[1];
                                    }
                                }
                                card.product = {
                                    id: (card.id ||
                                        card.productId ||
                                        productId ||
                                        `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`).toString(),
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
                            }
                            else if (card.product && !card.product.id) {
                                let productId = null;
                                if (card.product.url &&
                                    card.product.url.includes('tcgshop.co.kr') &&
                                    card.product.url.includes('goodsIdx=')) {
                                    const match = card.product.url.match(/goodsIdx=(\d+)/);
                                    if (match && match[1]) {
                                        productId = match[1];
                                    }
                                }
                                card.product.id = (card.id ||
                                    card.productId ||
                                    productId ||
                                    `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`).toString();
                            }
                            else if (card.product && card.product.id && typeof card.product.id === 'number') {
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
        }
        catch (error) {
            console.error('최적 구매 조합 찾기 오류:', error);
            return res.status(500).json({ error: '최적 구매 조합을 계산하는 중 오류가 발생했습니다.' });
        }
    }
    async getCachedPrices(req, res) {
        try {
            const { id } = req.params;
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
        }
        catch (error) {
            console.error('캐시된 가격 정보 조회 중 오류 발생:', error);
            return res.status(500).json({
                success: false,
                message: '가격 정보 조회 중 오류가 발생했습니다.',
                error: error.message,
            });
        }
    }
};
exports.CardsController = CardsController;
__decorate([
    (0, common_1.Get)('search/naver-api'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CardsController.prototype, "searchNaverShopApi", null);
__decorate([
    (0, common_1.Get)('search/tcgshop'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CardsController.prototype, "searchTCGShop", null);
__decorate([
    (0, common_1.Get)('search/carddc'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CardsController.prototype, "searchCardDC", null);
__decorate([
    (0, common_1.Get)('yugioh-rarity-prices'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CardsController.prototype, "getYugiohPricesByRarity", null);
__decorate([
    (0, common_1.Get)('vanguard-rarity-prices'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CardsController.prototype, "getVanguardPricesByRarity", null);
__decorate([
    (0, common_1.Get)('onepiece-rarity-prices'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CardsController.prototype, "getOnepiecePricesByRarity", null);
__decorate([
    (0, common_1.Post)('optimal-purchase'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CardsController.prototype, "getOptimalPurchaseCombination", null);
__decorate([
    (0, common_1.Get)('prices-cache/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CardsController.prototype, "getCachedPrices", null);
exports.CardsController = CardsController = __decorate([
    (0, common_1.Controller)('api/cards'),
    __metadata("design:paramtypes", [cards_service_1.CardsService])
], CardsController);
//# sourceMappingURL=cards.controller.js.map