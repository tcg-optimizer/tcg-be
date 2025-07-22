const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, detectIllustration, encodeEUCKR } = require('./crawler');
const { withRateLimit } = require('./rateLimiter');
const { createCrawlerConfig } = require('./userAgentUtil');

/**
 * TCGShop에서 카드 가격 정보를 크롤링합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @param {string} [cardId] - 카드 ID (선택적)
 * @returns {Promise<Array>} - 크롤링된 가격 정보 배열
 */
async function crawlTCGShop(cardName, cardId) {
  try {
    // EUC-KR로 인코딩된 검색어 생성
    const encodedQuery = encodeEUCKR(cardName);

    // 직접 검색 URL
    const searchUrl = `http://www.tcgshop.co.kr/search_result.php?search=meta_str&searchstring=${encodedQuery.replace(/%20/g, '+')}`;

    // 요청 설정 생성
    const config = createCrawlerConfig('tcgshop', {
      timeoutMs: 10000,
      additionalHeaders: {
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // 검색 결과 페이지 요청
    const response = await axios.get(searchUrl, config);

    // 응답 디코딩
    const html = iconv.decode(response.data, 'euc-kr');

    // Cheerio로 HTML 파싱
    const $ = cheerio.load(html);
    const items = [];

    // 직접 검색 결과 처리
    // TCGShop 검색 결과는 td.glist_01 요소로 시작하는 테이블 구조
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
      const isCardCodePattern = /^[A-Z0-9]{2,5}-[A-Z]{2}\d{3,4}$/i.test(cardName.trim());

      // 상품 행 (tr) 찾기
      const productRow = productCell.closest('tr');

      // 코드 정보 (다음 행에 있음)
      let codeRow = productRow.next();
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
      } else {
        // 일반 카드명으로 검색하는 경우: 기존 로직 사용 (특수문자와 띄어쓰기 제외)
        const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
        const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
        isMatch = cleanTitle.includes(cleanCardName);
      }

      if (!title || !isMatch) {
        return;
      }

      // 레어도 정보 (코드 다음 행에 있음)
      let rarityRow = codeRow.next();
      const rarityElement = rarityRow.find('.glist_03');
      let rarity = '알 수 없음';

      if (rarityElement.length) {
        const rarityText = rarityElement.first().text().trim();
        if (rarityText) {
          rarity = parseRarity(rarityText, title);
        }
      }

      // 가격 정보 (레어도 행 이후에 있음)
      // 원래 가격 행 (삭제선)
      let priceRow = rarityRow.next();
      let originalPrice = 0;

      if (priceRow.find('strike').length) {
        const strikeText = priceRow.find('strike').text().trim();
        const priceMatch = strikeText.match(/[\d,]+/);
        if (priceMatch) {
          originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
        }
      }

      // 할인된 가격 행 (glist_price12 클래스)
      let discountRow = priceRow.next();
      let price = 0;

      if (discountRow.find('.glist_price12').length) {
        const priceElement = discountRow.find('.glist_price12');
        const priceText = priceElement.text().trim();
        price = parseInt(priceText.replace(/,/g, ''));
      } else if (originalPrice > 0) {
        // 할인된 가격이 없으면 원래 가격 사용
        price = originalPrice;
      }

      // 상태 정보 (노멀, 중고 여부 등)
      let language = parseLanguage(title);
      const condition = parseCondition(title);

      // 언어 정보가 제목에서 추출되지 않았다면 카드 코드에서 추출 시도
      if (language === '알 수 없음' && extractedCardCode) {
        language = parseLanguage(extractedCardCode);
      }

      // 일러스트 타입 판단
      const illustration = detectIllustration(title);

      // 재고 여부 확인 - 검색 결과 페이지에서 확인
      let available = true;

      // 해당 상품 행에서 품절 이미지 확인
      const soldOutImage = $(element).closest('table').find('img[src*="no_good_img"]');
      const cartImage = $(element).closest('table').find('img[src*="go_cart.gif"]');

      if (soldOutImage.length > 0) {
        available = false;
      } else if (cartImage.length > 0) {
        available = true;
      }

      const detailUrl = productLink.attr('href');
      const fullUrl =
        detailUrl && detailUrl.startsWith('http')
          ? detailUrl
          : `http://www.tcgshop.co.kr/${detailUrl}`;

      // URL에서 상품 ID(goodsIdx) 추출
      let productId = null;
      const goodsIdxMatch = fullUrl.match(/goodsIdx=(\d+)/);
      if (goodsIdxMatch && goodsIdxMatch[1]) {
        productId = `tcgshop-${goodsIdxMatch[1]}`; // 숫자가 아닌 문자열로 유지하고 접두어 추가
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
        cardId,
        productId,
        illustration,
      });
    });

    return items;
  } catch (error) {
    console.error('[ERROR] TCGShop 크롤링 오류:', error);
    return [];
  }
}

// crawlTCGShop 함수를 요청 제한으로 래핑
const crawlTCGShopWithRateLimit = withRateLimit(crawlTCGShop, 'tcgshop');

/**
 * 카드 이름으로 검색하여 TCGShop 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveTCGShopPrices(cardName, cardId) {
  try {
    // 요청 제한이 적용된 함수 호출
    const priceData = await crawlTCGShopWithRateLimit(cardName);

    if (priceData.length === 0) {
      return {
        message: 'TCGShop에서 검색 결과가 없습니다.',
        cardId: cardId,
        count: 0,
      };
    }

    // 모델 불러오기
    const { CardPrice } = require('../models/Card');

    // 기존 TCGShop 가격 정보 삭제 (최신 정보로 갱신)
    if (cardId) {
      await CardPrice.destroy({
        where: {
          cardId: cardId,
          site: 'TCGShop',
        },
      });
    }

    // 가격 정보 저장을 위한 배열
    const prices = [];

    // 새 가격 정보 저장
    if (cardId) {
      await Promise.all(
        priceData.map(async item => {
          const savedPrice = await CardPrice.create({
            cardId: cardId,
            site: 'TCGShop',
            price: item.price,
            url: item.url,
            condition: item.condition,
            rarity: item.rarity,
            language: item.language,
            available: item.available,
            cardCode: item.cardCode,
            lastUpdated: new Date(),
            productId: item.productId,
            illustration: item.illustration || 'default',
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          });

          // product 객체에 id 필드 추가
          const productWithId = {
            id: item.productId.toString(), // productId를 id로 사용 (문자열로 변환)
            url: item.url,
            site: 'TCGShop',
            price: item.price,
            available: item.available,
            cardCode: item.cardCode,
            condition: item.condition,
            language: item.language,
            rarity: item.rarity,
            illustration: item.illustration || 'default', // 일러스트 필드 추가
          };

          // savedPrice에 product 필드 추가
          savedPrice.dataValues.product = productWithId;

          prices.push(savedPrice);
          return savedPrice;
        })
      );
    }

    return {
      message: `TCGShop에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: priceData.length,
      prices: cardId
        ? prices
        : priceData.map(item => {
            // 직접 product 객체 생성하여 반환
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
  } catch (error) {
    console.error('[ERROR] TCGShop 가격 검색 및 저장 오류:', error);
    return {
      message: `TCGShop 가격 검색 중 오류 발생: ${error.message}`,
      cardId: cardId,
      count: 0,
      error: error.message,
    };
  }
}

module.exports = {
  crawlTCGShop: crawlTCGShopWithRateLimit,
  searchAndSaveTCGShopPrices,
};
