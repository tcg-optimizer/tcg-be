require('dotenv').config();
const { searchAndSaveCardPricesApi } = require('./utils/naverShopApi');
const { crawlTCGShop } = require('./utils/tcgshopCrawler');
const { crawlCardDC } = require('./utils/cardDCCrawler');
const { crawlOnlyYugioh } = require('./utils/onlyYugiohCrawler');
const { parseRarity } = require('./utils/rarityUtil');

/**
 * 카드 이름으로 모든 소스에서 가격 정보를 검색하여 비교합니다
 * @param {string} cardName - 검색할 카드 이름
 */
async function comparePrices(cardName) {
  try {
    console.log(`'${cardName}' 카드 가격 비교 시작\n`);
    
    // 검색 결과를 저장할 배열
    let allProducts = [];
    let card = null;
    let searchSource = 'direct_search';

    // 1. 네이버 쇼핑 API 검색
    console.log('1. 네이버 쇼핑 검색 중...');
    try {
      const naverResults = await searchAndSaveCardPricesApi(cardName);
      if (naverResults && naverResults.count > 0) {
        console.log(`네이버에서 ${naverResults.count}개 상품 발견`);
        
        // 카드 기본 정보 저장
        card = naverResults.card;
        
        // 데이터 구조 확인 및 적절한 형식으로 변환
        if (naverResults.prices) {
          // DB에서 가져온 모델 객체인 경우 dataValues 사용
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
      } else {
        console.log('네이버에서 상품을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('네이버 검색 중 오류 발생:', error.message);
    }

    // 2. TCGShop 검색
    console.log('\n2. TCGShop 검색 중...');
    try {
      const tcgshopResults = await crawlTCGShop(cardName);
      if (tcgshopResults && tcgshopResults.length > 0) {
        console.log(`TCGShop에서 ${tcgshopResults.length}개 상품 발견`);
        
        // 통합 배열에 추가
        allProducts = [...allProducts, ...tcgshopResults];
      } else {
        console.log('TCGShop에서 상품을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('TCGShop 검색 중 오류 발생:', error.message);
    }

    // 3. CardDC 검색
    console.log('\n3. CardDC 검색 중...');
    try {
      const cardDCResults = await crawlCardDC(cardName);
      if (cardDCResults && cardDCResults.length > 0) {
        console.log(`CardDC에서 ${cardDCResults.length}개 상품 발견`);
        
        // 통합 배열에 추가
        allProducts = [...allProducts, ...cardDCResults];
      } else {
        console.log('CardDC에서 상품을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('CardDC 검색 중 오류 발생:', error.message);
    }

    // 4. OnlyYugioh 검색
    console.log('\n4. OnlyYugioh 검색 중...');
    try {
      const onlyYugiohResults = await crawlOnlyYugioh(cardName);
      if (onlyYugiohResults && onlyYugiohResults.length > 0) {
        console.log(`OnlyYugioh에서 ${onlyYugiohResults.length}개 상품 발견`);
        
        // 통합 배열에 추가
        allProducts = [...allProducts, ...onlyYugiohResults];
      } else {
        console.log('OnlyYugioh에서 상품을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('OnlyYugioh 검색 중 오류 발생:', error.message);
    }

    // 5. 가격순으로 정렬 및 결과 출력
    console.log('\n=== 가격 비교 결과 ===');
    if (allProducts.length === 0) {
      console.log('검색된 상품이 없습니다.');
      return;
    }

    // 가격 기준 오름차순 정렬
    allProducts = allProducts
      .filter(product => product.price > 0 && product.available) // 가격이 있고 구매 가능한 상품만 필터링
      .filter(product => product.site !== "네이버") // 판매 사이트가 "네이버"인 경우 제외
      .filter(product => !(
        (product.rarity === '알 수 없음' && product.language === '알 수 없음' && product.cardCode === null) || 
        (product.rarity === '알 수 없음' && product.cardCode === null)
      )) // 카드가 아닌 상품 제외
      .sort((a, b) => a.price - b.price);

    // 결과 출력 (각 상품 정보)
    console.log(`총 ${allProducts.length}개 상품 발견 (가격순 정렬)\n`);
    
    allProducts.forEach((product, index) => {
      console.log(`[${index + 1}] ${product.site}`);
      console.log(`제목: ${product.title}`);
      console.log(`가격: ${product.price.toLocaleString()}원`);
      console.log(`레어리티: ${product.rarity || '정보 없음'}`);
      console.log(`언어: ${product.language || '정보 없음'}`);
      console.log(`상태: ${product.condition || '정보 없음'}`);
      console.log(`URL: ${product.url}`);
      console.log('-'.repeat(50));
    });
    
    // 프론트로 보낼 정보 구성
    const lowestPrice = allProducts[0]; // 가격 오름차순 정렬했으므로 첫 번째 상품이 최저가
    
    // 레어도별로 가격 정보 그룹화
    const rarityPrices = {};
    
    allProducts.forEach(product => {
      // rarityUtil에서 파싱한 표준 레어도 사용
      const rarity = product.rarity || '알 수 없음';
      
      // 레어도별 그룹화
      if (!rarityPrices[rarity]) {
        rarityPrices[rarity] = [];
      }
      
      // allPrices와 같은 형식의 데이터 추가
      rarityPrices[rarity].push({
        id: product.id,
        price: product.price,
        site: product.site,
        url: product.url,
        condition: product.condition,
        rarity: product.rarity,
        language: product.language,
        cardCode: product.cardCode,
        available: product.available,
        lastUpdated: product.lastUpdated
      });
    });
    
    // 각 레어도 그룹 내에서 가격순으로 정렬
    Object.keys(rarityPrices).forEach(rarity => {
      rarityPrices[rarity].sort((a, b) => a.price - b.price);
    });
    
    // 프론트에 보낼 전체 정보 구성
    const responseData = {
      success: true,
      source: searchSource,
      data: {
        cardId: card?.id || null,
        cardName: card?.name || cardName,
        image: card?.image || null,
        allPrices: allProducts.map(price => ({
          id: price.id,
          price: price.price,
          site: price.site,
          url: price.url,
          condition: price.condition,
          rarity: price.rarity,
          language: price.language,
          cardCode: price.cardCode || null,
          available: price.available,
          lastUpdated: price.lastUpdated
        })),
        rarityPrices
      }
    };
    
    // 프론트로 보낼 정보를 콘솔에 출력
    console.log('\n=== 프론트로 보낼 정보 ===');
    console.log(JSON.stringify(responseData, null, 2));

  } catch (error) {
    console.error('가격 비교 중 오류 발생:', error);
  }
}

// 명령줄 인자로 카드 이름을 받아서 실행
const cardName = process.argv[2];

if (!cardName) {
  console.log('사용법: node src/test-price-comparison.js "카드이름"');
  process.exit(1);
}

// 가격 비교 실행
comparePrices(cardName); 