const axios = require('axios');
const { Card, CardPrice } = require('../models/Card');
const { Op } = require('sequelize');
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode, detectIllustration } = require('./crawler');
const { withRateLimit } = require('./rateLimiter');
const { getRandomizedHeaders } = require('./userAgentUtil');

/**
 * 지정된 시간(ms) 동안 실행을 지연시키는 함수
 * @param {number} ms - 지연 시간 (밀리초)
 * @returns {Promise} - 지정된 시간 후 해결되는 Promise
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 실제 네이버 API 검색을 수행하는 함수
 * @param {string} searchQuery - 검색 쿼리
 * @param {string} clientId - 네이버 클라이언트 ID
 * @param {string} clientSecret - 네이버 클라이언트 시크릿
 * @param {number} maxPages - 최대 검색 페이지 수
 * @param {number} startPage - 시작 페이지 (기본값: 1)
 * @returns {Promise<Array>} - 검색된 상품 정보 배열
 */
const performNaverSearch = async (searchQuery, clientId, clientSecret, maxPages, startPage = 1) => {
  const query = encodeURIComponent(searchQuery);
  const display = 100; // 검색 결과 개수 (최대 100)
  const sort = 'sim'; // 정렬 (sim: 정확도순, date: 날짜순, asc: 가격오름차순, dsc: 가격내림차순)
  const exclude = 'used:rental:cbshop'; // 중고, 렌탈, 해외직구/구매대행 제외
  // 네이버 샵들이 중고 상품을 중고 카테고리로 분류하지 않는 경우가 많아 여전히 추가적인 중고 파싱 로직은 필요함

  let allItems = [];
  let start = (startPage - 1) * display + 1; // 시작 페이지에 맞게 start 계산
  let hasMoreItems = true;
  const maxItems = maxPages * display; // 최대 아이템 수
  let retryCount = 0;
  const maxRetries = 3;
  let currentPage = startPage;

  while (hasMoreItems && allItems.length < maxItems && currentPage <= maxPages) {
    const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${query}&display=${display}&start=${start}&sort=${sort}&exclude=${exclude}`;

    try {
      // 네이버 429 에러 방지를 위한 지연 시간
      await delay(100);

      const combinedHeaders = {
        ...getRandomizedHeaders(false),
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      };

      const response = await axios.get(apiUrl, {
        headers: combinedHeaders,
        timeout: 5000,
      });

      const items = response.data.items.map(item => {
        const title = item.title.replace(/<b>|<\/b>/g, ''); // HTML 태그 제거용

        const rarity = parseRarity(title);
        const condition = parseCondition(title);
        const cardCode = extractCardCode(title);
        const language = parseLanguage(title);
        const illustration = detectIllustration(title);

        return {
          title: title,
          price: parseInt(item.lprice),
          site: item.mallName,
          url: item.link,
          productId: item.productId.toString(),
          image: item.image,
          condition: condition,
          rarity: rarity,
          language: language,
          cardCode: cardCode,
          available: true,
          illustration: illustration,
        };
      });

      // 번개장터 상품과 언어/레어도가 '알 수 없음'인 상품들을 필터링
      const filteredItems = items.filter(
        item =>
          item.site !== '번개장터' &&
          !item.site.includes('번개장터') &&
          item.language !== '알 수 없음' &&
          item.rarity !== '알 수 없음'
      );

      if (filteredItems.length > 0) {
        allItems = [...allItems, ...filteredItems];
      }

      retryCount = 0;

      // 100개 미만의 결과를 받았거나 최대 페이지에 도달했다면 더 이상 요청하지 않음
      if (items.length < display || currentPage >= maxPages) {
        hasMoreItems = false;
      } else {
        start += display;
        currentPage++;
      }
    } catch (error) {
      if (error.response && error.response.status === 429) {
        console.log('[WARN] 네이버 API 요청 한도 초과. 2초 대기 후 재시도합니다.');
        await delay(2000);
      } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        // 소켓 오류나 타임아웃 처리
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(
            `[WARN] 네이버 API 연결 오류(${error.code}). ${retryCount}/${maxRetries} 재시도 중...`
          );
          await delay(2000 * retryCount);
          continue; // 현재 시도 건너뛰기
        } else {
          console.log('[WARN] 네이버 API 연결 오류. 최대 재시도 횟수 초과, 검색 종료.');
          break; // 최대 재시도 횟수 초과하면 루프 종료
        }
      } else {
        console.error(`[ERROR] 네이버 API 오류: ${error.message}`);
        break;
      }
    }
  }

  console.log(
    `[INFO] "${searchQuery}" 검색 완료: 총 ${allItems.length}개의 유효한 유희왕 카드 발견 (${maxPages}페이지, 최대 ${maxItems}개)`
  );
  return allItems;
};

/**
 * 네이버 쇼핑 검색 API를 사용하여 카드 가격 정보를 가져옵니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 검색된 상품 정보 배열
 */
const searchNaverShop = async cardName => {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('네이버 API 인증 정보가 설정되지 않았습니다.');
    }

    // 첫 번째 검색 시도 (3페이지까지) - 카드 이름으로 검색
    let searchQuery = cardName;
    let allItems = await performNaverSearch(searchQuery, clientId, clientSecret, 3);

    // 3페이지 검색 후 유효한 유희왕 카드가 4개 미만이면 "유희왕 카드이름"으로 재검색
    if (allItems.length < 4) {
      console.log(
        `[INFO] "${cardName}" 검색에서 유효한 유희왕 카드가 ${allItems.length}개로 부족합니다. 유희왕 "${cardName}"으로 재검색합니다.`
      );
      searchQuery = `유희왕 "${cardName}"`;
      const additionalItems = await performNaverSearch(searchQuery, clientId, clientSecret, 10); // 10페이지까지 재검색
      allItems = [...allItems, ...additionalItems];
    } else if (allItems.length >= 4) {
      // 유효한 카드가 4개 이상이면 나머지 7페이지 추가 검색
      console.log(
        `[INFO] "${cardName}" 검색에서 유효한 유희왕 카드가 ${allItems.length}개 발견. 나머지 7페이지를 추가 검색합니다.`
      );
      const additionalItems = await performNaverSearch(searchQuery, clientId, clientSecret, 10, 4); // 4페이지부터 10페이지까지
      allItems = [...allItems, ...additionalItems];
    }

    return allItems;
  } catch (error) {
    console.error('[ERROR] 네이버 쇼핑 API 검색 오류:', error);
    return [];
  }
};

// 요청 제한이 적용된 함수 생성
const searchNaverShopWithRateLimit = withRateLimit(searchNaverShop, 'naver');

/**
 * 카드 이름으로 검색하여 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
const searchAndSaveCardPricesApi = async (cardName, options = {}) => {
  try {
    const results = await searchNaverShopWithRateLimit(cardName, options);

    let [card] = await Card.findOrCreate({
      where: { name: cardName },
      defaults: { name: cardName },
    });

    if (results.length === 0) {
      return { message: '검색 결과가 없습니다.', card, count: 0 };
    }

    // 기존 가격 정보 삭제
    await CardPrice.destroy({
      where: {
        cardId: card.id,
        site: { [Op.like]: 'Naver%' }, // 네이버 스토어 데이터만 삭제
      },
    });

    if (!card.image && results.length > 0) {
      const itemWithImage = results.find(item => item.image && item.image.trim() !== '');

      if (itemWithImage) {
        await card.update({ image: itemWithImage.image });
        card = await Card.findByPk(card.id);
      }
    }

    const savedPrices = await Promise.all(
      results.map(async item => {
        return CardPrice.create({
          cardId: card.id,
          site: `Naver_${item.site}`,
          price: item.price,
          url: item.url,
          condition: item.condition,
          rarity: item.rarity,
          language: item.language,
          available: item.available,
          cardCode: item.cardCode,
          lastUpdated: new Date(),
          productId: item.productId,
          illustration: item.illustration,
        });
      })
    );

    return {
      card,
      prices: savedPrices,
      count: savedPrices.length,
      rawResults: results, // 원본 네이버 API 결과 (이미지 포함)
    };
  } catch (error) {
    console.error('카드 가격 저장 오류:', error);
    throw error;
  }
};

module.exports = {
  searchNaverShop: searchNaverShopWithRateLimit,
  searchAndSaveCardPricesApi,
};
