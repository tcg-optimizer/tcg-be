const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { parseRarity } = require('./rarityUtil');
const { parseLanguage, parseCondition, detectIllustration, encodeEUCKR } = require('./crawler');
const { CardPrice } = require('../models/Card');
const { withRateLimit } = require('./rateLimiter');

// Stealth 플러그인 적용 (봇 탐지 우회)
puppeteer.use(StealthPlugin());

/**
 * Puppeteer를 사용한 CardDC 크롤링
 * - 실제 Chrome 브라우저 사용
 * - IP 차단 및 봇 탐지 우회
 * - puppeteer-extra-plugin-stealth로 자동화 탐지 회피
 * - axios보다 느리지만 더 안정적
 */

let browserInstance = null;

// 브라우저 인스턴스 재사용 (성능 최적화)
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true, // 'new' 모드 사용 (더 안정적)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // 자동화 탐지 우회
        '--disable-dev-shm-usage', // 메모리 부족 방지
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // EC2에서 Chrome 경로 지정 가능
    });
  }
  return browserInstance;
}

// 애플리케이션 종료 시 브라우저 정리
process.on('exit', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
});

const crawlCardDCPuppeteer = async (cardName, cardId) => {
  let page = null;
  
  try {
    // EUC-KR로 인코딩된 검색어 생성
    const encodedQuery = encodeEUCKR(cardName);
    const searchUrl = `https://www.carddc.co.kr/product_list.html?search_word=${encodedQuery.replace(/%20/g, '+')}&x=0&y=0`;

    console.log(`[PUPPETEER] CardDC 크롤링 시작: ${cardName}`);
    
    const browser = await getBrowser();
    page = await browser.newPage();

    // stealth 플러그인이 자동으로 처리하지만, 추가 헤더는 직접 설정
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://www.carddc.co.kr/',
    });

    // 뷰포트 설정
    await page.setViewport({ width: 1920, height: 1080 });

    // 페이지 이동
    const response = await page.goto(searchUrl, {
      waitUntil: 'networkidle2', // 네트워크가 조용해질 때까지 대기
      timeout: 30000,
    });

    // 응답 상태 확인
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
    }

    console.log(`[PUPPETEER] 페이지 로드 완료: ${response.status()}`);

    // 페이지에서 데이터 추출 (브라우저 컨텍스트에서 실행)
    const items = await page.evaluate((cardName) => {
      const results = [];
      const isCardCodePattern = /^[A-Z0-9]{2,5}-[A-Z]{2}\d{3,4}$/i.test(cardName.trim());

      document.querySelectorAll('table tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        
        cells.forEach((cell) => {
          // 상품 링크 찾기
          const productLink = cell.querySelector('ul.pro_t li a');
          if (!productLink) return;

          const title = productLink.textContent.trim();
          const detailUrl = productLink.href;

          // 카드 코드 추출
          const cardCodeEl = cell.querySelector('li.pro_info_t2');
          const extractedCardCode = cardCodeEl ? cardCodeEl.textContent.trim() : '';

          // 매칭 확인
          let isMatch = false;
          if (isCardCodePattern) {
            const cleanSearchCode = cardName.trim().toLowerCase();
            const cleanExtractedCode = extractedCardCode.toLowerCase();
            isMatch = cleanExtractedCode === cleanSearchCode;
          } else {
            const cleanCardName = cardName.replace(/[-=\s]/g, '').toLowerCase();
            const cleanTitle = title.replace(/[-=\s]/g, '').toLowerCase();
            isMatch = cleanTitle.includes(cleanCardName);
          }

          if (!isMatch) return;

          // 품절 체크
          const isSoldOut = cell.querySelector('img[src*="icon_sortout.jpg"]');
          if (isSoldOut) return;

          // 레어도 추출
          const rarityEl = cell.querySelector('li.pro_info_t');
          const rarityText = rarityEl ? rarityEl.textContent.trim() : '';

          // 가격 추출
          let price = 0;
          const discountPriceEl = cell.querySelector('li.price_t');
          if (discountPriceEl) {
            const priceMatch = discountPriceEl.textContent.match(/[\d,]+/);
            if (priceMatch) {
              price = parseInt(priceMatch[0].replace(/,/g, ''));
            }
          }

          // 원래 가격 (할인 전)
          const originalPriceEl = cell.querySelector('s');
          if (originalPriceEl && price === 0) {
            const priceMatch = originalPriceEl.textContent.match(/[\d,]+/);
            if (priceMatch) {
              price = parseInt(priceMatch[0].replace(/,/g, ''));
            }
          }

          // 상품 ID 추출
          let productId = null;
          const idMatch = detailUrl.match(/item_id=(\d+)/);
          if (idMatch && idMatch[1]) {
            productId = `carddc-${idMatch[1]}`;
          } else {
            // URL 해시로 고유 ID 생성
            const urlHash = detailUrl.split('').reduce((acc, char) => {
              return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
            }, 0);
            productId = `carddc-${Math.abs(urlHash)}`;
          }

          results.push({
            title,
            url: detailUrl,
            cardCode: extractedCardCode,
            price,
            rarity: rarityText,
            productId,
          });
        });
      });

      return results;
    }, cardName); // cardName을 브라우저 컨텍스트로 전달

    // Node.js 컨텍스트에서 추가 파싱
    const parsedItems = items.map(item => {
      const rarity = parseRarity(item.rarity || item.title);
      const language = parseLanguage(item.cardCode || item.title);
      const condition = parseCondition(item.title);
      const illustration = detectIllustration(item.title);

      return {
        ...item,
        rarity,
        language,
        condition,
        illustration,
        site: 'CardDC',
        available: true,
        cardId,
      };
    });

    console.log(`[PUPPETEER] 크롤링 완료: ${parsedItems.length}개 결과`);
    
    return parsedItems;

  } catch (error) {
    console.error('[ERROR] CardDC Puppeteer 크롤링 오류:', error.message);
    return [];
  } finally {
    if (page) {
      await page.close();
    }
  }
};

