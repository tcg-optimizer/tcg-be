require('dotenv').config();
const { searchAndSaveCardPricesApi } = require('./utils/naverShopApi');
const { crawlTCGShop } = require('./utils/tcgshopCrawler');
const { crawlCardDC } = require('./utils/cardDCCrawler');
const { crawlOnlyYugioh } = require('./utils/onlyYugiohCrawler');
const { findOptimalPurchaseCombination } = require('./utils/optimizedPurchase');

/**
 * 단일 카드의 가격 정보를 모든 소스에서 검색
 * @param {string} cardName - 검색할 카드 이름
 * @param {string} desiredRarity - 원하는 레어도 (선택적)
 * @param {string} desiredLanguage - 원하는 언어 (선택적)
 * @param {number} quantity - 구매할 카드 수량 (기본값: 1)
 * @returns {Promise<Object>} - 카드 이름, 레어도 목록, 상품 목록
 */
async function searchCardPrices(cardName, desiredRarity = null, desiredLanguage = null, quantity = 1) {
  try {
    console.log(`'${cardName}'${desiredRarity ? ` (${desiredRarity})` : ''}${desiredLanguage ? ` [${desiredLanguage}]` : ''} ${quantity}장 카드 가격 검색 중...`);
    
    // 검색 결과를 저장할 배열
    let allProducts = [];
    
    // 1. 네이버 쇼핑 API 검색
    try {
      const naverResults = await searchAndSaveCardPricesApi(cardName);
      if (naverResults && naverResults.count > 0 && naverResults.prices) {
        console.log(`네이버에서 ${naverResults.count}개 상품 발견`);
        
        // 데이터 구조 확인 및 적절한 형식으로 변환
        naverResults.prices.forEach(product => {
          let productData = product;
          // Sequelize 모델 객체인 경우 dataValues 사용
          if (product.dataValues) {
            productData = product.dataValues;
          }
          
          allProducts.push({
            ...productData,
            site: productData.site ? productData.site.replace('Naver_', '') : 'Naver',
            title: productData.title || (naverResults.card && naverResults.card.name) || cardName
          });
        });
      }
    } catch (error) {
      console.error('네이버 검색 중 오류 발생:', error.message);
    }

    // 2. TCGShop 검색
    try {
      const tcgshopResults = await crawlTCGShop(cardName);
      if (tcgshopResults && tcgshopResults.length > 0) {
        console.log(`TCGShop에서 ${tcgshopResults.length}개 상품 발견`);
        allProducts = [...allProducts, ...tcgshopResults];
      }
    } catch (error) {
      console.error('TCGShop 검색 중 오류 발생:', error.message);
    }

    // 3. CardDC 검색
    try {
      const cardDCResults = await crawlCardDC(cardName);
      if (cardDCResults && cardDCResults.length > 0) {
        console.log(`CardDC에서 ${cardDCResults.length}개 상품 발견`);
        allProducts = [...allProducts, ...cardDCResults];
      }
    } catch (error) {
      console.error('CardDC 검색 중 오류 발생:', error.message);
    }

    // 4. OnlyYugioh 검색
    try {
      const onlyYugiohResults = await crawlOnlyYugioh(cardName);
      if (onlyYugiohResults && onlyYugiohResults.length > 0) {
        console.log(`OnlyYugioh에서 ${onlyYugiohResults.length}개 상품 발견`);
        allProducts = [...allProducts, ...onlyYugiohResults];
      }
    } catch (error) {
      console.error('OnlyYugioh 검색 중 오류 발생:', error.message);
    }

    // 유효한 상품만 필터링
    allProducts = allProducts
      .filter(product => product.price > 0 && product.available) // 가격이 있고 구매 가능한 상품만 필터링
      .filter(product => product.site !== "네이버") // 판매 사이트가 "네이버"인 경우 제외
      .filter(product => !(
        (product.rarity === '알 수 없음' && product.language === '알 수 없음' && product.cardCode === null) || 
        (product.rarity === '알 수 없음' && product.cardCode === null)
      )) // 카드가 아닌 상품 제외
      .sort((a, b) => a.price - b.price); // 가격 오름차순 정렬

    // 레어도와 언어 필터링
    if (desiredRarity) {
      allProducts = allProducts.filter(product => 
        product.rarity && product.rarity.includes(desiredRarity)
      );
    }

    if (desiredLanguage) {
      allProducts = allProducts.filter(product => 
        product.language && product.language.includes(desiredLanguage)
      );
    }

    // 발견된 레어도 목록 추출 (프론트엔드에서 사용)
    const rarities = new Set(allProducts.map(p => p.rarity).filter(r => r && r !== '알 수 없음'));
    const availableRarities = Array.from(rarities);
    
    // 발견된 언어 목록 추출
    const languages = new Set(allProducts.map(p => p.language).filter(l => l && l !== '알 수 없음'));
    const availableLanguages = Array.from(languages);
    
    // 상품이 검색되지 않은 경우 빈 배열 반환
    if (allProducts.length === 0) {
      console.log(`'${cardName}' 카드에 대한 유효한 상품을 찾지 못했습니다.`);
    } else {
      // 검색된 상품의 레어도 정보 출력
      if (availableRarities.length > 0) {
        console.log(`발견된 레어도: ${availableRarities.join(', ')}`);
      }
      if (availableLanguages.length > 0) {
        console.log(`발견된 언어: ${availableLanguages.join(', ')}`);
      }
    }
    
    // 레어도별로 가장 저렴한 상품 찾기 - 프론트엔드 표시용
    const cheapestByRarity = {};
    if (availableRarities.length > 0) {
      availableRarities.forEach(rarity => {
        const rarityProducts = allProducts.filter(p => p.rarity === rarity);
        if (rarityProducts.length > 0) {
          // 각 레어도별 최저가 상품
          cheapestByRarity[rarity] = rarityProducts.reduce((min, p) => 
            p.price < min.price ? p : min, rarityProducts[0]);
        }
      });
    }
    
    return {
      cardName,
      desiredRarity,
      desiredLanguage,
      quantity,
      availableRarities,
      availableLanguages,
      cheapestByRarity,
      products: allProducts
    };
  } catch (error) {
    console.error(`'${cardName}' 카드 검색 중 오류 발생:`, error);
    return {
      cardName,
      desiredRarity,
      desiredLanguage,
      quantity,
      availableRarities: [],
      availableLanguages: [],
      cheapestByRarity: {},
      products: []
    };
  }
}

