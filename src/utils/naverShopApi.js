const axios = require('axios');
const { Card, CardPrice } = require('../models/Card');
const { Op } = require('sequelize');
// rarityUtil.js에서 레어도 파싱 함수를 가져옵니다
const { parseRarity } = require('./rarityUtil');
// crawler.js에서 나머지 파싱 함수들을 가져옵니다
const { parseLanguage, parseCondition, extractCardCode} = require('./crawler');

/**
 * 상품명에서 직접 언어 정보를 추출합니다. 이 함수는 기존 parseLanguage보다 더 엄격한 매칭을 사용합니다.
 * @param {string} title - 상품 제목
 * @returns {string|null} - 추출된 언어 정보 또는 null (매칭되지 않을 경우)
 */
function extractLanguageFromTitle(title) {
  if (!title) return null;
  
  // 명확한 언어 표현을 정규식으로 찾기
  if (/(한글판|한국어판)/.test(title)) return '한글판';
  if (/(일본판|일어판|일본어판|일판)/.test(title)) return '일본판';
  if (/(영문판|영어판|영판)/.test(title)) return '영문판';
  
  return null; // 명확한 표현이 없으면 null 반환
}

/**
 * 카드 코드에서 언어 정보를 추출합니다.
 * @param {string} cardCode - 카드 코드 (예: ROTA-KR024)
 * @returns {string} - 언어 정보 (한글판, 일본판, 영문판)
 */
function detectLanguageFromCardCode(cardCode) {
  if (!cardCode) return '알 수 없음';
  
  // 카드 코드에서 하이픈(-) 뒤의 국가 코드 두 글자만 추출
  const match = cardCode.match(/-([A-Z]{2})/);
  if (match && match[1]) {
    const countryCode = match[1];
    if (countryCode === 'KR') return '한글판';
    if (countryCode === 'JP') return '일본판';
    if (countryCode === 'EN') return '영문판';
  }
  
  return '알 수 없음';
}

/**
 * 지정된 시간(ms) 동안 실행을 지연시키는 함수
 * @param {number} ms - 지연 시간 (밀리초)
 * @returns {Promise} - 지정된 시간 후 해결되는 Promise
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 네이버 쇼핑 검색 API를 사용하여 카드 가격 정보를 가져옵니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 검색된 상품 정보 배열
 */
