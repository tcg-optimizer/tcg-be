"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlTCGShopVanguard = exports.crawlTCGShop = void 0;
exports.searchAndSaveTCGShopPrices = searchAndSaveTCGShopPrices;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const rarity_util_1 = require("../common/utils/rarity-util");
const crawler_1 = require("./crawler");
const rate_limiter_1 = require("./rate-limiter");
const user_agent_util_1 = require("../common/utils/user-agent-util");
const game_types_1 = require("../common/constants/game-types");
const game_type_1 = require("../common/utils/game-type");
function isCardCodePatternForGame(cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) {
    if (!cardName || typeof cardName !== 'string') {
        return false;
    }
    const normalized = cardName.trim();
    switch (gameType) {
        case game_types_1.GAME_TYPES.VANGUARD:
            return /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}-[A-Z]{2}[A-Z0-9]+$/i.test(normalized);
        case game_types_1.GAME_TYPES.ONEPIECE:
            return /^(?:[A-Z]{1,4}\d{2}-\d{3}[A-Z]?|[A-Z]{1,4}-\d{2}-\d{3}[A-Z]?|P-\d{3}[A-Z]?)$/i.test(normalized);
        case game_types_1.GAME_TYPES.YUGIOH:
        default:
            return /^[A-Z0-9]{2,5}-[A-Z]{2}\d{3,4}$/i.test(normalized);
    }
}
async function crawlTCGShopVanguard(cardName, gameType = game_types_1.GAME_TYPES.VANGUARD) {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.VANGUARD);
        const encodedQuery = (0, crawler_1.encodeEUCKR)(cardName);
        const searchUrl = `http://www.tcgshop.co.kr/search_result.php?search=meta_str&searchstring=${encodedQuery.replace(/%20/g, '+')}`;
        const config = (0, user_agent_util_1.createCrawlerConfig)('tcgshop', {
            timeoutMs: 10000,
            additionalHeaders: {
                'Upgrade-Insecure-Requests': '1',
            },
        });
        const response = await axios_1.default.get(searchUrl, config);
        const html = iconv_lite_1.default.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        const items = [];
        // 뱅가드 검색 결과는 각 상품이 개별 table로 구성됨
        // id가 "list_card_"로 시작하는 table들을 찾음
        const productTables = $('table[id^="list_card_"]');
        productTables.each((index, element) => {
            const productTable = $(element);
            // 상품명 추출 (td.glist_01 안의 a 태그)
            const productLink = productTable.find('td.glist_01 a[href*="goods_detail.php"]');
            if (!productLink.length) {
                return;
            }
            const title = productLink.text().trim();
            // 입력된 카드명이 카드 코드 패턴인지 확인 (뱅가드: D-PR-KR262, DZ-SS07-KRFFR03 등)
            const isCardCodePattern = isCardCodePatternForGame(cardName, gameType);
            // 카드 코드 추출 (span.glist_02에서 괄호 안의 내용)
            const codeElement = productTable.find('span.glist_02');
            let extractedCardCode = null;
            if (codeElement.length) {
                const codeText = codeElement.text().trim();
                const codeMatch = codeText.match(/\(([^)]+)\)/);
                if (codeMatch && codeMatch[1]) {
                    extractedCardCode = codeMatch[1];
                }
            }
            // 제목에 카드명이 포함되어 있는지 확인
            let isMatch = false;
            if (isCardCodePattern) {
                // 카드 코드로 검색하는 경우: 추출된 카드 코드와 비교
                if (extractedCardCode) {
                    const cleanSearchCode = cardName.trim().toLowerCase();
                    const cleanExtractedCode = extractedCardCode.toLowerCase();
                    isMatch = cleanExtractedCode === cleanSearchCode;
                }
            }
            else {
                // 일반 카드명으로 검색하는 경우: 기존 로직 사용 (특수문자와 띄어쓰기 제외)
                const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
                const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
                isMatch = cleanTitle.includes(cleanCardName);
            }
            if (!title || !isMatch) {
                return;
            }
            // 레어리티 추출 (span.glist_03의 첫 번째 요소)
            const rarityElements = productTable.find('span.glist_03');
            let rarity = '알 수 없음';
            if (rarityElements.length > 0) {
                const rarityText = rarityElements.first().text().trim();
                if (rarityText) {
                    rarity = (0, rarity_util_1.parseRarity)(rarityText, gameType);
                }
            }
            // 원래 가격 추출 (strike 태그)
            let originalPrice = 0;
            const strikeElement = productTable.find('strike');
            if (strikeElement.length) {
                const strikeText = strikeElement.text().trim();
                const priceMatch = strikeText.match(/[\d,]+/);
                if (priceMatch) {
                    originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                }
            }
            // 할인된 가격 추출 (span.glist_price12)
            let price = 0;
            const priceElement = productTable.find('span.glist_price12');
            if (priceElement.length) {
                const priceText = priceElement.text().trim();
                const priceMatch = priceText.match(/[\d,]+/);
                if (priceMatch) {
                    price = parseInt(priceMatch[0].replace(/,/g, ''));
                }
            }
            else if (originalPrice > 0) {
                // 할인된 가격이 없으면 원래 가격 사용
                price = originalPrice;
            }
            let language = (0, crawler_1.parseLanguage)(title, gameType);
            const condition = (0, crawler_1.parseCondition)(title);
            if (language === '알 수 없음' && extractedCardCode) {
                language = (0, crawler_1.parseLanguage)(extractedCardCode, gameType);
            }
            rarity = (0, rarity_util_1.normalizeRarity)(rarity, { gameType, cardCode: extractedCardCode });
            const illustration = (0, crawler_1.detectIllustration)(title);
            // 품절 여부 확인 (no_good_img 이미지가 있으면 품절)
            let available = true;
            const soldOutImage = productTable.find('img[src*="no_good_img"]');
            const cartImage = productTable.find('img[src*="go_cart.gif"]');
            if (soldOutImage.length > 0) {
                available = false;
            }
            else if (cartImage.length > 0) {
                available = true;
            }
            const detailUrl = productLink.attr('href');
            const fullUrl = detailUrl && detailUrl.startsWith('http')
                ? detailUrl
                : `http://www.tcgshop.co.kr/${detailUrl}`;
            // URL에서 상품 ID(goodsIdx) 추출
            let productId = null;
            const goodsIdxMatch = fullUrl.match(/goodsIdx=(\d+)/);
            if (goodsIdxMatch && goodsIdxMatch[1]) {
                productId = `tcgshop-${goodsIdxMatch[1]}`;
            }
            // goodsIdx가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
            if (!productId) {
                const urlHash = fullUrl.split('').reduce((acc, char) => {
                    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
                }, 0);
                productId = `tcgshop-${Math.abs(urlHash)}`;
            }
            items.push({
                title,
                url: fullUrl,
                condition,
                rarity,
                language,
                cardCode: extractedCardCode,
                price,
                site: 'TCGShop',
                available,
                productId,
                illustration,
            });
        });
        return items;
    }
    catch (error) {
        console.error('[ERROR] TCGShop 뱅가드 크롤링 오류:', error);
        return [];
    }
}
async function crawlTCGShop(cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        const encodedQuery = (0, crawler_1.encodeEUCKR)(cardName);
        const searchUrl = `http://www.tcgshop.co.kr/search_result.php?search=meta_str&searchstring=${encodedQuery.replace(/%20/g, '+')}`;
        const config = (0, user_agent_util_1.createCrawlerConfig)('tcgshop', {
            timeoutMs: 10000,
            additionalHeaders: {
                'Upgrade-Insecure-Requests': '1',
            },
        });
        const response = await axios_1.default.get(searchUrl, config);
        const html = iconv_lite_1.default.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        const items = [];
        // TCGShop 검색 결과는 td.glist_01 요소로 시작함
        const productCells = $('td.glist_01');
        productCells.each((index, element) => {
            const productCell = $(element);
            const productLink = productCell.find('a[href*="goods_detail.php"]');
            if (!productLink.length) {
                return;
            }
            const title = productLink.text().trim();
            // 입력된 카드명이 카드 코드 패턴인지 확인 (예: ALIN-KR011, ROTA-JP024 등)
            // 사용자가 카드 코드 패턴으로 검색하는 경우를 위함
            const isCardCodePattern = isCardCodePatternForGame(cardName, gameType);
            // 상품 행 (tr) 찾기
            const productRow = productCell.closest('tr');
            const codeRow = productRow.next();
            const codeElement = codeRow.find('.glist_02');
            let extractedCardCode = null;
            if (codeElement.length) {
                const codeText = codeElement.text().trim();
                const codeMatch = codeText.match(/\(([^)]+)\)/);
                if (codeMatch && codeMatch[1]) {
                    extractedCardCode = codeMatch[1];
                }
            }
            // 제목에 카드명이 포함되어 있는지 확인
            let isMatch = false;
            if (isCardCodePattern) {
                // 카드 코드로 검색하는 경우: 추출된 카드 코드와 비교
                if (extractedCardCode) {
                    const cleanSearchCode = cardName.trim().toLowerCase();
                    const cleanExtractedCode = extractedCardCode.toLowerCase();
                    isMatch = cleanExtractedCode === cleanSearchCode;
                }
            }
            else {
                // 일반 카드명으로 검색하는 경우: 기존 로직 사용 (특수문자와 띄어쓰기 제외)
                const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
                const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
                isMatch = cleanTitle.includes(cleanCardName);
            }
            if (!title || !isMatch) {
                return;
            }
            const rarityRow = codeRow.next();
            const rarityElement = rarityRow.find('.glist_03');
            let rarity = '알 수 없음';
            if (rarityElement.length) {
                const rarityText = rarityElement.first().text().trim();
                if (rarityText) {
                    rarity = (0, rarity_util_1.parseRarity)(rarityText, gameType);
                }
            }
            const priceRow = rarityRow.next();
            let originalPrice = 0;
            if (priceRow.find('strike').length) {
                const strikeText = priceRow.find('strike').text().trim();
                const priceMatch = strikeText.match(/[\d,]+/);
                if (priceMatch) {
                    originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                }
            }
            // 할인된 가격 행 (glist_price12 클래스)
            const discountRow = priceRow.next();
            let price = 0;
            if (discountRow.find('.glist_price12').length) {
                const priceElement = discountRow.find('.glist_price12');
                const priceText = priceElement.text().trim();
                price = parseInt(priceText.replace(/,/g, ''));
            }
            else if (originalPrice > 0) {
                // 할인된 가격이 없으면 원래 가격 사용
                price = originalPrice;
            }
            let language = (0, crawler_1.parseLanguage)(title, gameType);
            const condition = (0, crawler_1.parseCondition)(title);
            if (language === '알 수 없음' && extractedCardCode) {
                language = (0, crawler_1.parseLanguage)(extractedCardCode, gameType);
            }
            rarity = (0, rarity_util_1.normalizeRarity)(rarity, { gameType, cardCode: extractedCardCode });
            const illustration = (0, crawler_1.detectIllustration)(title);
            let available = true;
            // 해당 상품 행에서 품절 이미지 확인
            const soldOutImage = $(element).closest('table').find('img[src*="no_good_img"]');
            const cartImage = $(element).closest('table').find('img[src*="go_cart.gif"]');
            if (soldOutImage.length > 0) {
                available = false;
            }
            else if (cartImage.length > 0) {
                available = true;
            }
            const detailUrl = productLink.attr('href');
            const fullUrl = detailUrl && detailUrl.startsWith('http')
                ? detailUrl
                : `http://www.tcgshop.co.kr/${detailUrl}`;
            // URL에서 상품 ID(goodsIdx) 추출
            let productId = null;
            const goodsIdxMatch = fullUrl.match(/goodsIdx=(\d+)/);
            if (goodsIdxMatch && goodsIdxMatch[1]) {
                productId = `tcgshop-${goodsIdxMatch[1]}`;
            }
            // goodsIdx가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
            if (!productId) {
                const urlHash = fullUrl.split('').reduce((acc, char) => {
                    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
                }, 0);
                productId = `tcgshop-${Math.abs(urlHash)}`;
            }
            items.push({
                title,
                url: fullUrl,
                condition,
                rarity,
                language,
                cardCode: extractedCardCode,
                price,
                site: 'TCGShop',
                available,
                productId,
                illustration,
            });
        });
        return items;
    }
    catch (error) {
        console.error('[ERROR] TCGShop 크롤링 오류:', error);
        return [];
    }
}
const crawlTCGShopWithRateLimit = (0, rate_limiter_1.withRateLimit)(crawlTCGShop, 'tcgshop');
exports.crawlTCGShop = crawlTCGShopWithRateLimit;
const crawlTCGShopVanguardWithRateLimit = (0, rate_limiter_1.withRateLimit)(crawlTCGShopVanguard, 'tcgshop');
exports.crawlTCGShopVanguard = crawlTCGShopVanguardWithRateLimit;
async function searchAndSaveTCGShopPrices(cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        // gameType에 따라 적절한 크롤링 함수 선택
        let priceData;
        if (gameType === game_types_1.GAME_TYPES.VANGUARD || gameType === game_types_1.GAME_TYPES.ONEPIECE) {
            priceData = await crawlTCGShopVanguardWithRateLimit(cardName, gameType);
        }
        else {
            priceData = await crawlTCGShopWithRateLimit(cardName, gameType);
        }
        if (priceData.length === 0) {
            return {
                message: 'TCGShop에서 검색 결과가 없습니다.',
                count: 0,
            };
        }
        return {
            message: `TCGShop에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
            count: priceData.length,
            prices: priceData.map(item => {
                return {
                    ...item,
                    product: {
                        id: item.productId.toString(),
                        url: item.url,
                        site: 'TCGShop',
                        price: item.price,
                        available: item.available,
                        cardCode: item.cardCode,
                        condition: item.condition,
                        language: item.language,
                        rarity: item.rarity,
                        illustration: item.illustration || 'default',
                    },
                };
            }),
        };
    }
    catch (error) {
        const err = error;
        console.error('[ERROR] TCGShop 가격 검색 및 저장 오류:', error);
        return {
            message: `TCGShop 가격 검색 중 오류 발생: ${err.message}`,
            count: 0,
            error: err.message,
        };
    }
}
//# sourceMappingURL=tcgshop-crawler.js.map