/**
 * 여러 카드의 최적 구매 조합을 찾는 함수
 * @param {Array<Object>} cardList - 검색할 카드 정보 (이름, 레어도, 언어, 수량)
 * @param {Object} options - 추가 옵션 (배송 지역 등)
 * @returns {Promise<Object>} - 최적 구매 조합 결과
 */
async function findOptimalCardsPurchase(cardList, options = {}) {
  try {
    console.log('카드 검색 시작...\n');
    
    // 기본 옵션 설정
    const defaultOptions = {
      shippingRegion: 'default' // 기본 배송 지역
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    // 1. 각 카드의 가격 정보 검색
    const cardsPromises = cardList.map(card => 
      searchCardPrices(
        card.name, 
        card.rarity, 
        card.language,
        card.quantity || 1
      )
    );
    
    const cardsSearchResults = await Promise.all(cardsPromises);
    
    // 각 카드의 사용 가능한 레어도 정보 출력
    cardsSearchResults.forEach(card => {
      if (card.availableRarities.length > 0) {
        console.log(`'${card.cardName}'의 사용 가능한 레어도:`);
        card.availableRarities.forEach(rarity => {
          const cheapest = card.cheapestByRarity[rarity];
          console.log(`  - ${rarity}: 최저가 ${cheapest.price.toLocaleString()}원 (${cheapest.site})`);
        });
      }
    });
    
    // 2. 상품 정보가 있는 카드만 필터링
    const validCardsResults = cardsSearchResults.filter(result => result.products.length > 0);
    
    if (validCardsResults.length === 0) {
      console.log('유효한 카드 정보를 찾을 수 없습니다.');
      return {
        success: false,
        message: '유효한 카드 정보를 찾을 수 없습니다.'
      };
    }
    
    if (validCardsResults.length < cardList.length) {
      console.log(`주의: ${cardList.length - validCardsResults.length}개 카드에 대한 정보를 찾지 못했습니다.`);
    }
    
    // 3. 최적 구매 조합 찾기 - 동적 프로그래밍 방식만 사용
    console.log('\n최적 구매 조합 계산 중...');
    console.time('최적화 계산 시간');
    const optimalCombination = findOptimalPurchaseCombination(validCardsResults, mergedOptions);
    console.timeEnd('최적화 계산 시간');
    
    // 4. 결과 출력
    if (!optimalCombination.success) {
      console.log('최적 구매 조합을 찾지 못했습니다:', optimalCombination.message);
      return optimalCombination;
    }
    
    // 5. 결과 정보 구성
    console.log('\n=== 최적 구매 조합 결과 ===');
    console.log(`총 비용: ${optimalCombination.totalCost.toLocaleString()}원`);
    console.log(`판매처 수: ${optimalCombination.sellers.length}개 (${optimalCombination.sellers.join(', ')})`);
    
    console.log('\n=== 판매처별 구매 내역 ===');
    for (const seller of optimalCombination.sellers) {
      // seller가 문자열인지 객체인지 확인
      const sellerKey = getSellerId(seller);
      const details = optimalCombination.purchaseDetails[sellerKey];
      
      if (!details || !details.cards) {
        console.log(`\n[${sellerKey || '알 수 없는 판매처'}]`);
        console.log('구매 내역을 표시할 수 없습니다.');
        continue;
      }
      
      console.log(`\n[${sellerKey}]`);
      console.log(`카드 수: ${details.cards.length}개`);
      console.log(`소계: ${details.subtotal.toLocaleString()}원`);
      console.log(`배송비: ${details.shippingFee.toLocaleString()}원`);
      console.log(`총액: ${details.total.toLocaleString()}원`);
      
      console.log('\n구매 카드 목록:');
      details.cards.forEach((card, index) => {
        console.log(`${index + 1}. ${card.cardName}: ${card.price.toLocaleString()}원 x ${card.quantity || 1}장 = ${(card.price * (card.quantity || 1)).toLocaleString()}원 ${card.product && card.product.rarity ? `(${card.product.rarity})` : ''}`);
      });
    }
    
    console.log('\n=== 카드별 최적 구매처 ===');
    optimalCombination.cardsOptimalPurchase.forEach((card, index) => {
      console.log(`${index + 1}. ${card.cardName}: ${card.seller} - ${card.price.toLocaleString()}원 x ${card.quantity || 1}장 = ${(card.price * (card.quantity || 1)).toLocaleString()}원 ${card.product && card.product.rarity ? `(${card.product.rarity})` : ''}`);
    });
    
    return optimalCombination;
  } catch (error) {
    console.error('최적 구매 조합 검색 중 오류 발생:', error);
    return {
      success: false,
      message: `최적 구매 조합 검색 중 오류 발생: ${error.message}`
    };
  }
}

/**
 * 판매처 객체 또는 문자열에서 ID를 추출하는 함수
 * @param {string|Object} seller - 판매처 정보
 * @returns {string} - 판매처 ID
 */
function getSellerId(seller) {
  return typeof seller === 'string' ? seller : (seller.name || seller.id || String(seller));
}

// API 요청 처리 함수
/**
 * 최적 구매 조합을 계산하는 API 핸들러
 * @param {Object} req - 요청 객체
 * @param {Object} res - 응답 객체
 * @returns {Promise<void>}
 */
async function getOptimalPurchaseCombination(req, res) {
  try {
    // 요청 데이터 확인
    const { 
      cards, 
      shippingRegion = 'default'
    } = req.body;
    
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: '카드 목록은 필수이며, 비어있지 않은 배열이어야 합니다.'
      });
    }

    // 지역 유효성 검사
    if (!['default', 'jeju', 'island'].includes(shippingRegion)) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 배송 지역입니다. default, jeju, island 중 하나여야 합니다.'
      });
    }
    
    // 필수 필드 검증
    const invalidCards = cards.filter(card => !card.name);
    if (invalidCards.length > 0) {
      return res.status(400).json({
        success: false,
        message: '모든 카드는 name 필드가 필수입니다.',
        invalidCards
      });
    }
    
    console.log(`${cards.length}개 유형의 카드에 대한 최적 구매 조합 계산 요청 (배송지역: ${shippingRegion})`);
    
    // 최적 구매 조합 계산
    const options = { shippingRegion };
    const optimalCombination = await findOptimalCardsPurchase(cards, options);
    
    // 결과 반환
    if (!optimalCombination.success) {
      return res.status(404).json({
        success: false,
        message: '최적 구매 조합을 찾지 못했습니다.',
        error: optimalCombination.message
      });
    }
    
    // 판매자별 카드 정보 재구성
    const sellerCardsMap = {};
    
    // 카드별 최적 구매 정보 처리
    optimalCombination.cardsOptimalPurchase.forEach(card => {
      const seller = getSellerId(card.seller);
      const product = card.product ? {
        price: card.product.price,
        rarity: card.product.rarity,
        language: card.product.language,
        site: card.product.site,
        url: card.product.url,
        cardCode: card.product.cardCode
      } : null;
      
      if (!sellerCardsMap[seller]) {
        sellerCardsMap[seller] = {
          cards: [],
          subtotal: 0,
          shippingCost: 0
        };
      }
      
      const processedCard = {
        cardName: card.cardName,
        price: card.price,
        quantity: card.quantity || 1,
        totalPrice: card.price * (card.quantity || 1),
        product: product
      };
      
      sellerCardsMap[seller].cards.push(processedCard);
      sellerCardsMap[seller].subtotal += processedCard.totalPrice;
    });
    
    // 배송비 정보 추가
    optimalCombination.sellers.forEach(seller => {
      const sellerKey = getSellerId(seller);
      
      if (sellerCardsMap[sellerKey]) {
        const details = optimalCombination.purchaseDetails[sellerKey];
        sellerCardsMap[sellerKey].shippingCost = details ? details.shippingFee : 0;
      }
    });
    
    // 응답 구성
    return res.json({
      success: true,
      totalPrice: optimalCombination.totalProductCost || 0,
      totalShippingCost: optimalCombination.totalShippingCost || 0,
      finalPrice: optimalCombination.totalCost || 0,
      shippingRegion: optimalCombination.shippingRegion || shippingRegion,
      cardsOptimalPurchase: sellerCardsMap
    });
    
  } catch (error) {
    console.error('최적 구매 조합 계산 중 오류 발생:', error);
    return res.status(500).json({
      success: false,
      message: '최적 구매 조합 계산 중 오류가 발생했습니다.',
      error: error.message
    });
  }
}

