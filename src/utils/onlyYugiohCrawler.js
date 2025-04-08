const axios = require('axios');
const cheerio = require('cheerio');
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode } = require('./naverCrawler');
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
    
    console.log(`[DEBUG] OnlyYugioh 검색 URL: ${searchUrl}`);
    
    // User-Agent 설정하여 차단 방지
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // 검색 결과 페이지 요청
    const response = await axios.get(searchUrl, { headers });
    
    console.log(`[DEBUG] OnlyYugioh 응답 수신 (총 길이: ${response.data.length})`);
    
    // Cheerio로 HTML 파싱
    const $ = cheerio.load(response.data);
    const items = [];
    
    // 디버깅을 위해 HTML 구조의 일부를 출력
    console.log('[DEBUG] HTML 구조 확인:');
    console.log(`검색 결과 헤더: ${$('.xans-element-.xans-search.xans-search-title').text().trim()}`);
    console.log(`상품 목록 ul 태그 수: ${$('ul.prdList').length}`);
    console.log(`상품 li 태그 수: ${$('ul.prdList li').length}`);
    
    // 검색 결과 개수 추출 시도
    let resultCount = 0;
    const searchResultText = $('.xans-search-total, .xans-element-.xans-search.xans-search-total').text().trim();
    console.log(`[DEBUG] 검색 결과 텍스트: ${searchResultText}`);
    
    const resultMatch = searchResultText.match(/총\s+(\d+)개/);
    if (resultMatch && resultMatch[1]) {
      resultCount = parseInt(resultMatch[1]);
    }
    
    console.log(`[DEBUG] OnlyYugioh 검색 결과 수: ${resultCount}개`);
    
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
      console.log(`[DEBUG] 선택자 '${selector}'로 찾은 요소 수: ${elements.length}`);
      if (elements.length > 0) {
        productElements = elements;
        console.log(`[DEBUG] 선택자 '${selector}'를 사용합니다.`);
        break;
      }
    }
    
    // 상품 목록 처리 - 각 상품 아이템 확인
    if (productElements.length === 0) {
      console.log('[DEBUG] 상품 목록을 찾을 수 없습니다.');
      return items;
    }
    
    // 상품 목록이 배열이 아닌 체인트 객체인 경우 each 메서드로 처리
    if (typeof productElements.each === 'function') {
      productElements.each((index, element) => {
        processProductElement($(element), cardName, items, $);
      });
    } else if (Array.isArray(productElements)) {
      // 배열인 경우 forEach로 처리
      productElements.forEach(element => {
        processProductElement($(element), cardName, items, $);
      });
    }
    
    console.log(`[DEBUG] OnlyYugioh 검색 결과: ${items.length}개 상품 발견 (품절 상품 제외)`);
    
    return items;
  } catch (error) {
    console.error('[ERROR] OnlyYugioh 크롤링 오류:', error);
    return [];
  }
}

/**
 * 상품 요소를 처리하는 헬퍼 함수
 * @param {Object} el - Cheerio 요소
 * @param {string} cardName - 카드 이름
 * @param {Array} items - 결과 배열
 * @param {Object} $ - Cheerio 객체
 */
function processProductElement(el, cardName, items, $) {
  // 디버깅을 위해 각 상품 요소의 HTML 구조 확인
  console.log(`[DEBUG] 상품 HTML 구조:`);
  console.log(`- 상품명 요소: ${el.find('strong.name, .name').length > 0 ? '있음' : '없음'}`);
  console.log(`- 가격 요소: ${el.find('li:contains("판매가")').length > 0 ? '있음' : '없음'}`);
  
  // 품절 상품인지 확인
  const isSoldOut = el.find('img[alt="품절"]').length > 0 ||
                   el.text().includes('품절');
  
  if (isSoldOut) {
    console.log('[DEBUG] 품절 상품 무시');
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
    titleElement = el.find(selector);
    if (titleElement.length > 0) {
      title = titleElement.text().trim();
      if (title) {
        console.log(`[DEBUG] 선택자 '${selector}'로 상품명 찾음: ${title}`);
        break;
      }
    }
  }
  
  // 상품명에서 "상품명" 텍스트 제거 - 보다 확실하게 제거
  title = title.replace(/^상품명/, '').trim();
  
  // 카드 이름이 포함된 상품만 처리
  if (!title || !title.toLowerCase().includes(cardName.toLowerCase())) {
    return;
  }
  
  console.log(`[DEBUG] OnlyYugioh 상품 발견: ${title}`);
  
  // 상품 URL 추출
  let detailUrl = '';
  const detailUrlElement = el.find('strong.name a, .name a');
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
    const priceElement = el.find(selector);
    if (priceElement.length > 0) {
      // 원본 가격 텍스트를 로깅
      const rawPriceText = priceElement.text().trim();
      console.log(`[DEBUG] 원본 가격 텍스트: "${rawPriceText}"`);
      
      const priceText = rawPriceText.replace(/[^0-9]/g, '');
      if (priceText) {
        // 모든 가격에서 앞의 두 자리 제거
        let parsedPrice;
        if (priceText.length > 2) {
          const correctedPrice = priceText.substring(2);
          parsedPrice = parseInt(correctedPrice);
          console.log(`[DEBUG] 가격 수정: ${priceText} -> ${correctedPrice} (앞 두 자리 제거)`);
        } else {
          parsedPrice = parseInt(priceText);
        }
        price = parsedPrice;
        console.log(`[DEBUG] 선택자 '${selector}'로 가격 찾음: ${price}원`);
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
    const descriptionElement = el.find(selector);
    if (descriptionElement.length > 0) {
      description = descriptionElement.text().trim();
      if (description) {
        console.log(`[DEBUG] 선택자 '${selector}'로 상품 설명 찾음: ${description}`);
        break;
      }
    }
  }
  
  // 설명에서 "상품요약정보" 텍스트 제거
  description = description.replace(/^상품요약정보/, '').trim();
  
  // 카드 코드 추출
  let cardCode = null;
  const codeMatch = description.match(/([A-Z]+-[A-Z]+\d+)/);
  if (codeMatch && codeMatch[1]) {
    cardCode = codeMatch[1];
  } else {
    const codeMatch2 = title.match(/([A-Z]+-[A-Z]+\d+)/);
    if (codeMatch2 && codeMatch2[1]) {
      cardCode = codeMatch2[1];
    }
  }
  
  // 레어도 정보 추출
  let rarity = '알 수 없음';
  let rarityCode = 'UNK';
  
  // 제목과 설명에서 레어도 관련 단어 찾기
  const fullText = title + ' ' + description;
  
  // naverCrawler의 parseRarity 함수를 사용하여 레어도 파싱
  const rarityInfo = parseRarity(fullText);
  rarity = rarityInfo.rarity;
  rarityCode = rarityInfo.rarityCode;
  
  // 언어 정보 추출
  let language = '알 수 없음';
  if (cardCode) {
    language = detectLanguageFromCardCode(cardCode);
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
    cardCode,
    price,
    site: 'OnlyYugioh',
    available: true // 품절 상품은 위에서 필터링되었으므로 항상 true
  });
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