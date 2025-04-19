const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite'); // EUC-KR 인코딩 처리를 위해 필요
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, extractCardCode } = require('./crawler');
const { encodeEUCKR, detectLanguageFromCardCode } = require('./tcgshopCrawler');

/**
 * CardDC에서 카드 가격 정보를 크롤링합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 크롤링된 가격 정보 배열
 */
async function crawlCardDC(cardName) {
  try {
    // EUC-KR로 인코딩된 검색어 생성
    const encodedQuery = encodeEUCKR(cardName);
    
    // CardDC 검색 URL
    const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;
    
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
    
    // 검색 결과 개수 추출
    const resultCountText = $('body').text().match(/총 (\d+)개의 상품이 있습니다/);
    const resultCount = resultCountText ? parseInt(resultCountText[1]) : 0;
    
    // 상품 목록 처리 - 테이블 내의 모든 tr 요소 확인
    $('table tr').each((index, row) => {
      const cells = $(row).find('td');
      
      // 각 셀에 대해 처리
      cells.each((cellIndex, cell) => {
        const productCell = $(cell);
        
        // 상품 링크와 제목 - ul.pro_t > li > a
        const productLink = productCell.find('ul.pro_t li a').first();
        
        if (!productLink.length) return;
        
        const title = productLink.text().trim();
        
        // 제목에 카드명이 포함되어 있는지 확인 - 특수문자와 띄어쓰기를 제외하고 비교하도록 수정
        const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
        const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
        
        if (!title || !cleanTitle.includes(cleanCardName)) return;
        
        // 재고 여부 확인 - 품절된 상품은 처리하지 않음
        const isSoldOut = productCell.find('img[src*="icon_sortout.jpg"]').length > 0;
        if (isSoldOut) {
          return; // 품절된 상품은 처리하지 않고 건너뜀
        }
        
        // 상품 URL
        const detailUrl = productLink.attr('href');
        const fullUrl = detailUrl && detailUrl.startsWith('http') 
          ? detailUrl 
          : `https://www.carddc.co.kr/${detailUrl}`;
        
        // 카드 코드 추출 - li.pro_info_t2
        const extractedCardCode = productCell.find('li.pro_info_t2').text().trim();
        
        // 레어도 추출 - li.pro_info_t
        const rarityText = productCell.find('li.pro_info_t').text().trim();
        
        // rarityUtil의 parseRarity 함수를 사용하여 레어도 표준화
        let rarity = '알 수 없음';
        let rarityCode = 'UNK';
        
        if (rarityText) {
          const rarityInfo = parseRarity(rarityText || title);
          rarity = rarityInfo.rarity;
          rarityCode = rarityInfo.rarityCode;
        }
        
        // 가격 정보
        let price = 0;
        let originalPrice = 0;
        
        // 원래 가격 (삭제선 안에 있음)
        const originalPriceText = productCell.find('s').text().trim();
        if (originalPriceText) {
          const priceMatch = originalPriceText.match(/[\d,]+/);
          if (priceMatch) {
            originalPrice = parseInt(priceMatch[0].replace(/,/g, ''));
          }
        }
        
        // 할인된 가격 (li.price_t)
        const discountPrice = productCell.find('li.price_t').text().trim();
        if (discountPrice) {
          const priceMatch = discountPrice.match(/[\d,]+/);
          if (priceMatch) {
            price = parseInt(priceMatch[0].replace(/,/g, ''));
          }
        }
        
        // 가격이 없을 경우 원래 가격을 사용
        if (price === 0 && originalPrice > 0) {
          price = originalPrice;
        }
        
        // 언어 정보
        let language = '알 수 없음';
        if (extractedCardCode) {
          language = detectLanguageFromCardCode(extractedCardCode);
        } else {
          // 제목에서 언어 정보 추정
          language = parseLanguage(title);
        }
        
        // 상태 정보 (노멀, 데미지 등)
        const condition = parseCondition(title);
        
        items.push({
          title,
          url: fullUrl,
          condition,
          rarity,
          rarityCode,
          language,
          cardCode: extractedCardCode,
          price,
          originalPrice,
          site: 'CardDC',
          available: true // 여기서는 항상 true (품절상품은 위에서 필터링됨)
        });
      });
    });
    
    return items;
  } catch (error) {
    console.error('[ERROR] CardDC 크롤링 오류:', error);
    return [];
  }
}

/**
 * 카드 이름으로 검색하여 CardDC 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @param {number} cardId - 카드 ID
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveCardDCPrices(cardName, cardId) {
  try {
    // CardDC 크롤링
    const priceData = await crawlCardDC(cardName);
    
    if (priceData.length === 0) {
      return { 
        message: 'CardDC에서 검색 결과가 없습니다.', 
        cardId: cardId, 
        count: 0 
      };
    }
    
    // 모델 불러오기
    const { CardPrice } = require('../models/Card');
    
    // 기존 CardDC 가격 정보 삭제 (최신 정보로 갱신)
    if (cardId) {
      await CardPrice.destroy({
        where: { 
          cardId: cardId,
          site: 'CardDC'
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
            site: 'CardDC',
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
      message: `CardDC에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: priceData.length,
      prices: cardId ? prices : priceData
    };
  } catch (error) {
    console.error('[ERROR] CardDC 가격 검색 및 저장 오류:', error);
    return { 
      message: `CardDC 가격 검색 중 오류 발생: ${error.message}`,
      cardId: cardId,
      count: 0,
      error: error.message
    };
  }
}

module.exports = {
  crawlCardDC,
  searchAndSaveCardDCPrices
}; 