const crawlCardDCPuppeteerWithRateLimit = withRateLimit(crawlCardDCPuppeteer, 'carddc');

const searchAndSaveCardDCPricesPuppeteer = async (cardName, cardId = null) => {
  try {
    const results = await crawlCardDCPuppeteerWithRateLimit(cardName, cardId);

    if (results.length === 0) {
      return {
        message: 'CardDC에서 검색 결과가 없습니다.',
        cardId: cardId,
        count: 0,
      };
    }

    if (cardId) {
      await CardPrice.destroy({
        where: {
          cardId: cardId,
          site: 'CardDC',
        },
      });
    }

    const prices = [];

    if (cardId) {
      const priceDataArray = results.map(item => ({
        cardId: cardId,
        site: 'CardDC',
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
      }));

      let savedPrices = [];

      try {
        savedPrices = await CardPrice.bulkCreate(priceDataArray, {
          validate: true,
          returning: true,
        });
      } catch (bulkError) {
        for (const priceData of priceDataArray) {
          try {
            const savedPrice = await CardPrice.create(priceData);
            savedPrices.push(savedPrice);
          } catch (individualError) {
            // 개별 에러는 무시
          }
        }
      }

      savedPrices.forEach((savedPrice) => {
        const item = results.find(result => result.productId === savedPrice.productId);
        
        if (item) {
          const productWithId = {
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
          };

          savedPrice.dataValues.product = productWithId;
        }
        
        prices.push(savedPrice);
      });
    }

    return {
      message: `CardDC에서 ${results.length}개의 가격 정보를 찾았습니다.`,
      cardId: cardId,
      count: results.length,
      prices: cardId
        ? prices
        : results.map(item => {
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
  } catch (error) {
    console.error('[ERROR] CardDC Puppeteer 가격 검색 및 저장 오류:', error);
    return {
      message: `CardDC 가격 검색 중 오류 발생: ${error.message}`,
      cardId: cardId,
      count: 0,
      error: error.message,
    };
  }
};

// 브라우저 정리 함수 (서버 종료 시 호출)
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  crawlCardDCPuppeteer: crawlCardDCPuppeteerWithRateLimit,
  searchAndSaveCardDCPricesPuppeteer,
  searchAndSaveCardDCPrices: searchAndSaveCardDCPricesPuppeteer, // 호환성을 위한 alias
  closeBrowser,
};

