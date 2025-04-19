const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite'); // EUC-KR 인코딩 처리를 위해 필요
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode } = require('./crawler');
const { encodeEUCKR, detectLanguageFromCardCode } = require('./tcgshopCrawler');

/**
 * OnlyYugioh에서 카드 가격 정보를 크롤링합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 크롤링된 가격 정보 배열
 */
async function crawlOnlyYugioh(cardName) {
  try {
    // URL 인코딩된 검색어 생성
    const encodedQuery = encodeURIComponent(cardName).replace(/%20/g, '+');
    
    // OnlyYugioh 검색 URL
    const searchUrl = `https://www.onlyyugioh.com/product/search.html?banner_action=&keyword=${encodedQuery}`;
    
    // User-Agent 설정하여 차단 방지
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // 검색 결과 페이지 요청
    const response = await axios.get(searchUrl, { 
      headers, 
      responseType: 'arraybuffer'
    });
    
    // Cheerio로 HTML 파싱
    const $ = cheerio.load(response.data);
    const items = [];
    
    // 검색 결과 개수 추출 시도
    let resultCount = 0;
    const searchResultText = $('.xans-search-total, .xans-element-.xans-search.xans-search-total').text().trim();
    
    const resultMatch = searchResultText.match(/총\s+(\d+)개/);
    if (resultMatch && resultMatch[1]) {
      resultCount = parseInt(resultMatch[1]);
    }
    
    // 여러 가지 선택자 시도
    const productSelectors = [
      'ul.prdList > li',
      'div.xans-element-.xans-search.xans-search-result ul > li',
      '.xans-search-result ul > li',
      '.prdList > li'
    ];
    
    let productElements = [];
    for (const selector of productSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        productElements = elements;
        break;
      }
    }
    
    // 상품 목록 처리 - 각 상품 아이템 확인
    if (productElements.length === 0) {
      return items;
    }
    
    productElements.each((index, element) => {
      // 품절 상품인지 확인
      const productElement = $(element);
      const isSoldOut = productElement.find('img[alt="품절"]').length > 0 ||
                     productElement.text().includes('품절');
      
      if (isSoldOut) {
        return; // 품절 상품은 처리하지 않음
      }
      
      // 상품명 및 링크 - 여러 선택자 시도
      let title = '';
      let titleElement;
      
      // 여러 선택자 시도
      const titleSelectors = [
        'strong.name a span:not(.title)',
        'strong.name a',
        '.name a',
        '.prdName a'
      ];
      
      for (const selector of titleSelectors) {
        titleElement = productElement.find(selector);
        if (titleElement.length > 0) {
          title = titleElement.text().trim();
          if (title) {
            break;
          }
        }
      }
      
      // 상품명에서 "상품명" 텍스트 제거 - 보다 확실하게 제거
      title = title.replace(/^상품명/, '').trim();
      
      // 제목에 카드명이 포함되어 있는지 확인 - 특수문자와 띄어쓰기를 제외하고 비교하도록 수정
      const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
      const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
      
      if (!title || !cleanTitle.includes(cleanCardName)) {
        return;
      }
      
      // 상품 URL 추출
      let detailUrl = '';
      const detailUrlElement = productElement.find('strong.name a, .name a');
      if (detailUrlElement.length > 0) {
        detailUrl = detailUrlElement.attr('href');
      }
      
      const fullUrl = detailUrl && detailUrl.startsWith('http') 
        ? detailUrl 
        : `https://www.onlyyugioh.com${detailUrl}`;
      
      // 가격 정보 추출 - 여러 선택자 시도
      let price = 0;
      const priceSelectors = [
        'ul.spec li:contains("판매가") span:last-child',
        'li:contains("판매가") span',
        '.price',
        'span:contains("원")'
      ];
      
      for (const selector of priceSelectors) {
        const priceElement = productElement.find(selector);
        if (priceElement.length > 0) {
          const rawPriceText = priceElement.text().trim();
          
          const priceText = rawPriceText.replace(/[^0-9]/g, '');
          if (priceText) {
            // 모든 가격에서 앞의 두 자리 제거
            let parsedPrice;
            if (priceText.length > 2) {
              const correctedPrice = priceText.substring(2);
              parsedPrice = parseInt(correctedPrice);
            } else {
              parsedPrice = parseInt(priceText);
            }
            price = parsedPrice;
            break;
          }
        }
      }
      
      // 상품 요약 정보에서 카드 코드, 레어도 등 추출
      let description = '';
      const descriptionSelectors = [
        'ul.spec li:first-child span[style*="color:#0f53ff"]',
        'ul.spec li span[style*="color:#0f53ff"]',
        '.description',
        'li:contains("상품요약정보")'
      ];
      
      for (const selector of descriptionSelectors) {
        const descriptionElement = productElement.find(selector);
        if (descriptionElement.length > 0) {
          description = descriptionElement.text().trim();
          if (description) {
            break;
          }
        }
      }
      
      // 설명에서 "상품요약정보" 텍스트 제거
      description = description.replace(/^상품요약정보/, '').trim();
      
      // 카드 코드 추출
      let extractedCardCode = null;
      const codeMatch = description.match(/([A-Z]+-[A-Z]+\d+)/);
      if (codeMatch && codeMatch[1]) {
        extractedCardCode = codeMatch[1];
      } else {
        const codeMatch2 = title.match(/([A-Z]+-[A-Z]+\d+)/);
        if (codeMatch2 && codeMatch2[1]) {
          extractedCardCode = codeMatch2[1];
        }
      }
      
      // 레어도 정보 추출
      let rarity = '알 수 없음';
      let rarityCode = 'UNK';
      
      // 제목과 설명에서 레어도 관련 단어 찾기
      const fullText = title + ' ' + description;
      
      // crawler의 parseRarity 함수를 사용하여 레어도 파싱
      const rarityInfo = parseRarity(fullText);
      rarity = rarityInfo.rarity;
      rarityCode = rarityInfo.rarityCode;
      
      // 언어 정보 추출
      let language = '알 수 없음';
      if (extractedCardCode) {
        language = detectLanguageFromCardCode(extractedCardCode);
      }
      
      if (language === '알 수 없음') {
        if (fullText.includes('한글') || fullText.includes('한국어')) {
          language = '한글판';
        } else if (fullText.includes('일본') || fullText.includes('일본어')) {
          language = '일본판';
        } else if (fullText.includes('영문') || fullText.includes('영어')) {
          language = '영문판';
        }
      }
      
      // 상태 정보 (노멀, 데미지 등)
      const condition = parseCondition(fullText);
      
      // 검색 결과 추가
      items.push({
        title,
        url: fullUrl,
        condition,
        rarity,
        rarityCode,
        language,
        cardCode: extractedCardCode,
        price,
        site: 'OnlyYugioh',
        available: true // 품절 상품은 위에서 필터링되었으므로 항상 true
      });
    });
    
    return items;
  } catch (error) {
    console.error('[ERROR] OnlyYugioh 크롤링 오류:', error);
    return [];
  }
}

