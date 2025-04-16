const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite'); // EUC-KR 인코딩 처리를 위해 필요
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode } = require('./naverCrawler');

/**
 * 카드 이름을 EUC-KR로 인코딩합니다 (TCGShop은 EUC-KR 인코딩 사용)
 * @param {string} cardName - 검색할 카드 이름
 * @returns {string} - EUC-KR로 인코딩된 문자열(hex 형태)
 */
function encodeEUCKR(cardName) {
  try {
    // 띄어쓰기를 먼저 +로 대체
    const nameWithPlus = cardName.replace(/\s+/g, '+');
    
    // EUC-KR로 인코딩된 바이트 배열을 생성 (띄어쓰기가 이미 +로 대체됨)
    const encodedBuffer = iconv.encode(nameWithPlus.replace(/\+/g, ' '), 'euc-kr');
    
    // 각 바이트를 16진수로 변환하여 문자열로 만듦
    let encodedString = '';
    for (let i = 0; i < encodedBuffer.length; i++) {
      encodedString += '%' + encodedBuffer[i].toString(16).toUpperCase();
    }
    
    // 원래 있던 + 기호를 유지
    return encodedString.replace(/%2B/g, '+');
  } catch (error) {
    console.error('[ERROR] EUC-KR 인코딩 오류:', error);
    // 인코딩 실패 시 원본 문자열을 그대로 반환하되 띄어쓰기를 +로 변환
    return encodeURIComponent(cardName).replace(/%20/g, '+');
  }
}

/**
 * 카드 코드에서 언어 정보를 추출합니다.
 * @param {string} cardCode - 카드 코드 (예: ROTA-KR024)
 * @returns {string} - 언어 정보 (한글판, 일본판, 영문판)
 */
function detectLanguageFromCardCode(cardCode) {
  if (!cardCode) return '알 수 없음';
  
  // 카드 코드에서 언어 코드 추출 (두 글자만 확인)
  if (cardCode.includes('KR')) return '한글판';
  if (cardCode.includes('JP')) return '일본판';
  if (cardCode.includes('EN')) return '영문판';
  
  return '알 수 없음';
}

/**
 * TCGShop에서 카드 가격 정보를 크롤링합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 크롤링된 가격 정보 배열
 */
async function crawlTCGShop(cardName) {
  try {
    // EUC-KR로 인코딩된 검색어 생성
    const encodedQuery = encodeEUCKR(cardName);
    
    // 직접 검색 URL
    const searchUrl = `http://www.tcgshop.co.kr/search_result.php?search=meta_str&searchstring=${encodedQuery.replace(/%20/g, '+')}`;
    
    // User-Agent 설정하여 차단 방지
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // 검색 결과 페이지 요청
    const response = await axios.get(searchUrl, { 
      headers, 
      responseType: 'arraybuffer' 
    });
    
    // 응답 디코딩
    const html = iconv.decode(response.data, 'euc-kr');
    
    // Cheerio로 HTML 파싱
    const $ = cheerio.load(html);
    const items = [];
    
    // 검색 결과 개수 확인
    const resultCountText = $('font.nom_id').text();
    const resultCountMatch = resultCountText.match(/\d+/);
    const resultCount = resultCountMatch ? parseInt(resultCountMatch[0]) : 0;
    
    // 직접 검색 결과 처리
    // TCGShop 검색 결과는 td.glist_01 요소로 시작하는 테이블 구조
    const productCells = $('td.glist_01');
    
    productCells.each((index, element) => {
      const productCell = $(element);
      const productLink = productCell.find('a[href*="goods_detail.php"]');
      
      if (!productLink.length) return;
      
      const title = productLink.text().trim();
      
      // 제목에 카드명이 포함되어 있는지 확인 - 특수문자와 띄어쓰기를 제외하고 비교하도록 수정
      const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
      const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
      
      if (!title || !cleanTitle.includes(cleanCardName)) return;
      
      // 상품 URL
      const detailUrl = productLink.attr('href');
      const fullUrl = detailUrl && detailUrl.startsWith('http') 
        ? detailUrl 
        : `http://www.tcgshop.co.kr/${detailUrl}`;
      
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
      
      // 레어도 정보 (코드 다음 행에 있음)
      let rarityRow = codeRow.next();
      const rarityElement = rarityRow.find('.glist_03');
      let rarity = '알 수 없음';
      let rarityCode = 'UNK';
      
      if (rarityElement.length) {
        const rarityText = rarityElement.first().text().trim();
        if (rarityText) {
          // rarityUtil의 parseRarity 함수를 사용하여 레어도 표준화
          const rarityInfo = parseRarity(rarityText);
          rarity = rarityInfo.rarity;
          rarityCode = rarityInfo.rarityCode;
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
      
      // 상태 정보 (노멀, 데미지 등)
      let language = parseLanguage(title);
      const condition = parseCondition(title);
      
      // 언어 정보가 제목에서 추출되지 않았다면 카드 코드에서 추출 시도
      if (language === '알 수 없음' && extractedCardCode) {
        language = detectLanguageFromCardCode(extractedCardCode);
      }
      
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
      
      items.push({
        title,
        url: fullUrl,
        condition,
        rarity,
        rarityCode,
        language,
        cardCode: extractedCardCode,
        price,
        site: 'TCGShop',
        available
      });
    });
    
    return items;
  } catch (error) {
    console.error('[ERROR] TCGShop 크롤링 오류:', error);
    return [];
  }
}

/**
 * 카드 이름으로 검색하여 TCGShop 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveTCGShopPrices(cardName, cardId) {
  try {
    // TCGShop 크롤링
    const priceData = await crawlTCGShop(cardName);
    
    if (priceData.length === 0) {
      return { 
        message: 'TCGShop에서 검색 결과가 없습니다.', 
        cardId: cardId, 
        count: 0 
      };
    }
    
    // 모델 불러오기
    const { CardPrice } = require('../models/Card');
    
    // 기존 TCGShop 가격 정보 삭제 (최신 정보로 갱신)
    if (cardId) {
      await CardPrice.destroy({
        where: { 
          cardId: cardId,
          site: 'TCGShop'
        }
      });
    }
    
    // 가격 정보 저장을 위한 배열
    const prices = [];
    
    // 새 가격 정보 저장
    if (cardId) {
      const savedPrices = await Promise.all(
        priceData.map(async (item) => {
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
            lastUpdated: new Date()
          });
          
          prices.push(savedPrice);
          return savedPrice;
        })
      );
    }
    
    return { 
      message: `TCGShop에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: priceData.length,
      prices: cardId ? prices : priceData
    };
  } catch (error) {
    console.error('[ERROR] TCGShop 가격 검색 및 저장 오류:', error);
    return { 
      message: `TCGShop 가격 검색 중 오류 발생: ${error.message}`,
      cardId: cardId,
      count: 0,
      error: error.message
    };
  }
}

module.exports = {
  crawlTCGShop,
  searchAndSaveTCGShopPrices,
  encodeEUCKR,
  detectLanguageFromCardCode
}; 