async function searchNaverShop(cardName) {
  try {
    // 네이버 API 키 설정 (환경 변수에서 가져옴)
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('네이버 API 인증 정보가 설정되지 않았습니다.');
    }
    
    // 검색 파라미터 설정
    const query = encodeURIComponent(cardName);
    const display = 100; // 검색 결과 개수 (최대 100)
    const sort = 'sim'; // 정렬 (sim: 정확도순, date: 날짜순, asc: 가격오름차순, dsc: 가격내림차순)
    
    // API 요청 헤더
    const headers = {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    };
    
    let allItems = [];
    let start = 1;
    let hasMoreItems = true;
    const maxItems = 1000; // 최적화: 최대 200개로 제한하여 검색 속도 향상
    let retryCount = 0;
    const maxRetries = 3;
    
    while (hasMoreItems && allItems.length < maxItems) {
      // API 요청 URL
      const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${query}&display=${display}&start=${start}&sort=${sort}`;
      
      try {
        // API 요청 전 지연 시간
        await delay(100);
        
        // API 요청 - 타임아웃 5초 설정
        const response = await axios.get(apiUrl, { 
          headers, 
          timeout: 5000 
        });
        
        // 결과 파싱
        const items = response.data.items.map(item => {
          const title = item.title.replace(/<b>|<\/b>/g, ''); // HTML 태그 제거
          
          // 레어도, 언어, 상태 정보 파싱
          const rarityInfo = parseRarity(title);
          const condition = parseCondition(title);
          const cardCode = extractCardCode(title);
          
          // 언어 정보 추출 (우선순위: 직접 상품명 > crawler.js의 parseLanguage > 카드코드)
          let language;
          
          // 1. 상품명에서 직접 추출 시도 (최우선)
          const titleLanguage = extractLanguageFromTitle(title);
          if (titleLanguage) {
            language = titleLanguage;
          } else {
            // 2. crawler.js의 parseLanguage 사용
            language = parseLanguage(title);
            
            // 3. 여전히 알 수 없는 경우 카드코드에서 추출 시도
            if (language === '알 수 없음' && cardCode && cardCode.fullCode) {
              language = detectLanguageFromCardCode(cardCode.fullCode);
            }
          }
          
          return {
            title: title,
            price: parseInt(item.lprice), // 최저가
            site: item.mallName,
            url: item.link,
            productId: item.productId,
            image: item.image, // 이미지 URL 추가
            condition: condition,
            rarity: rarityInfo.rarity,
            rarityCode: rarityInfo.rarityCode,
            language: language,
            cardCode: cardCode ? cardCode.fullCode : null,
            available: true,
            brand: item.brand,
            category: item.category1
          };
        });
        
        // 언어가 '알 수 없음'인 상품을 필터링
        const filteredItems = items.filter(item => item.language !== '알 수 없음' && item.rarity !== '알 수 없음');
        
        // 충분한 결과를 찾았거나 필터링으로 인해 모든 결과가 제외된 경우
        if (filteredItems.length === 0 && items.length > 0) {
          console.log('[INFO] 모든 아이템이 필터링되었습니다. 다음 페이지로 이동합니다.');
          start += display;
          continue;
        }
        
        allItems = [...allItems, ...filteredItems];
        retryCount = 0; // 성공하면 재시도 카운트 초기화
        
        // 100개 미만의 결과를 받았거나 최대 개수에 도달했다면 더 이상 요청하지 않음
        if (items.length < display) {
          hasMoreItems = false;
        } else {
          start += display; // 다음 페이지로 이동
        }
      } catch (error) {
        // 429 에러(너무 많은 요청)가 발생한 경우 더 오래 대기한 후 재시도
        if (error.response && error.response.status === 429) {
          console.log('[WARN] 네이버 API 요청 한도 초과. 2초 대기 후 재시도합니다.');
          await delay(2000);
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          // 소켓 오류나 타임아웃 처리
          retryCount++;
          if (retryCount <= maxRetries) {
            console.log(`[WARN] 네이버 API 연결 오류(${error.code}). ${retryCount}/${maxRetries} 재시도 중...`);
            await delay(2000 * retryCount); // 재시도마다 대기 시간 증가
            continue; // 현재 시도 건너뛰기
          } else {
            console.log('[WARN] 네이버 API 연결 오류. 최대 재시도 횟수 초과, 검색 종료.');
            break; // 최대 재시도 횟수 초과하면 루프 종료
          }
        } else {
          // 다른 오류는 로그만 남기고 검색 종료
          console.error(`[ERROR] 네이버 API 오류: ${error.message}`);
          break;
        }
      }
    }
    
    return allItems;
  } catch (error) {
    console.error('[ERROR] 네이버 쇼핑 API 검색 오류:', error);
    return [];
  }
}

/**
 * 카드 이름으로 검색하여 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveCardPricesApi(cardName) {
  try {
    // 카드 찾기 또는 생성
    let [card, created] = await Card.findOrCreate({
      where: { name: cardName },
      defaults: { name: cardName }
    });
    
    // 네이버 쇼핑 API 검색
    const priceData = await searchNaverShop(cardName);
    
    // 검색 결과가 없는 경우
    if (priceData.length === 0) {
      return { message: '검색 결과가 없습니다.', card, count: 0 };
    }
    
    // 기존 가격 정보 삭제 (최신 정보로 갱신)
    await CardPrice.destroy({
      where: { 
        cardId: card.id,
        site: { [Op.like]: 'Naver%' } // 네이버 스토어 데이터만 삭제
      }
    });
    
    // 대표 이미지가 없는 경우에만 카드 이미지 업데이트
    if (!card.image && priceData.length > 0) {
      // 이미지가 있는 첫 번째 상품 찾기
      const itemWithImage = priceData.find(item => item.image && item.image.trim() !== '');
      
      if (itemWithImage) {
        await card.update({ image: itemWithImage.image });
        // 업데이트된 카드 정보 다시 로드
        card = await Card.findByPk(card.id);
      }
    }
    
    // 새 가격 정보 저장
    const savedPrices = await Promise.all(
      priceData.map(async (item) => {
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
          lastUpdated: new Date()
        });
      })
    );
    
    // 레어도 정보가 있는 상품이 있으면 카드의 기본 레어도 정보도 업데이트
    const rarityItems = priceData.filter(item => item.rarity !== '알 수 없음');
    if (rarityItems.length > 0) {
      // 가장 많이 파싱된 레어도 선택
      const rarityCount = {};
      rarityItems.forEach(item => {
        if (!rarityCount[item.rarity]) rarityCount[item.rarity] = 0;
        rarityCount[item.rarity]++;
      });
      
      const mostCommonRarity = Object.keys(rarityCount).reduce((a, b) => 
        rarityCount[a] > rarityCount[b] ? a : b
      );
      
      const rarityCode = rarityItems.find(item => item.rarity === mostCommonRarity).rarityCode;
      
      // 카드 정보 업데이트
      await card.update({
        rarity: mostCommonRarity,
        rarityCode: rarityCode
      });
      
      // 업데이트된 카드 정보 다시 로드
      card = await Card.findByPk(card.id);
    }
    
    return {
      card,
      prices: savedPrices,
      count: savedPrices.length
    };
  } catch (error) {
    console.error('카드 가격 저장 오류:', error);
    throw error;
  }
}

module.exports = {
  searchNaverShop,
  searchAndSaveCardPricesApi,
  detectLanguageFromCardCode,
  extractLanguageFromTitle
}; 