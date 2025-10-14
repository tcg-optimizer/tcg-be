const { crawlCardDCVanguard, searchAndSaveCardDCPrices } = require('./src/utils/cardDCCrawler');

const TEST_CARDS = [
  '황금양광의열매',
];

const TEST_CARD_CODES = [
  'DZ-BT09-KR065',
];

async function testVanguardCrawling() {
  console.log('=== CardDC 뱅가드 카드 크롤링 테스트 시작 ===\n');

  // 카드 이름으로 테스트
  console.log('📋 카드 이름으로 검색 테스트:');
  for (const cardName of TEST_CARDS) {
    console.log(`\n🔍 검색 중: "${cardName}"`);
    try {
      const results = await crawlCardDCVanguard(cardName, null, 'vanguard');
      
      if (results.length === 0) {
        console.log('❌ 검색 결과가 없습니다.');
      } else {
        console.log(`✅ ${results.length}개의 결과를 찾았습니다:`);
        
        results.forEach((item, index) => {
          console.log(`\n  [${index + 1}] ${item.title}`);
          console.log(`      카드 코드: ${item.cardCode || '없음'}`);
          console.log(`      레어리티: ${item.rarity}`);
          console.log(`      언어: ${item.language}`);
          console.log(`      가격: ${item.price.toLocaleString()}원`);
          console.log(`      상태: ${item.condition}`);
          console.log(`      재고: ${item.available ? '있음' : '품절'}`);
          console.log(`      URL: ${item.url}`);
          console.log(`      상품 ID: ${item.productId}`);
        });
      }
    } catch (error) {
      console.error(`❌ 오류 발생: ${error.message}`);
    }
    
    // 다음 요청 전 잠시 대기 (Rate Limiting)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 카드 코드로 테스트
  console.log('\n\n📋 카드 코드로 검색 테스트:');
  for (const cardCode of TEST_CARD_CODES) {
    console.log(`\n🔍 검색 중: "${cardCode}"`);
    try {
      const results = await crawlCardDCVanguard(cardCode, null, 'vanguard');
      
      if (results.length === 0) {
        console.log('❌ 검색 결과가 없습니다.');
      } else {
        console.log(`✅ ${results.length}개의 결과를 찾았습니다:`);
        
        results.forEach((item, index) => {
          console.log(`\n  [${index + 1}] ${item.title}`);
          console.log(`      카드 코드: ${item.cardCode || '없음'}`);
          console.log(`      레어리티: ${item.rarity}`);
          console.log(`      언어: ${item.language}`);
          console.log(`      가격: ${item.price.toLocaleString()}원`);
          console.log(`      상태: ${item.condition}`);
          console.log(`      재고: ${item.available ? '있음' : '품절'}`);
          console.log(`      URL: ${item.url}`);
          console.log(`      상품 ID: ${item.productId}`);
        });
      }
    } catch (error) {
      console.error(`❌ 오류 발생: ${error.message}`);
    }
    
    // 다음 요청 전 잠시 대기 (Rate Limiting)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== 테스트 완료 ===');
}

// DB 저장 기능까지 포함한 통합 테스트 함수
async function testFullVanguardSearch() {
  console.log('\n=== 통합 검색 및 저장 테스트 ===\n');
  
  const testCardName = TEST_CARDS[0]; // 첫 번째 카드로 테스트
  console.log(`🔍 통합 테스트 카드: "${testCardName}"`);
  
  try {
    const result = await searchAndSaveCardDCPrices(testCardName, null, 'vanguard');
    
    console.log('\n📊 통합 테스트 결과:');
    console.log(`메시지: ${result.message}`);
    console.log(`카드 ID: ${result.cardId || '없음'}`);
    console.log(`검색 결과 수: ${result.count}`);
    
    if (result.prices && result.prices.length > 0) {
      console.log('\n💰 가격 정보:');
      result.prices.forEach((price, index) => {
        console.log(`\n  [${index + 1}] ${price.product?.id || 'ID 없음'}`);
        console.log(`      사이트: ${price.product?.site || '알 수 없음'}`);
        console.log(`      가격: ${price.product?.price?.toLocaleString() || '0'}원`);
        console.log(`      재고: ${price.product?.available ? '있음' : '품절'}`);
        console.log(`      카드 코드: ${price.product?.cardCode || '없음'}`);
        console.log(`      레어리티: ${price.product?.rarity || '알 수 없음'}`);
      });
    }
    
    if (result.error) {
      console.error(`❌ 오류: ${result.error}`);
    }
    
  } catch (error) {
    console.error(`❌ 통합 테스트 오류: ${error.message}`);
  }
}

// 메인 실행 함수
async function main() {
  try {
    // 기본 크롤링 테스트
    await testVanguardCrawling();
    
    // 통합 테스트 (DB 저장 포함) - 필요시 주석 해제
    // await testFullVanguardSearch();
    
  } catch (error) {
    console.error('테스트 실행 중 오류 발생:', error);
  } finally {
    console.log('\n프로그램을 종료합니다.');
    process.exit(0);
  }
}

// 스크립트 직접 실행 시에만 테스트 실행
if (require.main === module) {
  main();
}

module.exports = {
  testVanguardCrawling,
  testFullVanguardSearch,
  TEST_CARDS,
  TEST_CARD_CODES,
};
