const axios = require('axios');

// 서버 URL 설정 (필요에 따라 변경)
const API_BASE_URL = 'http://localhost:5000/api/cards';

/**
 * 카드 가격 정보 검색 및 캐시 ID 얻기
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 검색 결과
 */
async function getCardPriceAndCacheId(cardName) {
  try {
    console.log(`"${cardName}" 카드 가격 정보 검색 중...`);
    
    const response = await axios.get(`${API_BASE_URL}/rarity-prices`, {
      params: { cardName }
    });
    
    if (response.data.success) {
      const { cacheId, cacheExpiresAt, rarityPrices } = response.data;
      
      console.log(`✅ "${cardName}" 카드 가격 정보 검색 성공!`);
      
      // cacheId가 undefined인 경우 다시 검색 시도
      if (!cacheId) {
        console.log(`❌ "${cardName}" 캐시 ID가 누락되었습니다. 다시 검색을 시도합니다...`);
        try {
          // 1초 대기 후 재시도
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryResponse = await axios.get(`${API_BASE_URL}/rarity-prices`, {
            params: { cardName }
          });
          
          if (retryResponse.data.success && retryResponse.data.cacheId) {
            console.log(`✅ "${cardName}" 재시도 후 캐시 ID 획득: ${retryResponse.data.cacheId}`);
            
            // 재시도에서 얻은 값으로 업데이트
            const newCacheId = retryResponse.data.cacheId;
            const newCacheExpiresAt = retryResponse.data.cacheExpiresAt;
            const newRarityPrices = retryResponse.data.rarityPrices;
            
            // 발견된 레어도와 언어 정보 반환
            const languages = Object.keys(newRarityPrices);
            const rarities = {};
            let totalRarityCount = 0;
            
            languages.forEach(language => {
              rarities[language] = Object.keys(newRarityPrices[language]);
              totalRarityCount += rarities[language].length;
            });
            
            console.log(`   캐시 ID: ${newCacheId}`);
            console.log(`   ${languages.length}개 언어, ${totalRarityCount}개 레어도 유형 발견`);
            
            return { 
              success: true, 
              cacheId: newCacheId, 
              cardName,
              rarityPrices: newRarityPrices,
              languages,
              rarities,
              cacheExpiresAt: newCacheExpiresAt
            };
          } else {
            console.error(`❌ "${cardName}" 재시도 후에도 캐시 ID를 얻지 못했습니다.`);
          }
        } catch (retryError) {
          console.error(`❌ "${cardName}" 재검색 중 오류:`, retryError.message);
        }
      }
      
      console.log(`   캐시 ID: ${cacheId || '없음 (오류)'}`);
      
      // 발견된 레어도와 언어 정보 반환
      const languages = Object.keys(rarityPrices);
      const rarities = {};
      let totalRarityCount = 0;
      
      languages.forEach(language => {
        rarities[language] = Object.keys(rarityPrices[language]);
        totalRarityCount += rarities[language].length;
      });
      
      console.log(`   ${languages.length}개 언어, ${totalRarityCount}개 레어도 유형 발견`);
      
      // cacheId가 없는 경우 오류 반환
      if (!cacheId) {
        return {
          success: false,
          error: `"${cardName}" 카드의 캐시 ID를 얻지 못했습니다.`,
          cardName
        };
      }
      
      return { 
        success: true, 
        cacheId, 
        cardName,
        rarityPrices,
        languages,
        rarities,
        cacheExpiresAt
      };
    } else {
      console.error(`❌ "${cardName}" 카드 가격 정보 검색 실패:`, response.data.error || '알 수 없는 오류');
      return { success: false, error: response.data.error, cardName };
    }
  } catch (error) {
    console.error(`❌ "${cardName}" API 호출 실패:`, error.response?.data?.error || error.message);
    return { success: false, error: error.response?.data?.error || error.message, cardName };
  }
}

/**
 * 최적 구매 조합 계산
 * @param {Array<Object>} cards - 카드 목록
 * @param {string} shippingRegion - 배송 지역
 * @returns {Promise<Object>} - 계산 결과
 */
