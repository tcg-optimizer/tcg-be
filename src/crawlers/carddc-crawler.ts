import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { parseRarity, normalizeRarity } from '../common/utils/rarity-util';
import { parseLanguage, parseCondition, detectIllustration, encodeEUCKR } from './crawler';
import { withRateLimit } from './rate-limiter';
import { createCrawlerConfig } from '../common/utils/user-agent-util';
import { GAME_TYPES } from '../common/constants/game-types';
import { normalizeGameType } from '../common/utils/game-type';

function isCardCodePatternForGame(cardName: string, gameType: string = GAME_TYPES.YUGIOH): boolean {
  if (!cardName || typeof cardName !== 'string') {
    return false;
  }

  const normalized = cardName.trim();

  switch (gameType) {
    case GAME_TYPES.VANGUARD:
      return /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}-[A-Z]{2}[A-Z0-9]+$/i.test(normalized);
    case GAME_TYPES.ONEPIECE:
      return /^(?:[A-Z]{1,4}\d{2}-\d{3}[A-Z]?|[A-Z]{1,4}-\d{2}-\d{3}[A-Z]?|P-\d{3}[A-Z]?)$/i.test(
        normalized
      );
    case GAME_TYPES.YUGIOH:
    default:
      return /^[A-Z0-9]{2,5}-[A-Z]{2}\d{3,4}$/i.test(normalized);
  }
}

const crawlCardDCVanguard = async (
  cardName: string,
  gameType: string = GAME_TYPES.VANGUARD
): Promise<any[]> => {
  try {
    gameType = normalizeGameType(gameType, GAME_TYPES.VANGUARD);

    // EUC-KR로 인코딩된 검색어 생성, 인코딩 안 할 경우 검색 안됨 유의
    const encodedQuery = encodeEUCKR(cardName);

    const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;

    const config = createCrawlerConfig('carddc', {
      timeoutMs: 10000,
      additionalHeaders: {
        'Upgrade-Insecure-Requests': '1',
      },
    });

    const response = await axios.get(searchUrl, config);

    const html = iconv.decode(response.data, 'euc-kr');

    const $ = cheerio.load(html);
    const items: any[] = [];

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
        } else {
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
        const fullUrl =
          detailUrl && detailUrl.startsWith('http')
            ? detailUrl
            : `https://www.carddc.co.kr/${detailUrl}`;

        // 상품의 레어도는 li.pro_info_t 에 있음
        const rarityText = productCell.find('li.pro_info_t').text().trim();

        let rarity = '알 수 없음';

        if (rarityText) {
          rarity = parseRarity(rarityText || title, gameType);
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
          language = parseLanguage(extractedCardCode, gameType);
        } else {
          language = parseLanguage(title, gameType);
        }

        rarity = normalizeRarity(rarity, { gameType, cardCode: extractedCardCode });

        const condition = parseCondition(title);

        const illustration = detectIllustration(title);

        // URL에서 상품 ID 추출 - prdno=숫자 형식
        let productId: string | null = null;
        const productIdMatch = fullUrl.match(/prdno=(\d+)/);
        if (productIdMatch && productIdMatch[1]) {
          productId = `carddc-${productIdMatch[1]}`;
        }

        // prdno가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
        if (!productId) {
          const urlHash = fullUrl.split('').reduce((acc: number, char: string) => {
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
  } catch (error) {
    console.error('[ERROR] CardDC 뱅가드 크롤링 오류:', error);
    return [];
  }
};

const crawlCardDC = async (
  cardName: string,
  gameType: string = GAME_TYPES.YUGIOH
): Promise<any[]> => {
  try {
    gameType = normalizeGameType(gameType, GAME_TYPES.YUGIOH);

    // EUC-KR로 인코딩된 검색어 생성, 인코딩 안 할 경우 검색 안됨 유의
    const encodedQuery = encodeEUCKR(cardName);

    const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;

    const config = createCrawlerConfig('carddc', {
      timeoutMs: 10000,
    });

    const response = await axios.get(searchUrl, config);

    // 응답 디코딩
    const html = iconv.decode(response.data, 'euc-kr');

    const $ = cheerio.load(html);
    const items: any[] = [];

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
        } else {
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
        const fullUrl =
          detailUrl && detailUrl.startsWith('http')
            ? detailUrl
            : `https://www.carddc.co.kr/${detailUrl}`;

        // 상품의 레어도는 li.pro_info_t 에 있음
        const rarityText = productCell.find('li.pro_info_t').text().trim();

        let rarity = '알 수 없음';

        if (rarityText) {
          rarity = parseRarity(rarityText || title, gameType);
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
          language = parseLanguage(extractedCardCode, gameType);
        } else {
          language = parseLanguage(title, gameType);
        }

        rarity = normalizeRarity(rarity, { gameType, cardCode: extractedCardCode });

        const condition = parseCondition(title);

        const illustration = detectIllustration(title);

        // URL에서 상품 ID 추출 - item_id=숫자 형식
        let productId: string | null = null;
        const productIdMatch = fullUrl.match(/item_id=(\d+)/);
        if (productIdMatch && productIdMatch[1]) {
          productId = `carddc-${productIdMatch[1]}`;
        }

        // item_id가 없는 경우, URL에서 해시를 생성하여 고유 ID 생성
        if (!productId) {
          const urlHash = fullUrl.split('').reduce((acc: number, char: string) => {
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
  } catch (error) {
    console.error('[ERROR] CardDC 크롤링 오류:', error);
    return [];
  }
};

const crawlCardDCWithRateLimit = withRateLimit(crawlCardDC, 'carddc');
const crawlCardDCVanguardWithRateLimit = withRateLimit(crawlCardDCVanguard, 'carddc');

export async function searchAndSaveCardDCPrices(
  cardName: string,
  gameType: string = GAME_TYPES.YUGIOH
): Promise<any> {
  try {
    gameType = normalizeGameType(gameType, GAME_TYPES.YUGIOH);

    // gameType에 따라 적절한 크롤링 함수 선택
    let results: any[];
    if (gameType === GAME_TYPES.VANGUARD || gameType === GAME_TYPES.ONEPIECE) {
      results = await crawlCardDCVanguardWithRateLimit(cardName, gameType);
    } else {
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
  } catch (error: any) {
    console.error('[ERROR] CardDC 가격 검색 및 저장 오류:', error);
    return {
      message: `CardDC 가격 검색 중 오류 발생: ${error.message}`,
      count: 0,
      error: error.message,
    };
  }
}

export {
  crawlCardDCWithRateLimit as crawlCardDC,
  crawlCardDCVanguardWithRateLimit as crawlCardDCVanguard,
};