/**
 * 카드 이름으로 검색하여 OnlyYugioh 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @param {number} cardId - 카드 ID
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveOnlyYugiohPrices(cardName, cardId) {
  try {
    // OnlyYugioh 크롤링
    const priceData = await crawlOnlyYugioh(cardName);
    
    if (priceData.length === 0) {
      return { 
        message: 'OnlyYugioh에서 검색 결과가 없습니다.', 
        cardId: cardId, 
        count: 0 
      };
    }
    
    // 모델 불러오기
    const { CardPrice } = require('../models/Card');
    
    // 기존 OnlyYugioh 가격 정보 삭제 (최신 정보로 갱신)
    if (cardId) {
      await CardPrice.destroy({
        where: { 
          cardId: cardId,
          site: 'OnlyYugioh'
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
            site: 'OnlyYugioh',
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
      message: `OnlyYugioh에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: priceData.length,
      prices: cardId ? prices : priceData
    };
  } catch (error) {
    console.error('[ERROR] OnlyYugioh 가격 검색 및 저장 오류:', error);
    return { 
      message: `OnlyYugioh 가격 검색 중 오류 발생: ${error.message}`,
      cardId: cardId,
      count: 0,
      error: error.message
    };
  }
}

module.exports = {
  crawlOnlyYugioh,
  searchAndSaveOnlyYugiohPrices
}; 