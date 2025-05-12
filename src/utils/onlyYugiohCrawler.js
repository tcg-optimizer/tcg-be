const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite'); // EUC-KR 인코딩 처리를 위해 필요
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode } = require('./crawler');
const { encodeEUCKR, detectLanguageFromCardCode } = require('./tcgshopCrawler');
const { Card, CardPrice } = require('../models/Card');
const { withRateLimit } = require('./rateLimiter');

/**
 * OnlyYugioh에서 일관된 상품 ID를 생성합니다.
 * 상품 ID에 'onlyyugioh-' 접두어를 붙여 다른 사이트와 구분합니다.
 * @param {string} url - 상품 URL
 * @param {string} existingId - 기존 상품 ID (있는 경우)
 * @returns {string} 일관된 상품 ID 
 */
const generateOnlyYugiohProductId = (url, existingId = null) => {
  // 이미 접두어가 있는 경우 그대로 반환
  if (existingId && existingId.startsWith('onlyyugioh-')) {
    return existingId;
  }
  
  // 기존 ID가 있는 경우 접두어 추가
  if (existingId) {
    return `onlyyugioh-${existingId}`;
  }
  
  // URL에서 상품 ID 추출
  if (url) {
    // product/12345 형식 추출 시도
    const productIdMatch = url.match(/product\/(\d+)/);
    if (productIdMatch && productIdMatch[1]) {
      return `onlyyugioh-${productIdMatch[1]}`;
    }
    
    // product_no=12345 형식 추출 시도
    const productNoMatch = url.match(/product_no=(\d+)/);
    if (productNoMatch && productNoMatch[1]) {
      return `onlyyugioh-${productNoMatch[1]}`;
    }
  }
  
  // URL 해시 생성
  const urlHash = (url || '').split('').reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0) | 0;
  }, 0);
  
  return `onlyyugioh-${Math.abs(urlHash) || Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
};

/**
 * OnlyYugioh에서 카드 가격 정보를 크롤링합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @param {string} [cardId] - 카드 ID (선택적)
 * @returns {Promise<Array>} - 크롤링된 가격 정보 배열
 */
const crawlOnlyYugioh = async (cardName, cardId) => {
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
      
      // 일관된 상품 ID 생성
      const productId = generateOnlyYugiohProductId(fullUrl);
      
      // 가격 정보 추출 - HTML 예시에 직접 맞춰서 구현
      let price = 0;
      
      try {
        console.log(`[OnlyYugioh Debug] 상품 이름: ${title}`);
        
        
        // 명확한 선택자로 판매가 포함된 li 요소 선택
        const specList = productElement.find('ul.xans-element-.xans-search-listitem.spec');
        
        if (specList.length > 0) {
          console.log('[OnlyYugioh Debug] spec 리스트 찾음');
          
          // 판매가가 포함된 li 요소 찾기
          const priceLi = specList.find('li:contains("판매가")');
          
          if (priceLi.length > 0) {
            console.log(`[OnlyYugioh Debug] 판매가 li HTML: ${priceLi.html()}`);
            
            // 문자열에서 원본 HTML을 직접 분석하여 가격 찾기
            const html = priceLi.html();
            // 판매가 다음의 마지막 span 태그 내용을 추출
            const priceMatch = html.match(/<\/strong>\s*<span[^>]*>([^<]+)<\/span>/i);
            
            if (priceMatch && priceMatch[1]) {
              const rawPriceText = priceMatch[1].trim();
              console.log(`[OnlyYugioh Debug] 정규식으로 추출한 가격 텍스트: '${rawPriceText}'`);
              
              // 숫자만 추출 (쉼표와 '원' 제거)
              const priceText = rawPriceText.replace(/[^\d]/g, '');
              console.log(`[OnlyYugioh Debug] 숫자만 추출: '${priceText}'`);
              
              if (priceText) {
                price = parseInt(priceText, 10);
                console.log(`[OnlyYugioh Debug] 최종 가격: ${price}`);
              }
            } else {
              // 두 번째 방법: 모든 span 중 원을 포함한 span 찾기
              const priceSpans = priceLi.find('span');
              priceSpans.each(function(i, elem) {
                const spanText = $(elem).text().trim();
                if (spanText.includes('원')) {
                  console.log(`[OnlyYugioh Debug] 원을 포함한 span 텍스트: '${spanText}'`);
                  const priceText = spanText.replace(/[^\d]/g, '');
                  if (priceText) {
                    price = parseInt(priceText, 10);
                    console.log(`[OnlyYugioh Debug] 최종 가격: ${price}`);
                    return false; // each 루프 종료
                  }
                }
              });
            }
          } else {
            console.log('[OnlyYugioh Debug] 판매가 li를 찾을 수 없음');
          }
        } else {
          console.log('[OnlyYugioh Debug] spec 리스트를 찾을 수 없음');
        }
        
        // 대체 방법: 판매가가 포함된 어떤 li든 찾아서 처리
        if (price === 0) {
          console.log('[OnlyYugioh Debug] 대체 방법 시도');
          const anyPriceLi = productElement.find('li:contains("판매가")');
          if (anyPriceLi.length > 0) {
            const allText = anyPriceLi.text().trim();
            console.log(`[OnlyYugioh Debug] 판매가 li 전체 텍스트: '${allText}'`);
            
            // "판매가" 이후의, "원"을 포함한 부분 추출 시도
            const priceMatch = allText.match(/판매가[^0-9]*([0-9,]+원)/);
            if (priceMatch && priceMatch[1]) {
              const rawPrice = priceMatch[1];
              console.log(`[OnlyYugioh Debug] 정규식으로 추출한 가격: '${rawPrice}'`);
              const priceNum = rawPrice.replace(/[^\d]/g, '');
              if (priceNum) {
                price = parseInt(priceNum, 10);
                console.log(`[OnlyYugioh Debug] 대체 방법으로 파싱한 최종 가격: ${price}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[OnlyYugioh Error] 가격 파싱 중 오류: ${error.message}`);
      }
      
      // 가격이 0인 경우 로그 출력
      if (price === 0) {
        console.log(`[OnlyYugioh Warning] 가격이 0원으로 감지되었습니다. 상품명: ${title}`);
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
        available: true, // 품절 상품은 위에서 필터링되었으므로 항상 true
        cardId,
        productId
      });
    });
    
    return items;
  } catch (error) {
    console.error('[ERROR] OnlyYugioh 크롤링 오류:', error);
    return [];
  }
};

// 요청 제한이 적용된 함수 생성
const crawlOnlyYugiohWithRateLimit = withRateLimit(crawlOnlyYugioh, 'onlyyugioh');

/**
 * 카드 이름으로 검색하여 OnlyYugioh 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @param {number} cardId - 카드 ID
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
const searchAndSaveOnlyYugiohPrices = async (cardName, cardId = null) => {
  try {
    console.log(`[INFO] OnlyYugioh에서 "${cardName}" 검색 시작`);
    
    // 요청 제한이 적용된 함수 호출
    const results = await crawlOnlyYugiohWithRateLimit(cardName, cardId);
    
    if (results.length === 0) {
      return { 
        message: 'OnlyYugioh에서 검색 결과가 없습니다.', 
        cardId: cardId, 
        count: 0 
      };
    }
    
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
        results.map(async (item) => {
          // 일관된 ID 생성
          const consistentProductId = generateOnlyYugiohProductId(item.url, item.productId);
          
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
            lastUpdated: new Date(),
            productId: consistentProductId
          });
          
          // product 객체에 id 필드 추가
          const productWithId = {
            id: consistentProductId,
            url: item.url,
            site: 'OnlyYugioh',
            price: item.price,
            available: item.available,
            cardCode: item.cardCode,
            condition: item.condition,
            language: item.language,
            rarity: item.rarity
          };
          
          // savedPrice에 product 필드 추가
          savedPrice.dataValues.product = productWithId;
          
          prices.push(savedPrice);
          return savedPrice;
        })
      );
    }
    
    return { 
      message: `OnlyYugioh에서 ${results.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: results.length,
      prices: cardId ? prices : results.map(item => {
        // 일관된 ID 생성
        const consistentProductId = generateOnlyYugiohProductId(item.url, item.productId);
        
        // 직접 product 객체 생성하여 반환
        return {
          ...item,
          productId: consistentProductId, // 기존 productId 갱신
          product: {
            id: consistentProductId,
            url: item.url,
            site: 'OnlyYugioh',
            price: item.price,
            available: item.available,
            cardCode: item.cardCode,
            condition: item.condition,
            language: item.language,
            rarity: item.rarity
          }
        };
      })
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
};

module.exports = {
  crawlOnlyYugioh: crawlOnlyYugiohWithRateLimit,
  searchAndSaveOnlyYugiohPrices
}; 