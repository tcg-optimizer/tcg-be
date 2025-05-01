/**
 * 브루트 포스 알고리즘 기반 최적 구매 조합 모듈
 * 모든 가능한 조합을 탐색하여 최적해를 보장합니다.
 */

const { getShippingInfo } = require('../shippingInfo');
const { getSellerId, filterTopSellers } = require('./cardUtils');
const { calculatePointsAmount } = require('./pointsUtils');

/**
 * 브루트 포스 알고리즘을 사용한 최적해 찾기
 * 주의: 카드 수가 많으면 계산량이 지수적으로 증가합니다.
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션
 * @returns {Object} - 최적 구매 조합
 */
function findBruteForceOptimalPurchase(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  const pointsOptions = options.pointsOptions || {
    tcgshop: false,
    carddc: false,
    naverBasic: false,
    naverBankbook: false,
    naverMembership: false,
    naverHyundaiCard: false
  };
  
  // 적립금 고려 여부 출력
  const considerPointsStr = Object.entries(pointsOptions)
    .filter(([_, enabled]) => enabled)
    .map(([store]) => store)
    .join(', ');
  
  console.log('\n[브루트 포스 알고리즘 실행] 배송 지역:', shippingRegion, 
    '적립금 고려:', considerPointsStr ? `예 (${considerPointsStr})` : '아니오');
  
  // 적립금 옵션 상세 정보 출력
  if (considerPointsStr) {
    console.log('적립금 옵션 상세:');
    if (pointsOptions.tcgshop) console.log('- TCGShop: 10% 적립');
    if (pointsOptions.carddc) console.log('- CardDC: 10% 적립');
    if (pointsOptions.naverBasic) console.log('- 네이버 기본: 2.5% 적립 (리뷰 적립금 포함)');
    if (pointsOptions.naverBankbook) console.log('- 네이버 제휴통장: 0.5% 적립');
    if (pointsOptions.naverMembership) console.log('- 네이버 멤버십: 4% 적립');
    if (pointsOptions.naverHyundaiCard) console.log('- 네이버 현대카드: 7% 적립');
  }
  
  // 카드 수 제한 확인 (브루트 포스는 카드 수가 많을 경우 연산량 폭발)
  const MAX_CARDS_FOR_BRUTE_FORCE = 12; // 최대 12개 까지만 처리 (이후는 지수적으로 느려짐)
  
  if (cardsList.length > MAX_CARDS_FOR_BRUTE_FORCE) {
    console.log(`\n[브루트 포스 알고리즘] 경고: 카드 수(${cardsList.length})가 최대 제한(${MAX_CARDS_FOR_BRUTE_FORCE})을 초과했습니다.`);
    console.log(`처음 ${MAX_CARDS_FOR_BRUTE_FORCE}개 카드만 사용하여 최적화를 수행합니다.`);
    cardsList = cardsList.slice(0, MAX_CARDS_FOR_BRUTE_FORCE);
  }
  
  // 각 카드별로 상위 판매처 고려 (다른 알고리즘과 일치하도록 30으로 설정)
  const maxSellersPerCard = 30; // 각 카드별 고려할 최대 판매처 수
  console.log(`[브루트 포스 알고리즘] 각 카드당 최대 ${maxSellersPerCard}개 판매처만 고려합니다.`);
  const reducedCardsList = filterTopSellers(cardsList, maxSellersPerCard);
  
  // 판매처 정보 준비
  const allSellers = new Set();
  reducedCardsList.forEach(card => {
    card.products.forEach(product => {
      allSellers.add(getSellerId(product.site));
    });
  });
  const sellersList = Array.from(allSellers);
  
  // 각 카드별 구매 가능한 판매처 리스트 수집
  const sellerOptions = {};
  
  reducedCardsList.forEach(card => {
    const { cardName, products, quantity = 1 } = card;
    sellerOptions[cardName] = products.map(product => {
      const sellerId = getSellerId(product.site);
      return {
        sellerId,
        price: product.price,
        product
      };
    });
  });
  
  // 각 판매처의 배송비 정보 맵
  const sellerShippingInfo = {};
  sellersList.forEach(seller => {
    const info = getShippingInfo(seller);
    // 지역별 배송비 확인
    switch(shippingRegion) {
      case 'jeju':
        sellerShippingInfo[seller] = {
          ...info,
          shippingFee: info.jejuShippingFee || info.shippingFee
        };
        break;
      case 'island':
        sellerShippingInfo[seller] = {
          ...info,
          shippingFee: info.islandShippingFee || info.shippingFee
        };
        break;
      default:
        sellerShippingInfo[seller] = info;
    }
  });
  
  // 리뷰 작성한 제품 목록 (ID 또는 이름)
  const reviewedProducts = new Set();
  
  // 최적 구매 조합을 찾기 위한 초기값 설정
  let bestCombination = null;
  let bestTotalCost = Infinity;
  let combinationsChecked = 0;
  
  // 브루트 포스 알고리즘으로 모든 가능한 조합 탐색
  function exploreAllCombinations(cardIndex, currentSelection, sellerSubtotals) {
    // 모든 카드에 대한 선택이 완료된 경우
    if (cardIndex === reducedCardsList.length) {
      combinationsChecked++;
      
      // 각 판매처별 상품 및 배송비 계산
      const purchaseDetails = {};
      sellersList.forEach(seller => {
        purchaseDetails[seller] = {
          cards: [],
          subtotal: 0,
          shippingFee: 0,
          total: 0,
          points: 0
        };
      });
      
      // 선택된 조합에 따라 판매처별 상품 및 가격 정보 정리
      for (const [cardName, sellerOption] of Object.entries(currentSelection)) {
        const cardInfo = reducedCardsList.find(c => c.cardName === cardName);
        const quantity = cardInfo.quantity || 1;
        const sellerId = sellerOption.sellerId;
        const price = sellerOption.price;
        const product = sellerOption.product;
        
        // 판매처별 상품 추가
        purchaseDetails[sellerId].cards.push({
          cardName,
          price: price,
          product,
          quantity
        });
        
        // 판매처별 소계 계산
        purchaseDetails[sellerId].subtotal += price * quantity;
        
        // 적립금 계산
        const points = calculatePointsAmount(sellerId, price, quantity, cardName, reviewedProducts, pointsOptions);
        purchaseDetails[sellerId].points += points;
      }
      
      // 각 판매처별 배송비 및 총 비용 계산
      let totalCost = 0;
      
      for (const sellerId in purchaseDetails) {
        const purchase = purchaseDetails[sellerId];
        
        // 해당 판매처에서 구매한 상품이 없으면 건너뛰기
        if (purchase.cards.length === 0) {
          continue;
        }
        
        // 배송비 계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[sellerId];
        purchase.shippingFee = purchase.subtotal >= freeShippingThreshold ? 0 : shippingFee;
        
        // 네이버 스토어인 경우 리뷰 적립금 추가 계산 - 그리디 알고리즘과 일관성 유지
        if (pointsOptions.naverBasic && require('./cardUtils').isNaverStore(sellerId)) {
          // 리뷰 적립금 (3000원 이상 제품당 150원)
          const reviewableCards = purchase.cards.filter(card => card.price >= 3000);
          // 중복 제품명 제거 (같은 제품은 한 번만 리뷰 가능)
          const uniqueCardNames = [...new Set(reviewableCards.map(card => card.cardName))];
          const reviewPoints = uniqueCardNames.length * 150;
          
          // 리뷰 적립금을 포인트 합계에 직접 추가
          if (reviewPoints > 0) {
            console.log(`[브루트 포스 디버깅] ${sellerId}에 대한 리뷰 적립금 ${reviewPoints}원 추가 (${uniqueCardNames.length}개 상품)`);
            purchase.points += reviewPoints;
          }
        }
        
        // 총 비용 계산 (상품 가격 + 배송비 - 적립금)
        purchase.total = purchase.subtotal + purchase.shippingFee - purchase.points;
        totalCost += purchase.total;
      }
      
      // 현재까지의 최적 조합보다 더 좋은 조합을 찾은 경우 갱신
      if (totalCost < bestTotalCost) {
        bestTotalCost = totalCost;
        
        // 최적 조합 정보 생성
        const sellers = [];
        let totalCards = 0;
        
        for (const sellerId in purchaseDetails) {
          const purchase = purchaseDetails[sellerId];
          
          // 해당 판매처에서 구매한 상품이 없으면 건너뛰기
          if (purchase.cards.length === 0) {
            continue;
          }
          
          // 판매처별 정보 추가
          sellers.push({
            sellerId,
            cards: purchase.cards,
            subtotal: purchase.subtotal,
            shippingFee: purchase.shippingFee,
            points: purchase.points,
            total: purchase.total
          });
          
          // 총 카드 수 계산
          totalCards += purchase.cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
        }
        
        // 최적 조합 정보 저장
        bestCombination = {
          totalCost,
          sellers,
          totalCards
        };
        
        // 디버깅: 새로운 최적 조합 발견 시 상세 정보 출력
        console.log(`\n[브루트 포스] 새로운 최적 조합 발견 (${combinationsChecked.toLocaleString()}번째 시도)`);
        console.log(`총 비용: ${totalCost.toLocaleString()}원, 판매처: ${sellers.length}개`);
        
        // 각 판매처별 상세 정보 출력
        sellers.forEach(seller => {
          console.log(`- ${seller.sellerId}: 상품가격 ${seller.subtotal.toLocaleString()}원, 배송비 ${seller.shippingFee.toLocaleString()}원`);
          if (seller.points > 0) {
            console.log(`  적립금: ${seller.points.toLocaleString()}원 적용됨`);
          }
          console.log(`  총 비용: ${seller.total.toLocaleString()}원, 카드 수: ${seller.cards.length}개`);
        });
        
        // 진행상황 출력 (1,000,000개 단위)
        if (combinationsChecked % 1000000 === 0) {
          console.log(`[브루트 포스] ${combinationsChecked.toLocaleString()}개 조합 확인, 현재 최적 비용: ${bestTotalCost.toLocaleString()}원`);
        }
      }
      
      return;
    }
    
    // 현재 카드 정보
    const card = reducedCardsList[cardIndex];
    const cardName = card.cardName;
    const sellerOptionsForCard = sellerOptions[cardName];
    
    // 현재 카드의 모든 가능한 판매처 탐색
    for (const option of sellerOptionsForCard) {
      const sellerId = option.sellerId;
      const price = option.price;
      const quantity = card.quantity || 1;
      
      // 현재 판매처 선택
      const newSelection = { 
        ...currentSelection, 
        [cardName]: option 
      };
      
      // 판매처별 소계 업데이트
      const newSellerSubtotals = { ...sellerSubtotals };
      newSellerSubtotals[sellerId] = (newSellerSubtotals[sellerId] || 0) + (price * quantity);
      
      // 현재 조합이 탐색을 중단할 가능성이 있는지 확인 (가지치기)
      let currentPartialCost = 0;
      for (const [seller, subtotal] of Object.entries(newSellerSubtotals)) {
        if (subtotal > 0) {
          const info = sellerShippingInfo[seller];
          const tempShippingFee = subtotal >= info.freeShippingThreshold ? 0 : info.shippingFee;
          currentPartialCost += subtotal + tempShippingFee;
        }
      }
      
      // 가지치기: 이미 최선의 비용보다 높아졌다면 이 조합은 더 탐색하지 않음
      if (currentPartialCost >= bestTotalCost) {
        // 디버깅: 일정 횟수마다 가지치기 정보 출력
        if (combinationsChecked % 10000 === 0) {
          console.log(`[브루트 포스 디버깅] 가지치기 발생: 부분비용(${currentPartialCost}) >= 최적비용(${bestTotalCost})`);
        }
        continue;
      }
      
      // 다음 카드로 재귀 호출
      exploreAllCombinations(cardIndex + 1, newSelection, newSellerSubtotals);
    }
  }

  console.log(`[브루트 포스 알고리즘] ${reducedCardsList.length}개 카드, ${sellersList.length}개 판매처로 모든 가능한 구매 조합 탐색 시작...`);
  
  // 시간 측정 시작
  const startTime = Date.now();
  
  // 브루트 포스 탐색 시작
  exploreAllCombinations(0, {}, {});
  
  // 시간 측정 종료
  const endTime = Date.now();
  const elapsedTime = (endTime - startTime) / 1000;
  
  console.log(`[브루트 포스 알고리즘] 총 ${combinationsChecked.toLocaleString()}개 조합 탐색 완료 (소요시간: ${elapsedTime.toFixed(2)}초)`);
  
  if (!bestCombination) {
    console.log('[브루트 포스 알고리즘] 유효한 구매 조합을 찾을 수 없습니다.');
    return null;
  }
  
  console.log(`[브루트 포스 알고리즘] 최적 구매 조합 찾음: ${bestCombination.totalCost.toLocaleString()}원`);
  
  // 카드별 최적 구매처 정보 생성
  const cardsOptimalPurchase = [];
  
  // 총 상품가격, 배송비, 적립금 계산
  let totalProductCost = 0;
  let totalShippingCost = 0;
  let totalPointsEarned = 0;
  
  // 각 판매처별로 카드 정보 정리 및 총액 계산
  bestCombination.sellers.forEach(seller => {
    const sellerId = seller.sellerId;
    
    // 총액에 합산
    totalProductCost += seller.subtotal;
    totalShippingCost += seller.shippingFee;
    totalPointsEarned += seller.points;
    
    seller.cards.forEach(card => {
      cardsOptimalPurchase.push({
        cardName: card.cardName,
        seller: sellerId,
        price: card.price,
        totalPrice: card.price * (card.quantity || 1),
        quantity: card.quantity || 1,
        product: card.product
      });
    });
  });
  
  // 카드 이미지 수집 (그리디 알고리즘과 동일한 방식)
  const cardImagesMap = {};
  cardsOptimalPurchase.forEach(card => {
    if (!cardImagesMap[card.cardName]) {
      const cardInfo = reducedCardsList.find(c => c.cardName === card.cardName);
      
      // 우선순위: 1. 카드 객체의 image 속성
      if (cardInfo && cardInfo.image) {
        cardImagesMap[card.cardName] = cardInfo.image;
      }
      // 2. 카드의 products 배열에서 이미지 찾기
      else if (cardInfo && cardInfo.products && cardInfo.products.length > 0) {
        // 제품에 이미지 필드가 있으면 사용 (첫 번째 상품)
        const firstProduct = cardInfo.products[0];
        
        if (firstProduct.image) {
          cardImagesMap[card.cardName] = firstProduct.image;
        }
        // 선택된 상품에 이미지가 있으면 사용
        else if (card.product && card.product.image) {
          cardImagesMap[card.cardName] = card.product.image;
        }
        else {
          // 모든 상품을 검사하여 이미지 찾기
          const productWithImage = cardInfo.products.find(p => p.image);
          if (productWithImage) {
            cardImagesMap[card.cardName] = productWithImage.image;
          } else {
            cardImagesMap[card.cardName] = null;
          }
        }
      }
      else {
        cardImagesMap[card.cardName] = null;
      }
    }
  });
  
  // 판매처별 그룹화
  const groupedCardsByStore = {};
  
  // 각 카드를 상점별로 그룹화
  cardsOptimalPurchase.forEach(card => {
    if (!groupedCardsByStore[card.seller]) {
      groupedCardsByStore[card.seller] = {
        cards: [],
        finalPrice: 0,
        productCost: 0,
        shippingCost: 0,
        pointsEarned: 0
      };
    }
    
    // 카드 정보 추가
    groupedCardsByStore[card.seller].cards.push({
      cardName: card.cardName,
      price: card.price,
      quantity: card.quantity,
      totalPrice: card.totalPrice,
      product: card.product,
      image: cardImagesMap[card.cardName]
    });
  });
  
  // 각 상점별 합계 정보 추가
  bestCombination.sellers.forEach(seller => {
    if (groupedCardsByStore[seller.sellerId]) {
      groupedCardsByStore[seller.sellerId].finalPrice = seller.total;
      groupedCardsByStore[seller.sellerId].productCost = seller.subtotal;
      groupedCardsByStore[seller.sellerId].shippingCost = seller.shippingFee;
      groupedCardsByStore[seller.sellerId].pointsEarned = seller.points;
    }
  });
  
  // 결과 포맷 생성 (그리디 알고리즘과 완전히 동일한 형식)
  return {
    success: cardsOptimalPurchase.length === reducedCardsList.length,
    totalCost: bestCombination.totalCost,
    totalProductCost,
    totalShippingCost,
    totalPointsEarned,
    pointsOptions,
    shippingRegion,
    cardsOptimalPurchase: groupedCardsByStore,
    cardImages: cardImagesMap,
    algorithm: 'brute_force'
  };
}

module.exports = {
  findBruteForceOptimalPurchase
}; 