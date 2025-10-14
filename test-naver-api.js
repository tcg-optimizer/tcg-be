const { searchNaverShop, searchAndSaveCardPricesApi } = require('./src/utils/naverShopApi');

const TEST_CARDS_YUGIOH = [
  '번개왕',
];

const TEST_CARDS_VANGUARD = [
  '일격파쇄의시공거병',
];

// 네이버 API 키 설정 (환경변수에서 가져오거나 직접 설정)
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '9VkM5H0Gm3O1XEdfD_Dn';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || 'dVtuYKMtWu';

// 환경변수 설정 (테스트용)
process.env.NAVER_CLIENT_ID = NAVER_CLIENT_ID;
process.env.NAVER_CLIENT_SECRET = NAVER_CLIENT_SECRET;

async function testNaverApiSearch() {
  console.log('=== 네이버 쇼핑 API 테스트 시작 ===\n');

  // API 키 확인
  if (NAVER_CLIENT_ID === 'YOUR_CLIENT_ID' || NAVER_CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
    console.log('❌ 네이버 API 키가 설정되지 않았습니다.');
    console.log('환경변수 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET를 설정하거나');
    console.log('파일 상단의 API 키를 직접 입력해주세요.\n');
    return;
  }

  // 유희왕 카드 테스트
  console.log('📋 유희왕 카드 검색 테스트:');
  for (const cardName of TEST_CARDS_YUGIOH) {
    console.log(`\n🔍 검색 중: "${cardName}" (유희왕)`);
    try {
      const results = await searchNaverShop(cardName, 'yugioh');
      
      if (results.length === 0) {
        console.log('❌ 검색 결과가 없습니다.');
      } else {
        console.log(`✅ ${results.length}개의 결과를 찾았습니다:`);
        
        // 상위 5개 결과만 표시
        results.slice(0, 5).forEach((item, index) => {
          console.log(`\n  [${index + 1}] ${item.title}`);
          console.log(`      사이트: ${item.site}`);
          console.log(`      카드 코드: ${item.cardCode || '없음'}`);
          console.log(`      레어리티: ${item.rarity}`);
          console.log(`      언어: ${item.language}`);
          console.log(`      가격: ${item.price.toLocaleString()}원`);
          console.log(`      상태: ${item.condition}`);
          console.log(`      재고: ${item.available ? '있음' : '품절'}`);
          console.log(`      URL: ${item.url}`);
          console.log(`      상품 ID: ${item.productId}`);
        });
        
        if (results.length > 5) {
          console.log(`\n  ... 외 ${results.length - 5}개 더`);
        }
      }
    } catch (error) {
      console.error(`❌ 오류 발생: ${error.message}`);
    }
    
    // 다음 요청 전 잠시 대기 (Rate Limiting)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 뱅가드 카드 테스트
  console.log('\n\n📋 뱅가드 카드 검색 테스트:');
  for (const cardName of TEST_CARDS_VANGUARD) {
    console.log(`\n🔍 검색 중: "${cardName}" (뱅가드)`);
    try {
      const results = await searchNaverShop(cardName, 'vanguard');
      
      if (results.length === 0) {
        console.log('❌ 검색 결과가 없습니다.');
      } else {
        console.log(`✅ ${results.length}개의 결과를 찾았습니다:`);
        
        // 상위 30개 결과만 표시
        results.slice(0, 30).forEach((item, index) => {
          console.log(`\n  [${index + 1}] ${item.title}`);
          console.log(`      사이트: ${item.site}`);
          console.log(`      카드 코드: ${item.cardCode || '없음'}`);
          console.log(`      레어리티: ${item.rarity}`);
          console.log(`      언어: ${item.language}`);
          console.log(`      가격: ${item.price.toLocaleString()}원`);
          console.log(`      상태: ${item.condition}`);
          console.log(`      재고: ${item.available ? '있음' : '품절'}`);
          console.log(`      URL: ${item.url}`);
          console.log(`      상품 ID: ${item.productId}`);
        });
        
        if (results.length > 30) {
          console.log(`\n  ... 외 ${results.length - 30}개 더`);
        }
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
async function testFullNaverSearch() {
  console.log('\n=== 통합 검색 및 저장 테스트 ===\n');
  
  if (NAVER_CLIENT_ID === 'YOUR_CLIENT_ID' || NAVER_CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
    console.log('❌ 네이버 API 키가 설정되지 않았습니다.');
    return;
  }
  
  const testCardName = TEST_CARDS_YUGIOH[0]; // 첫 번째 카드로 테스트
  console.log(`🔍 통합 테스트 카드: "${testCardName}"`);
  
  try {
    const result = await searchAndSaveCardPricesApi(testCardName, { gameType: 'yugioh' });
    
    console.log('\n📊 통합 테스트 결과:');
    console.log(`카드 정보: ${result.card ? result.card.name : '없음'}`);
    console.log(`저장된 가격 수: ${result.count}`);
    console.log(`원본 검색 결과 수: ${result.rawResults ? result.rawResults.length : 0}`);
    
    if (result.prices && result.prices.length > 0) {
      console.log('\n💰 저장된 가격 정보 (상위 5개):');
      result.prices.slice(0, 5).forEach((price, index) => {
        console.log(`\n  [${index + 1}] ${price.productId || 'ID 없음'}`);
        console.log(`      사이트: ${price.site || '알 수 없음'}`);
        console.log(`      가격: ${price.price?.toLocaleString() || '0'}원`);
        console.log(`      재고: ${price.available ? '있음' : '품절'}`);
        console.log(`      카드 코드: ${price.cardCode || '없음'}`);
        console.log(`      레어리티: ${price.rarity || '알 수 없음'}`);
        console.log(`      언어: ${price.language || '알 수 없음'}`);
      });
    }
    
  } catch (error) {
    console.error(`❌ 통합 테스트 오류: ${error.message}`);
  }
}

// API 키 설정 도우미 함수
function showApiKeySetup() {
  console.log('=== 네이버 API 키 설정 방법 ===\n');
  console.log('1. 환경변수로 설정:');
  console.log('   export NAVER_CLIENT_ID="your_client_id"');
  console.log('   export NAVER_CLIENT_SECRET="your_client_secret"\n');
  console.log('2. 파일에서 직접 설정:');
  console.log('   파일 상단의 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 값을 수정\n');
  console.log('3. 네이버 개발자 센터에서 API 키 발급:');
  console.log('   https://developers.naver.com/apps/#/register\n');
}

// 메인 실행 함수
async function main() {
  try {
    // API 키 설정 확인
    if (NAVER_CLIENT_ID === 'YOUR_CLIENT_ID' || NAVER_CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
      showApiKeySetup();
      return;
    }

    // 기본 검색 테스트
    await testNaverApiSearch();
    
    // 통합 테스트 (DB 저장 포함) - 필요시 주석 해제
    // await testFullNaverSearch();
    
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
  testNaverApiSearch,
  testFullNaverSearch,
  showApiKeySetup,
  TEST_CARDS_YUGIOH,
  TEST_CARDS_VANGUARD,
};
