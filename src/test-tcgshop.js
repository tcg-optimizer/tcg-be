require('dotenv').config();
const { crawlTCGShop, encodeEUCKR } = require('./utils/tcgshopCrawler');

async function testTCGShopCrawling(cardName) {
  try {
    console.log(`TCGShop 크롤링 테스트 시작: "${cardName}"`);
    
    // EUC-KR 인코딩 테스트
    const encodedName = encodeEUCKR(cardName);
    console.log(`EUC-KR 인코딩 결과: ${encodedName}`);
    
    // 크롤링 테스트
    console.log('크롤링 시작...');
    const results = await crawlTCGShop(cardName);
    
    console.log(`크롤링 결과: ${results.length}개 상품 발견`);
    if (results.length > 0) {
      console.log('상품 정보:');
      results.forEach((product, index) => {
        console.log(`\n[상품 ${index + 1}]`);
        console.log(`제목: ${product.title}`);
        console.log(`가격: ${product.price}원`);
        console.log(`레어리티: ${product.rarity} (${product.rarityCode})`);
        console.log(`카드 코드: ${product.cardCode}`);
        console.log(`언어: ${product.language}`);
        console.log(`재고 상태: ${product.available ? '구매 가능' : '품절'}`);
        console.log(`URL: ${product.url}`);
      });
    } else {
      console.log('상품을 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
}

// 테스트 실행할 카드명 목록
const testCards = [
  '사로스 난나'
];

// 순차적으로 테스트 실행
async function runTests() {
  for (const card of testCards) {
    await testTCGShopCrawling(card);
    console.log('\n-----------------------------------\n');
  }
}

runTests(); 