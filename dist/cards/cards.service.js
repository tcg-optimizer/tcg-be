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
exports.CardsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const card_price_cache_entity_1 = require("../entities/card-price-cache.entity");
const naver_shop_api_1 = require("../crawlers/naver-shop-api");
const tcgshop_crawler_1 = require("../crawlers/tcgshop-crawler");
const carddc_crawler_1 = require("../crawlers/carddc-crawler");
const crawler_1 = require("../crawlers/crawler");
const rarity_util_1 = require("../common/utils/rarity-util");
const game_types_1 = require("../common/constants/game-types");
const game_type_1 = require("../common/utils/game-type");
let CardsService = class CardsService {
    cacheRepo;
    constructor(cacheRepo) {
        this.cacheRepo = cacheRepo;
    }
    normalizePriceRecord(rawPrice, gameType = game_types_1.GAME_TYPES.YUGIOH) {
        const basePrice = rawPrice && typeof rawPrice.get === 'function'
            ? rawPrice.get({ plain: true })
            : rawPrice && rawPrice.dataValues
                ? { ...rawPrice.dataValues }
                : { ...(rawPrice || {}) };
        const product = basePrice && basePrice.product && typeof basePrice.product === 'object'
            ? basePrice.product
            : null;
        const mergedPrice = {
            ...basePrice,
            ...(product || {}),
            id: basePrice.id ?? product?.id,
            title: basePrice.title ?? product?.title,
            price: basePrice.price ?? product?.price,
            site: basePrice.site ?? product?.site,
            url: basePrice.url ?? product?.url,
            condition: basePrice.condition ?? product?.condition,
            rarity: basePrice.rarity ?? product?.rarity,
            language: basePrice.language ?? product?.language,
            cardCode: basePrice.cardCode ?? product?.cardCode,
            available: basePrice.available ?? product?.available,
            lastUpdated: basePrice.lastUpdated ?? product?.lastUpdated,
            illustration: basePrice.illustration ?? product?.illustration ?? 'default',
        };
        const normalizedPriceValue = mergedPrice.price === null || mergedPrice.price === undefined
            ? mergedPrice.price
            : Number(mergedPrice.price);
        return {
            ...mergedPrice,
            price: normalizedPriceValue,
            rarity: (0, rarity_util_1.normalizeRarity)(mergedPrice.rarity, { gameType, cardCode: mergedPrice.cardCode }),
            language: gameType === game_types_1.GAME_TYPES.ONEPIECE &&
                (!mergedPrice.language || mergedPrice.language === '알 수 없음')
                ? '한글판'
                : mergedPrice.language,
            available: mergedPrice.available !== false,
        };
    }
    async searchCardPricesFromAllSources(cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        const [naverResult, tcgshopResult, cardDCResult] = await Promise.all([
            (0, naver_shop_api_1.searchAndSaveCardPricesApi)(cardName, { gameType }).catch((error) => {
                console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
                return { count: 0, prices: [], rawResults: [] };
            }),
            (0, tcgshop_crawler_1.searchAndSaveTCGShopPrices)(cardName, gameType).catch((error) => {
                console.error(`[ERROR] TCGShop 검색 오류: ${error.message}`);
                return { count: 0, prices: [] };
            }),
            (0, carddc_crawler_1.searchAndSaveCardDCPrices)(cardName, gameType).catch((error) => {
                console.error(`[ERROR] CardDC 검색 오류: ${error.message}`);
                return { count: 0, prices: [] };
            }),
        ]);
        const hasResults = (naverResult && naverResult.count > 0) ||
            (tcgshopResult && tcgshopResult.count > 0) ||
            (cardDCResult && cardDCResult.count > 0);
        if (!hasResults) {
            return null;
        }
        const combinedPrices = [
            ...(naverResult.prices || []),
            ...(tcgshopResult.prices || []),
            ...(cardDCResult.prices || []),
        ];
        // 카드 대표 정보 설정 (네이버 API 결과 우선)
        let cardInfo = null;
        if (naverResult && naverResult.card) {
            cardInfo = naverResult.card;
        }
        else {
            cardInfo = { name: cardName };
        }
        return {
            card: cardInfo,
            prices: combinedPrices,
            naverResult,
        };
    }
    async getOrCreateCardPriceData(cardName, cacheId = null, gameType = game_types_1.GAME_TYPES.YUGIOH) {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        // 센터 카드인지 확인 (ST19-KRFC1~4)
        // 추후 센터 카드 추가 발매 시 예외 처리 해줘야함
        if (gameType === game_types_1.GAME_TYPES.YUGIOH && /^ST19-KRFC[1-4]$/i.test(String(cardName || ''))) {
            throw new Error('센터 카드는 가격 정보를 제공하지 않습니다.');
        }
        let cachedResult = null;
        if (cacheId) {
            cachedResult = await this.cacheRepo.findOneBy({ id: cacheId });
            if (cachedResult && cachedResult.gameType !== gameType) {
                console.log(`[WARN] "${cardName}" 카드의 캐시 데이터(${cacheId})의 게임 타입(${cachedResult.gameType})이 요청된 게임 타입(${gameType})과 일치하지 않습니다.`);
                cachedResult = null;
            }
            else if (cachedResult && new Date() > new Date(cachedResult.expiresAt)) {
                console.log(`[WARN] "${cardName}" 카드의 캐시 데이터(${cacheId})가 만료되었습니다.`);
                cachedResult = null;
            }
        }
        else {
            cachedResult = await this.cacheRepo.findOne({
                where: {
                    cardName: cardName,
                    gameType: gameType,
                    expiresAt: (0, typeorm_2.MoreThan)(new Date()),
                },
            });
        }
        if (cachedResult) {
            console.log(`[DEBUG] 캐시에서 "${cardName}" 검색 결과 발견`);
            try {
                let rarityPrices;
                try {
                    // 엔티티 타입은 RarityPrices지만 과거 데이터가 문자열일 가능성을 방어하는
                    // 원본 로직 — parse 인자만 캐스트한다
                    rarityPrices = JSON.parse(cachedResult.rarityPrices);
                }
                catch {
                    rarityPrices = cachedResult.rarityPrices;
                }
                let totalProducts = 0;
                let malformedPriceCount = 0;
                Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration] || {}).forEach(language => {
                        Object.keys(rarityPrices[illustration][language] || {}).forEach(rarity => {
                            if (rarityPrices[illustration][language][rarity] &&
                                rarityPrices[illustration][language][rarity].prices) {
                                const currentPrices = Array.isArray(rarityPrices[illustration][language][rarity].prices)
                                    ? rarityPrices[illustration][language][rarity].prices
                                    : [];
                                const sanitizedPrices = [];
                                currentPrices.forEach(rawPrice => {
                                    const normalizedPrice = this.normalizePriceRecord(rawPrice, gameType);
                                    if (normalizedPrice.available === false) {
                                        return;
                                    }
                                    const hasValidPrice = Number.isFinite(Number(normalizedPrice.price));
                                    const hasSite = typeof normalizedPrice.site === 'string' && normalizedPrice.site.trim() !== '';
                                    const hasUrl = typeof normalizedPrice.url === 'string' && normalizedPrice.url.trim() !== '';
                                    if (!hasValidPrice || !hasSite || !hasUrl) {
                                        malformedPriceCount += 1;
                                        return;
                                    }
                                    sanitizedPrices.push({
                                        ...normalizedPrice,
                                        price: Number(normalizedPrice.price),
                                    });
                                });
                                rarityPrices[illustration][language][rarity].prices = sanitizedPrices;
                                totalProducts += sanitizedPrices.length;
                            }
                        });
                    });
                });
                Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration] || {}).forEach(language => {
                        Object.keys(rarityPrices[illustration][language] || {}).forEach(rarity => {
                            if (rarityPrices[illustration][language][rarity] &&
                                rarityPrices[illustration][language][rarity].prices &&
                                rarityPrices[illustration][language][rarity].prices.length === 0) {
                                delete rarityPrices[illustration][language][rarity];
                            }
                        });
                        if (Object.keys(rarityPrices[illustration][language] || {}).length === 0) {
                            delete rarityPrices[illustration][language];
                        }
                    });
                    if (Object.keys(rarityPrices[illustration] || {}).length === 0) {
                        delete rarityPrices[illustration];
                    }
                });
                // 정규화 후 데이터가 없거나 필드가 깨진 캐시는 무효화
                if (Object.keys(rarityPrices).length === 0 || malformedPriceCount > 0) {
                    if (malformedPriceCount > 0) {
                        console.warn(`[WARN] 캐시 데이터에 비정상 가격 항목 ${malformedPriceCount}건이 있어 재검색합니다.`);
                    }
                    cachedResult.expiresAt = new Date(Date.now() - 1000); // 현재 시간보다 이전으로 설정하여 만료 처리
                    await this.cacheRepo.save(cachedResult);
                    cachedResult = null;
                }
                else {
                    return {
                        source: 'cache',
                        card: {
                            name: cachedResult.cardName,
                            image: cachedResult.image,
                        },
                        rarityPrices,
                        totalProducts,
                        cacheId: cachedResult.id,
                        cacheExpiresAt: cachedResult.expiresAt,
                    };
                }
            }
            catch (error) {
                const err = error;
                console.error(`[ERROR] 캐시 데이터 정규화 중 오류 발생: ${err.message}`);
                console.error(err.stack);
                // try 안의 cachedResult = null 대입 때문에 TS 내로잉이 풀리지만,
                // 그 대입 이후엔 throw 지점이 없어 catch 도달 시 non-null이 보장된다 (원본 동작)
                cachedResult.expiresAt = new Date(Date.now() - 1000);
                await this.cacheRepo.save(cachedResult);
                cachedResult = null;
            }
        }
        const searchResult = await this.searchCardPricesFromAllSources(cardName, gameType);
        if (!searchResult) {
            throw new Error('카드를 찾을 수 없습니다. 모든 소스에서 검색 결과가 없습니다.');
        }
        const { card: searchCard, prices: combinedPrices, naverResult } = searchResult;
        if (gameType === game_types_1.GAME_TYPES.YUGIOH &&
            searchCard.cardCode &&
            /^ST19-KRFC[1-4]$/i.test(String(searchCard.cardCode || ''))) {
            throw new Error('센터 카드는 가격 정보를 제공하지 않습니다.');
        }
        const normalizedPrices = combinedPrices.map(price => this.normalizePriceRecord(price, gameType));
        const filteredPrices = normalizedPrices.filter(price => {
            const site = typeof price.site === 'string' ? price.site : '';
            const url = typeof price.url === 'string' ? price.url : '';
            const normalizedPriceValue = Number(price.price);
            if (price.title && (0, crawler_1.parseCondition)(price.title) === '중고')
                return false;
            if (site && (site === 'Naver_번개장터' || site.includes('번개장터')))
                return false;
            if (price.condition && price.condition !== '신품')
                return false;
            if (site === 'Naver_네이버')
                return false;
            if (price.available === false)
                return false;
            if (!Number.isFinite(normalizedPriceValue))
                return false;
            if (!site.trim() || !url.trim())
                return false;
            if (!price.rarity ||
                price.rarity === '알 수 없음' ||
                !price.language ||
                price.language === '알 수 없음')
                return false;
            if (gameType === game_types_1.GAME_TYPES.YUGIOH &&
                price.cardCode &&
                /^ST19-KRFC[1-4]$/i.test(String(price.cardCode || ''))) {
                return false;
            }
            return true;
        });
        if (!filteredPrices || filteredPrices.length === 0) {
            throw new Error('현재 구매 가능한 가격 정보가 없습니다.');
        }
        const rarityPrices = {};
        filteredPrices.forEach(price => {
            const illustration = price.illustration || 'default';
            const language = price.language || '알 수 없음';
            const rarity = price.rarity || '알 수 없음';
            if (!rarityPrices[illustration]) {
                rarityPrices[illustration] = {};
            }
            if (!rarityPrices[illustration][language]) {
                rarityPrices[illustration][language] = {};
            }
            if (!rarityPrices[illustration][language][rarity]) {
                rarityPrices[illustration][language][rarity] = {
                    image: null,
                    prices: [],
                };
            }
            rarityPrices[illustration][language][rarity].prices.push({
                id: price.id,
                title: String(price.title || '').trim(),
                price: Number(price.price),
                site: String(price.site || '').trim(),
                url: String(price.url || '').trim(),
                condition: price.condition,
                rarity: price.rarity,
                language: price.language,
                cardCode: price.cardCode,
                available: price.available !== false,
                lastUpdated: price.lastUpdated,
                illustration: price.illustration || 'default',
            });
        });
        // 각 일러스트, 언어, 레어도 그룹 내에서 가격 오름차순 정렬
        Object.keys(rarityPrices).forEach(illustration => {
            Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                    rarityPrices[illustration][language][rarity].prices.sort((a, b) => a.price - b.price);
                });
            });
        });
        try {
            const needImage = Object.values(rarityPrices).some((lang) => Object.values(lang).some((rarity) => Object.values(rarity).some((item) => !item.image)));
            if (needImage && naverResult && naverResult.rawResults && naverResult.rawResults.length > 0) {
                const imageMap = {};
                naverResult.rawResults.forEach((item) => {
                    if (item.language && item.rarity) {
                        const illustration = item.illustration || 'default';
                        const key = `${illustration}:${item.language}:${item.rarity}`;
                        if (item.image && item.image.trim() !== '') {
                            if (illustration === 'another') {
                                imageMap[key] = item.image;
                            }
                            else if (!imageMap[key]) {
                                imageMap[key] = item.image;
                            }
                        }
                        else if (naverResult.card && naverResult.card.image) {
                            if (!imageMap[key]) {
                                imageMap[key] = naverResult.card.image;
                            }
                        }
                    }
                });
                // 레어도별 이미지 URL 설정
                Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration]).forEach(language => {
                        Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                            if (rarityPrices[illustration][language][rarity].image)
                                return;
                            const key = `${illustration}:${language}:${rarity}`;
                            if (imageMap[key]) {
                                rarityPrices[illustration][language][rarity].image = imageMap[key];
                            }
                            else if (illustration === 'another') {
                                if (searchCard.image) {
                                    const urlWithParam = searchCard.image +
                                        (searchCard.image.includes('?') ? '&' : '?') +
                                        'illust=another';
                                    rarityPrices[illustration][language][rarity].image = urlWithParam;
                                }
                                else {
                                    rarityPrices[illustration][language][rarity].image = null;
                                }
                            }
                            else if (searchCard.image) {
                                rarityPrices[illustration][language][rarity].image = searchCard.image;
                            }
                        });
                    });
                });
            }
            if (searchCard.image) {
                Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration]).forEach(language => {
                        Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                            if (!rarityPrices[illustration][language][rarity].image) {
                                if (illustration === 'another') {
                                    // 바깥 if (searchCard.image) 가드가 보장 — TS는 클로저 안까지 내로잉을
                                    // 전파하지 못하므로 단언만 추가 (런타임 무변경)
                                    const urlWithParam = searchCard.image +
                                        (searchCard.image.includes('?') ? '&' : '?') +
                                        'illust=another';
                                    rarityPrices[illustration][language][rarity].image = urlWithParam;
                                }
                                else {
                                    rarityPrices[illustration][language][rarity].image = searchCard.image;
                                }
                            }
                        });
                    });
                });
            }
        }
        catch (imageError) {
            console.error(`[ERROR] 이미지 URL 설정 오류: ${imageError.message}`);
            if (searchCard.image) {
                Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration]).forEach(language => {
                        Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                            if (!rarityPrices[illustration][language][rarity].image) {
                                if (illustration === 'another') {
                                    // 바깥 if (searchCard.image) 가드가 보장 — TS는 클로저 안까지 내로잉을
                                    // 전파하지 못하므로 단언만 추가 (런타임 무변경)
                                    const urlWithParam = searchCard.image +
                                        (searchCard.image.includes('?') ? '&' : '?') +
                                        'illust=another';
                                    rarityPrices[illustration][language][rarity].image = urlWithParam;
                                }
                                else {
                                    rarityPrices[illustration][language][rarity].image = searchCard.image;
                                }
                            }
                        });
                    });
                });
            }
        }
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 12); // 캐시는 12시간 유효
        let cacheEntry;
        if (cachedResult) {
            Object.assign(cachedResult, {
                cardName: searchCard.name || cardName,
                image: searchCard.image || null,
                gameType: gameType,
                rarityPrices,
                expiresAt,
            });
            await this.cacheRepo.save(cachedResult);
            cacheEntry = cachedResult;
        }
        else {
            cacheEntry = await this.cacheRepo.save(this.cacheRepo.create({
                cardName: searchCard.name || cardName,
                image: searchCard.image || null,
                gameType: gameType,
                rarityPrices,
                expiresAt,
            }));
        }
        let totalProducts = 0;
        Object.keys(rarityPrices).forEach(illustration => {
            Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                    totalProducts += rarityPrices[illustration][language][rarity].prices.length;
                });
            });
        });
        return {
            source: 'all_sources',
            card: searchCard,
            rarityPrices,
            totalProducts,
            cacheId: cacheEntry.id,
            cacheExpiresAt: expiresAt,
        };
    }
    async enhanceCardsWithCacheData(cards) {
        return await Promise.all(cards.map(async (card) => {
            if (card.rarityPrices) {
                return card;
            }
            if (card.cacheId) {
                try {
                    const priceCache = await this.cacheRepo.findOneBy({ id: card.cacheId });
                    if (priceCache && new Date() <= new Date(priceCache.expiresAt)) {
                        return {
                            ...card,
                            cardName: card.cardName || card.name || priceCache.cardName,
                            rarityPrices: priceCache.rarityPrices,
                            image: card.image || priceCache.image,
                        };
                    }
                    else if (priceCache) {
                        console.log(`[WARN] "${card.name || card.cardName}" 카드의 캐시 데이터가 만료되었습니다. 새로 조회합니다.`);
                        const cardName = card.cardName || card.name || priceCache.cardName;
                        try {
                            const freshResult = await this.getOrCreateCardPriceData(cardName, null, priceCache.gameType);
                            if (!freshResult) {
                                console.log(`[WARN] "${cardName}" 카드 검색 결과가 없습니다.`);
                                return card;
                            }
                            const { card: searchCard, rarityPrices: freshRarityPrices } = freshResult;
                            const newCard = searchCard;
                            if (card.image) {
                                newCard.image = card.image;
                            }
                            return {
                                ...card,
                                cardName: newCard.name || cardName,
                                rarityPrices: freshRarityPrices,
                                image: newCard.image || null,
                                cacheId: freshResult.cacheId,
                            };
                        }
                        catch (error) {
                            console.error(`[ERROR] "${cardName}" 카드의 가격 정보 새로 조회 중 오류 발생: ${error.message}`);
                            return card;
                        }
                    }
                }
                catch (error) {
                    console.error(`[ERROR] 캐시 데이터 조회 중 오류 발생: ${error.message}`);
                }
            }
            return card;
        }));
    }
    // 시그니처만 타입 적용. 내부는 옵셔널 필드를 단계적으로 변이시키는 원본 로직이라
    // 폐쇄형 타입과 충돌한다 — characterization 테스트 확보 후(3단계) 조인다.
    processCardDataStructure(cards) {
        return cards
            .map((card) => {
            if (!card.cardName && !card.name) {
                console.log('[WARN] 카드 이름이 없는 카드 항목이 발견되었습니다:', card);
                return null;
            }
            if (!card.cardName && card.name) {
                card.cardName = card.name;
            }
            const illustrationType = card.illustrationType || 'default';
            const uniqueCardKey = `${card.cardName}_${illustrationType}_${card.language || 'any'}_${card.rarity || 'any'}`;
            card.uniqueCardKey = uniqueCardKey;
            if (!card.products && card.rarityPrices) {
                const prices = typeof card.rarityPrices === 'string'
                    ? JSON.parse(card.rarityPrices)
                    : card.rarityPrices;
                if (!card.image) {
                    const illustrationType = card.illustrationType || 'default';
                    if (card.language &&
                        card.rarity &&
                        prices[illustrationType] &&
                        prices[illustrationType][card.language] &&
                        prices[illustrationType][card.language][card.rarity] &&
                        prices[illustrationType][card.language][card.rarity].image) {
                        card.image = prices[illustrationType][card.language][card.rarity].image;
                    }
                    else if (card.language && card.rarity) {
                        let foundImage = false;
                        for (const illustration of Object.keys(prices)) {
                            if (foundImage)
                                break;
                            if (prices[illustration] &&
                                prices[illustration][card.language] &&
                                prices[illustration][card.language][card.rarity] &&
                                prices[illustration][card.language][card.rarity].image) {
                                card.image = prices[illustration][card.language][card.rarity].image;
                                foundImage = true;
                                break;
                            }
                        }
                        if (!foundImage) {
                            for (const illustration of Object.keys(prices)) {
                                if (foundImage)
                                    break;
                                for (const language of Object.keys(prices[illustration] || {})) {
                                    if (foundImage)
                                        break;
                                    if (prices[illustration][language] &&
                                        prices[illustration][language][card.rarity] &&
                                        prices[illustration][language][card.rarity].image) {
                                        card.image = prices[illustration][language][card.rarity].image;
                                        foundImage = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!foundImage) {
                            for (const illustration of Object.keys(prices)) {
                                if (foundImage)
                                    break;
                                for (const language of Object.keys(prices[illustration] || {})) {
                                    if (foundImage)
                                        break;
                                    for (const rarity of Object.keys(prices[illustration][language] || {})) {
                                        if (prices[illustration][language][rarity].image) {
                                            card.image = prices[illustration][language][rarity].image;
                                            foundImage = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else {
                        let foundImage = false;
                        for (const illustration of Object.keys(prices)) {
                            if (foundImage)
                                break;
                            for (const language of Object.keys(prices[illustration] || {})) {
                                if (foundImage)
                                    break;
                                for (const rarity of Object.keys(prices[illustration][language] || {})) {
                                    if (prices[illustration][language][rarity].image) {
                                        card.image = prices[illustration][language][rarity].image;
                                        foundImage = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                if (card.language &&
                    card.rarity &&
                    prices[illustrationType] &&
                    prices[illustrationType][card.language] &&
                    prices[illustrationType][card.language][card.rarity]) {
                    card.products = prices[illustrationType][card.language][card.rarity].prices;
                }
                else if (card.language && card.rarity) {
                    console.log(`[WARN] "${card.cardName}" 카드의 일러스트: ${illustrationType}, 언어: ${card.language}, 레어도: ${card.rarity} 조합을 찾을 수 없습니다.`);
                    card.products = [];
                }
                else if (card.rarity) {
                    card.products = [];
                    if (prices[illustrationType]) {
                        Object.keys(prices[illustrationType] || {}).forEach(language => {
                            if (prices[illustrationType][language] &&
                                prices[illustrationType][language][card.rarity]) {
                                card.products = [
                                    ...card.products,
                                    ...prices[illustrationType][language][card.rarity].prices,
                                ];
                            }
                        });
                    }
                }
                else if (card.language) {
                    card.products = [];
                    if (prices[illustrationType] && prices[illustrationType][card.language]) {
                        Object.keys(prices[illustrationType][card.language]).forEach(rarity => {
                            card.products = [
                                ...card.products,
                                ...prices[illustrationType][card.language][rarity].prices,
                            ];
                        });
                    }
                }
                else {
                    card.products = [];
                    Object.keys(prices).forEach(illustration => {
                        Object.keys(prices[illustration] || {}).forEach(language => {
                            Object.keys(prices[illustration][language] || {}).forEach(rarity => {
                                card.products = [
                                    ...card.products,
                                    ...prices[illustration][language][rarity].prices,
                                ];
                            });
                        });
                    });
                }
            }
            else if (!card.products) {
                console.log(`[ERROR] "${card.cardName}" 카드에 product 정보가 없으며 rarityPrices도 없습니다. 레어도와 언어를 선택했는지 확인이 필요합니다.`);
                return null;
            }
            if (card.products && card.products.length > 0) {
                card.products = card.products.map((product) => {
                    if (!product.product) {
                        // URL에서 TCGShop의 goodsIdx 추출 시도
                        let productId = null;
                        if (product.url &&
                            product.url.includes('tcgshop.co.kr') &&
                            product.url.includes('goodsIdx=')) {
                            const match = product.url.match(/goodsIdx=(\d+)/);
                            if (match && match[1]) {
                                productId = match[1];
                            }
                        }
                        product.product = {
                            id: (product.id ||
                                product.productId ||
                                productId ||
                                `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`).toString(),
                            url: product.url,
                            site: product.site,
                            price: product.price,
                            available: product.available,
                            cardCode: product.cardCode,
                            condition: product.condition,
                            language: product.language,
                            rarity: product.rarity,
                            illustration: product.illustration || 'default',
                        };
                    }
                    else if (product.product && !product.product.id) {
                        let productId = null;
                        if (product.product.url &&
                            product.product.url.includes('tcgshop.co.kr') &&
                            product.product.url.includes('goodsIdx=')) {
                            const match = product.product.url.match(/goodsIdx=(\d+)/);
                            if (match && match[1]) {
                                productId = match[1];
                            }
                        }
                        product.product.id = (product.id ||
                            product.productId ||
                            productId ||
                            `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`).toString();
                    }
                    else if (product.product &&
                        product.product.id &&
                        typeof product.product.id === 'number') {
                        product.product.id = product.product.id.toString();
                    }
                    return product;
                });
            }
            return card;
        })
            .filter(card => card !== null && card.products && card.products.length > 0);
    }
    calculateTotalProducts(rarityPrices) {
        let productCount = 0;
        const prices = typeof rarityPrices === 'string' ? JSON.parse(rarityPrices) : rarityPrices;
        if (!prices || Object.keys(prices).length === 0)
            return 0;
        Object.keys(prices).forEach(illustration => {
            Object.keys(prices[illustration] || {}).forEach(language => {
                Object.keys(prices[illustration][language] || {}).forEach(rarity => {
                    if (prices[illustration][language][rarity] &&
                        prices[illustration][language][rarity].prices) {
                        productCount += prices[illustration][language][rarity].prices.length;
                    }
                });
            });
        });
        return productCount;
    }
    async findCacheById(id) {
        return this.cacheRepo.findOneBy({ id });
    }
};
exports.CardsService = CardsService;
exports.CardsService = CardsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(card_price_cache_entity_1.CardPriceCache)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], CardsService);
//# sourceMappingURL=cards.service.js.map