async function calculateOptimalPurchase(cards, shippingRegion = 'default') {
  try {
    console.log(`\n🧮 ${cards.length}장의 카드에 대한 최적 구매 조합 계산 중...`);
    
    const requestData = {
      cards,
      shippingRegion
    };
    
    console.log('📤 요청 데이터:', JSON.stringify(requestData, null, 2));
    
    const response = await axios.post(`${API_BASE_URL}/optimal-purchase`, requestData);
    
    if (response.data.success) {
      console.log('✅ 최적 구매 조합 계산 성공!');
      console.log(`💰 최종 가격: ${response.data.finalPrice.toLocaleString()}원`);
      console.log(`🛍️ 상품 금액: ${response.data.totalPrice.toLocaleString()}원`);
      console.log(`📦 배송비: ${response.data.totalShippingCost.toLocaleString()}원`);
      
      // 판매자별 정보 출력
      console.log('\n🏪 판매자별 구매 정보:');
      Object.keys(response.data.cardsOptimalPurchase).forEach(seller => {
        const sellerInfo = response.data.cardsOptimalPurchase[seller];
        console.log(`\n▶️ ${seller}`);
        console.log(`   소계: ${sellerInfo.subtotal.toLocaleString()}원`);
        console.log(`   배송비: ${sellerInfo.shippingCost.toLocaleString()}원`);
        console.log(`   구매 카드:`);
        
        sellerInfo.cards.forEach((card, index) => {
          console.log(`     ${index + 1}. ${card.cardName} x ${card.quantity}장 - ${card.price.toLocaleString()}원/장`);
          if (card.product) {
            console.log(`        레어도: ${card.product.rarity || '미상'}`);
            console.log(`        언어: ${card.product.language || '미상'}`);
          }
        });
      });
      
      return { success: true, data: response.data };
    } else {
      console.error('❌ 최적 구매 조합 계산 실패:', response.data.message || '알 수 없는 오류');
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    console.error('❌ API 호출 실패:', error.response?.data?.message || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

/**
 * 카드 정보를 처리하고 유효성 검사를 수행
 * @param {Object} cardSpec - 카드 사양
 * @returns {Promise<Object>} - 처리된 카드 정보
 */
async function processCardInfo(cardSpec) {
  // 카드 이름이 없으면 오류
  if (!cardSpec.name) {
    return { 
      success: false, 
      error: '카드 이름이 지정되지 않았습니다.' 
    };
  }
  
  // 카드 가격 정보 검색
  const priceInfo = await getCardPriceAndCacheId(cardSpec.name);
  
  if (!priceInfo.success) {
    return {
      success: false,
      error: `'${cardSpec.name}' 카드 정보 검색 실패: ${priceInfo.error || '알 수 없는 오류'}`,
      cardName: cardSpec.name
    };
  }
  
  const { cacheId, rarityPrices, languages, rarities } = priceInfo;
  
  // 레어도 자동 선택 (지정되지 않은 경우)
  let language = cardSpec.language;
  let rarity = cardSpec.rarity;
  
  // 언어가 지정되지 않은 경우 첫 번째 언어 선택
  if (!language) {
    language = languages[0];
    console.log(`💡 '${cardSpec.name}' 카드의 언어가 지정되지 않아 자동으로 '${language}' 선택`);
  } 
  // 지정된 언어가 존재하지 않는 경우
  else if (!languages.includes(language)) {
    console.error(`❌ '${cardSpec.name}' 카드에 '${language}' 언어가 존재하지 않습니다.`);
    console.log(`💡 사용 가능한 언어: ${languages.join(', ')}`);
    language = languages[0];
    console.log(`💡 자동으로 '${language}' 언어 선택`);
  }
  
  // 레어도가 지정되지 않은 경우 선택된 언어의 첫 번째 레어도 선택
  if (!rarity) {
    rarity = rarities[language][0];
    console.log(`💡 '${cardSpec.name}' 카드의 레어도가 지정되지 않아 자동으로 '${rarity}' 선택`);
  } 
  // 지정된 레어도가 선택된 언어에 존재하지 않는 경우
  else if (!rarities[language].includes(rarity)) {
    console.error(`❌ '${cardSpec.name}' 카드의 '${language}' 언어에 '${rarity}' 레어도가 존재하지 않습니다.`);
    console.log(`💡 '${language}' 언어에서 사용 가능한 레어도: ${rarities[language].join(', ')}`);
    rarity = rarities[language][0];
    console.log(`💡 자동으로 '${rarity}' 레어도 선택`);
  }
  
  // 수량 설정 (기본값: 1)
  const quantity = cardSpec.quantity || 1;
  
  return {
    success: true,
    cardInfo: {
      name: cardSpec.name,
      cacheId,
      language,
      rarity,
      quantity
    }
  };
}

/**
 * 카드 목록에서 최적 구매 조합 계산
 * @param {Array<Object>} cardSpecs - 카드 사양 목록
 * @param {string} shippingRegion - 배송 지역
 */
async function findOptimalCombination(cardSpecs, shippingRegion = 'default') {
  try {
    console.log(`🔍 ${cardSpecs.length}개 카드에 대한 최적 구매 조합 계산 시작\n`);
    
    // 각 카드 처리
    const processedCards = [];
    const failedCards = [];
    
    for (const cardSpec of cardSpecs) {
      const result = await processCardInfo(cardSpec);
      
      if (result.success) {
        processedCards.push(result.cardInfo);
      } else {
        failedCards.push({
          name: cardSpec.name || '이름 없음',
          error: result.error
        });
      }
    }
    
    // 실패한 카드가 있는 경우 보고
    if (failedCards.length > 0) {
      console.log(`\n⚠️ ${failedCards.length}개 카드 처리 실패:`);
      failedCards.forEach((card, index) => {
        console.log(`   ${index + 1}. ${card.name}: ${card.error}`);
      });
    }
    
    // 처리된 카드가 있는 경우에만 최적 조합 계산
    if (processedCards.length > 0) {
      console.log(`\n✅ ${processedCards.length}개 카드 처리 완료. 최적 구매 조합 계산...`);
      const optimal = await calculateOptimalPurchase(processedCards, shippingRegion);
      
      if (optimal.success) {
        console.log('\n✨ 최적 구매 조합 계산이 성공적으로 완료되었습니다!');
        return { success: true, data: optimal.data };
      } else {
        console.error('❌ 최적 구매 조합 계산 실패:', optimal.error);
        return { success: false, error: optimal.error };
      }
    } else {
      console.error('❌ 처리된 카드가 없어 최적 구매 조합을 계산할 수 없습니다.');
      return { success: false, error: '처리된 카드가 없습니다.' };
    }
  } catch (error) {
    console.error('❌ 최적 조합 계산 중 오류 발생:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 명령줄 인자 파싱
 * @returns {Object} 파싱된 인자들
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const result = {
    cards: [],
    shippingRegion: 'default',
    useDefaultCards: false
  };
  
  // 도움말 표시
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  // 기본 카드 사용 옵션
  if (args.includes('--use-default')) {
    result.useDefaultCards = true;
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--region=')) {
      const region = arg.substring(9).toLowerCase();
      if (['default', 'jeju', 'island'].includes(region)) {
        result.shippingRegion = region;
      } else {
        console.warn(`⚠️ 잘못된 배송 지역: ${region}. 'default', 'jeju', 'island' 중 하나여야 합니다. 기본값 'default'를 사용합니다.`);
      }
    } else if (arg.startsWith('--card=')) {
      // --card="카드이름:레어도:언어:수량" 형식 처리
      const cardInfo = arg.substring(7).split(':');
      const name = cardInfo[0];
      const rarity = cardInfo.length > 1 ? cardInfo[1] : null;
      const language = cardInfo.length > 2 ? cardInfo[2] : null;
      const quantity = cardInfo.length > 3 ? parseInt(cardInfo[3], 10) : 1;
      
      result.cards.push({
        name,
        rarity,
        language,
        quantity: isNaN(quantity) ? 1 : quantity
      });
    } else if (!arg.startsWith('--')) {
      // 단순 카드 이름
      result.cards.push({
        name: arg,
        rarity: null,
        language: null,
        quantity: 1
      });
    }
  }
  
  // 기본 카드 목록이 요청된 경우
  if (result.useDefaultCards) {
    const defaultCards = getDefaultCards();
    result.cards = [...defaultCards, ...result.cards];
  }
  
  return result;
}

/**
 * 기본 카드 목록 반환
 * @returns {Array<Object>} 기본 카드 목록
 */
function getDefaultCards() {
  return [
    { name: "화톳불", rarity: "시크릿 레어", language: "한글판", quantity: 3 },
    { name: "말살의 지명자", rarity: "슈퍼 레어", language: "한글판", quantity: 2 },
    { name: "천옥의 왕", rarity: "홀로그래픽 레어", language: "한글판", quantity: 1 }
  ];
}

/**
 * 도움말 메시지 표시
 */
function showHelp() {
  console.log('여러 카드의 최적 구매 조합 테스트 스크립트');
  console.log('사용법: node test-multiple-cards.js [카드 정보...] [옵션...]');
  console.log('\n카드 정보 지정 방법:');
  console.log('  1. "카드이름" - 레어도와 언어가 자동 선택됩니다.');
  console.log('  2. --card="카드이름:레어도:언어:수량" - 카드 이름, 레어도, 언어, 수량을 콜론(:)으로 구분하여 지정');
  console.log('\n옵션:');
  console.log('  --region=지역       배송 지역 지정 (default, jeju, island) (기본값: default)');
  console.log('  --use-default       기본 카드 목록 사용');
  console.log('  --help, -h          도움말 표시');
  console.log('\n예시:');
  console.log('  node test-multiple-cards.js --use-default');
  console.log('  node test-multiple-cards.js "블루아이즈 화이트 드래곤" "말살의 지명자"');
  console.log('  node test-multiple-cards.js --card="블루아이즈 화이트 드래곤:울트라 레어:한글판:3" --card="말살의 지명자::한글판:2"');
  console.log('  node test-multiple-cards.js --use-default --region=jeju');
}

/**
 * 메인 함수
 */
async function main() {
  // 명령줄 인자 파싱
  const args = parseCommandLineArgs();
  
  // 카드 목록이 비어있는 경우 기본값 사용
  if (args.cards.length === 0) {
    console.log('카드가 지정되지 않았습니다. 기본 카드 목록을 사용합니다.');
    args.cards = getDefaultCards();
    args.useDefaultCards = true;
  }
  
  // 카드 목록 출력
  console.log('구매할 카드 목록:');
  args.cards.forEach((card, index) => {
    console.log(`${index + 1}. ${card.name}${card.rarity ? ` (${card.rarity})` : ''}${card.language ? ` [${card.language}]` : ''} x ${card.quantity}장`);
  });
  
  console.log(`\n배송 지역: ${args.shippingRegion}`);
  
  // 최적 구매 조합 계산
  await findOptimalCombination(args.cards, args.shippingRegion);
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 프로그램 실행 중 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  getCardPriceAndCacheId,
  calculateOptimalPurchase,
  findOptimalCombination
}; 