// 명령줄에서 실행 시 사용할 함수
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {
    cardList: [],
    shippingRegion: 'default'
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg.startsWith('--region=')) {
      options.shippingRegion = arg.substring(9);
    } else if (arg.startsWith('--card=')) {
      // --card="카드이름:레어도:언어:수량" 형식 처리
      const cardInfo = arg.substring(7).split(':');
      options.cardList.push({
        name: cardInfo[0],
        rarity: cardInfo.length > 1 ? cardInfo[1] : null,
        language: cardInfo.length > 2 ? cardInfo[2] : null,
        quantity: cardInfo.length > 3 ? parseInt(cardInfo[3], 10) : 1
      });
    } else {
      // 일반 카드 이름만 있는 경우
      options.cardList.push({
        name: arg,
        rarity: null,
        language: null,
        quantity: 1
      });
    }
  }

  return options;
}

// 도움말 출력 함수 수정
function showHelp() {
  console.log('사용법: node src/test-optimal-purchase.js [카드 정보...] [옵션]');
  console.log('\n카드 정보 지정 방법:');
  console.log('  1. "카드이름" - 레어도 지정 없이 카드 이름만 사용');
  console.log('  2. --card="카드이름:레어도:언어:수량" - 카드 이름, 레어도, 언어, 수량을 콜론(:)으로 구분하여 지정');
  console.log('\n옵션:');
  console.log('  --help, -h                  도움말 출력');
  console.log('  --region=REGION             배송 지역 지정 (default, jeju, island)');
  console.log('\n사용 예시:');
  console.log('  node src/test-optimal-purchase.js "블랙 마제스틱" "청룡의 전사"');
  console.log('  node src/test-optimal-purchase.js --card="블랙 마제스틱:울트라 레어:한국어:2" --card="청룡의 전사:슈퍼 레어::1"');
  console.log('  node src/test-optimal-purchase.js "블랙 마제스틱" "청룡의 전사" --region=jeju');
}

// 메인 함수 수정
async function main() {
  const { cardList, shippingRegion } = parseCommandLineArgs();

  if (cardList.length === 0) {
    console.log('사용법: node src/test-optimal-purchase.js [카드 정보...]');
    console.log('더 자세한 정보는 --help 옵션을 사용하세요.');
    process.exit(1);
  }

  // 카드 정보 출력
  console.log('검색할 카드 목록:');
  cardList.forEach((card, index) => {
    console.log(`${index + 1}. ${card.name}${card.rarity ? ` (${card.rarity})` : ''}${card.language ? ` [${card.language}]` : ''} x ${card.quantity}장`);
  });
  console.log('');

  try {
    await findOptimalCardsPurchase(cardList, { shippingRegion });
  } catch (error) {
    console.error('최적 구매 조합 검색 중 오류 발생:', error);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
} else {
  // 모듈로 사용될 때 API 핸들러 함수 노출
  module.exports = {
    searchCardPrices,
    findOptimalCardsPurchase,
    getOptimalPurchaseCombination
  };
} 