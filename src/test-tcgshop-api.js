require('dotenv').config();
const { searchAndSaveTCGShopPrices } = require('./utils/tcgshopCrawler');

async function testTCGShopAPI() {
  try {
    const cardName = '긴급텔레포트';
    console.log(`TCGShop API 테스트 시작: "${cardName}"`);
    
    // TCGShop 검색 및 저장 테스트
    const results = await searchAndSaveTCGShopPrices(cardName, null);
    
    console.log(`검색 결과: ${results.count}개 상품 발견`);
    console.log('결과 데이터:');
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
}

// 테스트 실행
testTCGShopAPI(); 