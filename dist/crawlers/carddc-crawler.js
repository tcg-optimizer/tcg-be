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
exports.crawlCardDCVanguard = exports.crawlCardDC = void 0;
exports.searchAndSaveCardDCPrices = searchAndSaveCardDCPrices;
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
const crawlCardDCVanguard = async (cardName, gameType = game_types_1.GAME_TYPES.VANGUARD) => {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.VANGUARD);
        // EUC-KR로 인코딩된 검색어 생성, 인코딩 안 할 경우 검색 안됨 유의
        const encodedQuery = (0, crawler_1.encodeEUCKR)(cardName);
        const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;
        const config = (0, user_agent_util_1.createCrawlerConfig)('carddc', {
            timeoutMs: 10000,
            additionalHeaders: {
                'Upgrade-Insecure-Requests': '1',
            },
        });
        const response = await axios_1.default.get(searchUrl, config);
        const html = iconv_lite_1.default.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        const items = [];
        // 상품 목록 처리 - 테이블 내의 모든 tr 요소 확인
        $('table tr').each((index, row) => {
            const cells = $(row).find('td');
            cells.each((cellIndex, cell) => {
                const productCell = $(cell);
                // CardDC의 상품 링크와 제목은 ul.pro_t > li > a 에 있음
                const productLink = productCell.find('ul.pro_t li a').first();
                if (!productLink.length) {
                    return;
                }
                const title = productLink.text().trim();
                // 뱅가드 카드 코드 패턴 확인 (D-PR-KR262, DZ-SS07-KRFFR03 등)
                const isCardCodePattern = isCardCodePatternForGame(cardName, gameType);
                // 카드 코드는 li.pro_info_t2 에 있음
                const extractedCardCode = productCell.find('li.pro_info_t2').text().trim();
                let isMatch = false;
                if (isCardCodePattern) {
                    // 사용자가 카드 코드로 검색하는 경우 - 추출된 카드 코드와 비교
                    if (extractedCardCode) {
                        const cleanSearchCode = cardName.trim().toLowerCase();
                        const cleanExtractedCode = extractedCardCode.toLowerCase();
                        isMatch = cleanExtractedCode === cleanSearchCode;
                    }
                }
                else {
                    // 사용자가 카드명으로 검색하는 경우 - 기존 로직 사용
                    const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
                    const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
                    isMatch = cleanTitle.includes(cleanCardName);
                }
                if (!title || !isMatch) {
                    if (title) {
                        return;
                    }
                    return;
                }
                const isSoldOut = productCell.find('img[src*="icon_sortout.jpg"]').length > 0;
                if (isSoldOut) {
                    return;
                }
                const detailUrl = productLink.attr('href');
                const fullUrl = detailUrl && detailUrl.startsWith('http')
                    ? detailUrl
                    : `https://www.carddc.co.kr/${detailUrl}`;
                // 상품의 레어도는 li.pro_info_t 에 있음
                const rarityText = productCell.find('li.pro_info_t').text().trim();
                let rarity = '알 수 없음';
                if (rarityText) {
                    rarity = (0, rarity_util_1.parseRarity)(rarityText || title, gameType);
                }
                let discountPrice = 0;
                let originalPrice = 0;
                // 원래 가격은 s 태그 안에 있음
                const originalPriceText = productCell.find('s').text().trim();
                if (originalPriceText) {
                    const priceMatch = originalPriceText.match(/[\d,]+/);
                    if (priceMatch) {
                        originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                    }
                }
                // 할인된 가격은 li.price_t 에 있음
                const discountPriceText = productCell.find('li.price_t').text().trim();
                if (discountPriceText) {
                    const priceMatch = discountPriceText.match(/[\d,]+/);
                    if (priceMatch) {
                        discountPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                    }
                }
                if (discountPrice === 0 && originalPrice > 0) {
                    discountPrice = originalPrice;
                }
                let language = '알 수 없음';
                if (extractedCardCode) {
                    language = (0, crawler_1.parseLanguage)(extractedCardCode, gameType);
                }
                else {
                    language = (0, crawler_1.parseLanguage)(title, gameType);
                }
                rarity = (0, rarity_util_1.normalizeRarity)(rarity, { gameType, cardCode: extractedCardCode });
                const condition = (0, crawler_1.parseCondition)(title);
                const illustration = (0, crawler_1.detectIllustration)(title);
                // URL에서 상품 ID 추출 - prdno=숫자 형식
                let productId = null;
                const productIdMatch = fullUrl.match(/prdno=(\d+)/);
                if (productIdMatch && productIdMatch[1]) {
                    productId = `carddc-${productIdMatch[1]}`;
                }
                // prdno가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
                if (!productId) {
                    const urlHash = fullUrl.split('').reduce((acc, char) => {
                        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
                    }, 0);
                    productId = `carddc-${Math.abs(urlHash)}`;
                }
                items.push({
                    title,
                    url: fullUrl,
                    condition,
                    rarity,
                    language,
                    cardCode: extractedCardCode,
                    price: discountPrice,
                    site: 'CardDC',
                    available: true, // 여기서는 항상 true임에 유의해야 함 (품절상품은 위에서 필터링됨)
                    productId,
                    illustration,
                });
            });
        });
        return items;
    }
    catch (error) {
        console.error('[ERROR] CardDC 뱅가드 크롤링 오류:', error);
        return [];
    }
};
const crawlCardDC = async (cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) => {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        // EUC-KR로 인코딩된 검색어 생성, 인코딩 안 할 경우 검색 안됨 유의
        const encodedQuery = (0, crawler_1.encodeEUCKR)(cardName);
        const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;
        const config = (0, user_agent_util_1.createCrawlerConfig)('carddc', {
            timeoutMs: 10000,
        });
        const response = await axios_1.default.get(searchUrl, config);
        // 응답 디코딩
        const html = iconv_lite_1.default.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        const items = [];
        // 상품 목록 처리 - 테이블 내의 모든 tr 요소 확인
        $('table tr').each((index, row) => {
            const cells = $(row).find('td');
            cells.each((cellIndex, cell) => {
                const productCell = $(cell);
                // CardDC의 상품 링크와 제목은 ul.pro_t > li > a 에 있음
                const productLink = productCell.find('ul.pro_t li a').first();
                if (!productLink.length) {
                    return;
                }
                const title = productLink.text().trim();
                const isCardCodePattern = isCardCodePatternForGame(cardName, gameType);
                // 카드 코드는 li.pro_info_t2 에 있음
                const extractedCardCode = productCell.find('li.pro_info_t2').text().trim();
                let isMatch = false;
                if (isCardCodePattern) {
                    // 사용자가 카드 코드로 검색하는 경우 - 추출된 카드 코드와 비교
                    if (extractedCardCode) {
                        const cleanSearchCode = cardName.trim().toLowerCase();
                        const cleanExtractedCode = extractedCardCode.toLowerCase();
                        isMatch = cleanExtractedCode === cleanSearchCode;
                    }
                }
                else {
                    // 사용자가 카드명으로 검색하는 경우 - 기존 로직 사용
                    const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
                    const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
                    isMatch = cleanTitle.includes(cleanCardName);
                }
                if (!title || !isMatch) {
                    if (title) {
                        return;
                    }
                    return;
                }
                const isSoldOut = productCell.find('img[src*="icon_sortout.jpg"]').length > 0;
                if (isSoldOut) {
                    return;
                }
                const detailUrl = productLink.attr('href');
                const fullUrl = detailUrl && detailUrl.startsWith('http')
                    ? detailUrl
                    : `https://www.carddc.co.kr/${detailUrl}`;
                // 상품의 레어도는 li.pro_info_t 에 있음
                const rarityText = productCell.find('li.pro_info_t').text().trim();
                let rarity = '알 수 없음';
                if (rarityText) {
                    rarity = (0, rarity_util_1.parseRarity)(rarityText || title, gameType);
                }
                let discountPrice = 0;
                let originalPrice = 0;
                // 원래 가격은 s 태그 안에 있음
                const originalPriceText = productCell.find('s').text().trim();
                if (originalPriceText) {
                    const priceMatch = originalPriceText.match(/[\d,]+/);
                    if (priceMatch) {
                        originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                    }
                }
                // 할인된 가격은 li.price_t 에 있음
                const discountPriceText = productCell.find('li.price_t').text().trim();
                if (discountPriceText) {
                    const priceMatch = discountPriceText.match(/[\d,]+/);
                    if (priceMatch) {
                        discountPrice = parseInt(priceMatch[0].replace(/,/g, ''));
                    }
                }
                if (discountPrice === 0 && originalPrice > 0) {
                    discountPrice = originalPrice;
                }
                let language = '알 수 없음';
                if (extractedCardCode) {
                    language = (0, crawler_1.parseLanguage)(extractedCardCode, gameType);
                }
                else {
                    language = (0, crawler_1.parseLanguage)(title, gameType);
                }
                rarity = (0, rarity_util_1.normalizeRarity)(rarity, { gameType, cardCode: extractedCardCode });
                const condition = (0, crawler_1.parseCondition)(title);
                const illustration = (0, crawler_1.detectIllustration)(title);
                // URL에서 상품 ID 추출 - item_id=숫자 형식
                let productId = null;
                const productIdMatch = fullUrl.match(/item_id=(\d+)/);
                if (productIdMatch && productIdMatch[1]) {
                    productId = `carddc-${productIdMatch[1]}`;
                }
                // item_id가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
                if (!productId) {
                    const urlHash = fullUrl.split('').reduce((acc, char) => {
                        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
                    }, 0);
                    productId = `carddc-${Math.abs(urlHash)}`;
                }
                items.push({
                    title,
                    url: fullUrl,
                    condition,
                    rarity,
                    language,
                    cardCode: extractedCardCode,
                    price: discountPrice,
                    site: 'CardDC',
                    available: true, // 여기서는 항상 true임에 유의해야 함 (품절상품은 위에서 필터링됨)
                    productId,
                    illustration,
                });
            });
        });
        return items;
    }
    catch (error) {
        console.error('[ERROR] CardDC 크롤링 오류:', error);
        return [];
    }
};
const crawlCardDCWithRateLimit = (0, rate_limiter_1.withRateLimit)(crawlCardDC, 'carddc');
exports.crawlCardDC = crawlCardDCWithRateLimit;
const crawlCardDCVanguardWithRateLimit = (0, rate_limiter_1.withRateLimit)(crawlCardDCVanguard, 'carddc');
exports.crawlCardDCVanguard = crawlCardDCVanguardWithRateLimit;
async function searchAndSaveCardDCPrices(cardName, gameType = game_types_1.GAME_TYPES.YUGIOH) {
    try {
        gameType = (0, game_type_1.normalizeGameType)(gameType, game_types_1.GAME_TYPES.YUGIOH);
        // gameType에 따라 적절한 크롤링 함수 선택
        let results;
        if (gameType === game_types_1.GAME_TYPES.VANGUARD || gameType === game_types_1.GAME_TYPES.ONEPIECE) {
            results = await crawlCardDCVanguardWithRateLimit(cardName, gameType);
        }
        else {
            results = await crawlCardDCWithRateLimit(cardName, gameType);
        }
        if (results.length === 0) {
            return {
                message: 'CardDC에서 검색 결과가 없습니다.',
                count: 0,
            };
        }
        return {
            message: `CardDC에서 ${results.length}개의 가격 정보를 찾았습니다.`,
            count: results.length,
            prices: results.map(item => {
                return {
                    ...item,
                    product: {
                        id: item.productId,
                        url: item.url,
                        site: 'CardDC',
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
        console.error('[ERROR] CardDC 가격 검색 및 저장 오류:', error);
        return {
            message: `CardDC 가격 검색 중 오류 발생: ${err.message}`,
            count: 0,
            error: err.message,
        };
    }
}
//# sourceMappingURL=carddc-crawler.js.map