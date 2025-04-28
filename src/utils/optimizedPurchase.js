/**
 * 여러 카드를 최저가로 구매하기 위한 최적 조합 알고리즘
 */

const { getShippingInfo } = require('./shippingInfo');

/**
 * 각 카드별로 상위 N개의 저렴한 판매처만 선택하여 탐색 공간 축소
 * 추가적으로 레어도 조건을 적용하여 필터링
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {number} topN - 각 카드별로 선택할 최대 판매처 수
 * @returns {Array<Object>} - 축소된 카드 목록
 */
function filterTopSellers(cardsList, topN = 5) {
  return cardsList.map(card => {
    // 상품 목록이 없거나 비어있는 경우 처리
    if (!card.products) {
      console.log(`경고: '${card.cardName}' 카드의 상품 목록(products)이 없습니다.`);
      return {
        ...card,
        products: []
      };
    }
    
    // products가 배열이 아닌 경우 체크 (prices 필드가 있는 형태)
    let productsList = card.products;
    
    // products 객체가 배열이 아니고 prices 속성을 가지고 있는 경우 (캐시된 형식)
    if (!Array.isArray(productsList) && productsList.prices) {
      console.log(`정보: '${card.cardName}' 카드의 상품 목록이 {prices: [...]} 형태로 되어 있어 변환합니다.`);
      productsList = productsList.prices; // prices 배열을 사용
    }
    
    // 배열이 아닌 경우 빈 배열로 처리
    if (!Array.isArray(productsList)) {
      console.log(`경고: '${card.cardName}' 카드의 상품 목록이 유효한 형식이 아닙니다:`, productsList);
      return {
        ...card,
        products: []
      };
    }
    
    // 기본 상품 목록
    let filteredProducts = productsList;
    
    // 레어도 조건이 있는 경우 해당 조건에 맞는 상품만 필터링
    if (card.desiredRarity) {
      filteredProducts = productsList.filter(product => {
        // 레어도 일치 확인 (대소문자 무시)
        const productRarity = (product.rarity || '').toLowerCase();
        const desiredRarity = card.desiredRarity.toLowerCase();
        
        // 정확한 일치 확인
        return productRarity === desiredRarity;
      });
      
      // 레어도 조건에 맞는 상품이 없으면 빈 배열 반환
      // 해당 카드는 구매할 수 없는 것으로 처리됨
      if (filteredProducts.length === 0) {
        console.log(`경고: '${card.cardName}'의 레어도 '${card.desiredRarity}' 조건에 맞는 상품이 없습니다. 구매 불가능으로 처리됩니다.`);
        return {
          ...card,
          products: []  // 빈 배열 반환
        };
      }
    }
    
    // 각 카드의 상품을 가격순으로 정렬, 가격이 같을 경우 배송비가 저렴한 판매처 우선
    const sortedProducts = [...filteredProducts].sort((a, b) => {
      // 우선 가격으로 정렬
      if (a.price !== b.price) {
        return a.price - b.price;
      }
      
      // 가격이 같으면, 배송비로 정렬
      const aInfo = getShippingInfo(getSellerId(a.site));
      const bInfo = getShippingInfo(getSellerId(b.site));
      
      // 일반 배송비로 비교
      return aInfo.shippingFee - bInfo.shippingFee;
    });
    
    // 이미 포함된 판매처 추적
    const includedSellers = new Set();
    const filteredBySellerProducts = [];
    
    // 상위 N개의 서로 다른 판매처만 선택
    for (const product of sortedProducts) {
      const sellerId = getSellerId(product.site);
      if (!includedSellers.has(sellerId) && includedSellers.size < topN) {
        includedSellers.add(sellerId);
        filteredBySellerProducts.push(product);
      }
    }
    
    return {
      ...card,
      products: filteredBySellerProducts
    };
  });
}

/**
 * 판매처 ID를 가져오는 함수
 * @param {string|Object} seller - 판매처 정보
 * @returns {string} - 판매처 ID
 */
function getSellerId(seller) {
  // 문자열인 경우 그대로 반환
  if (typeof seller === 'string') {
    return seller;
  }
  
  // 판매처가 객체인 경우, name이나 id 속성 사용
  return seller.name || seller.id || String(seller);
}

/**
 * 카드 구매의 최적 조합을 찾는 함수
 * 그리디 알고리즘만 사용
 * 
 * @param {Array<Object>} cardsList - 각 카드의 구매 가능한 상품 목록
 * @param {Object} options - 알고리즘 선택 및 성능 옵션
 * @returns {Object} - 최적 구매 조합 정보
 */
function findOptimalPurchaseCombination(cardsList, options = {}) {
  console.log("그리디 알고리즘 사용 중...");
  
  // 기본 옵션 설정
  const defaultOptions = {
    maxSellersPerCard: 30, // 각 카드별 고려할 최대 판매처 수
    maxIterations: 50,     // 최적화 반복 횟수
    accuracyLevel: 'balanced', // 정확도 수준 (fast, balanced, thorough)
    shippingRegion: 'default'  // 배송 지역
  };
  
  // 옵션 병합
  const mergedOptions = { ...defaultOptions, ...options };
  
  // 정확도 수준에 따른 옵션 조정
  switch(mergedOptions.accuracyLevel) {
    case 'fast':
      // 빠른 실행 우선, 정확도 낮음
      mergedOptions.maxSellersPerCard = Math.min(mergedOptions.maxSellersPerCard, 20);
      mergedOptions.maxIterations = Math.min(mergedOptions.maxIterations, 20);
      break;
    case 'thorough':
      // 정확도 우선, 속도 느림
      mergedOptions.maxSellersPerCard = Math.max(mergedOptions.maxSellersPerCard, 100);
      mergedOptions.maxIterations = Math.max(mergedOptions.maxIterations, 100);
      break;
    // balanced는 기본값 사용
  }
  
  // 그리디 알고리즘 실행
  console.log("개선된 그리디 알고리즘 실행 중...");
  return findGreedyOptimalPurchase(cardsList, mergedOptions);
}

/**
 * 탐욕 알고리즘을 사용한 준최적해 찾기
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션
 * @returns {Object} - 최적 구매 조합
 */
function findGreedyOptimalPurchase(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  console.log('\n[개선된 탐욕 알고리즘 실행] 배송 지역:', shippingRegion);
  
  // 각 카드별로 상위 판매처 고려 (50개로 증가)
  const maxSellersPerCard = options.maxSellersPerCard || 50; // 기존 30에서 50으로 증가
  const reducedCardsList = filterTopSellers(cardsList, maxSellersPerCard);
  
  // 판매처 정보 준비
  const allSellers = new Set();
  reducedCardsList.forEach(card => {
    card.products.forEach(product => {
      allSellers.add(getSellerId(product.site));
    });
  });
  const sellersList = Array.from(allSellers);
  
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
  
  // 다양한 정렬 전략으로 여러 시도 수행
  const sortingStrategies = [
    // 1. 가격이 높은 카드부터 처리 (기존 방식)
    cards => [...cards].sort((a, b) => {
      const aMinPrice = Math.min(...a.products.map(p => p.price));
      const bMinPrice = Math.min(...b.products.map(p => p.price));
      return bMinPrice - aMinPrice; // 내림차순 정렬
    }),
    // 2. 가격이 낮은 카드부터 처리
    cards => [...cards].sort((a, b) => {
      const aMinPrice = Math.min(...a.products.map(p => p.price));
      const bMinPrice = Math.min(...b.products.map(p => p.price));
      return aMinPrice - bMinPrice; // 오름차순 정렬
    }),
    // 3. 가격 차이가 큰 카드부터 처리 (최저가와 최고가 차이가 큰 것)
    cards => [...cards].sort((a, b) => {
      const aPrices = a.products.map(p => p.price);
      const bPrices = b.products.map(p => p.price);
      const aDiff = Math.max(...aPrices) - Math.min(...aPrices);
      const bDiff = Math.max(...bPrices) - Math.min(...bPrices);
      return bDiff - aDiff; // 차이가 큰 순서로
    }),
    // 4. 원본 순서 유지 (입력된 순서)
    cards => [...cards]
  ];
  
  // 최적화 반복 횟수 증가 (20 → 50)
  const MAX_ITERATIONS = options.maxIterations || 50;
  
  // 각 정렬 전략별로 최적화 시도
  let bestSolution = null;
  let bestCost = Infinity;
  
  for (let strategyIndex = 0; strategyIndex < sortingStrategies.length; strategyIndex++) {
    console.log(`\n[개선된 탐욕] 정렬 전략 #${strategyIndex + 1} 시도 중...`);
    
    // 정렬 전략 적용
    const sortedCards = sortingStrategies[strategyIndex](reducedCardsList);
    
    // 각 판매처별 구매 내역 초기화
    const purchaseDetails = {};
    sellersList.forEach(seller => {
      purchaseDetails[seller] = {
        cards: [],
        subtotal: 0,
        shippingFee: 0,
        total: 0
      };
    });
    
    // 카드별 최적 구매처 정보
    const cardsOptimalPurchase = [];
    
    // 1. 첫 번째 단계: 각 카드를 최적의 판매처에 할당 (배송비 고려)
    sortedCards.forEach((cardInfo, index) => {
      const { cardName, products, quantity = 1 } = cardInfo;
      let bestSeller = null;
      let bestProduct = null;
      let lowestTotalCost = Infinity;
      
      // 각 판매처별로 이 카드를 추가했을 때의 총 비용 계산
      products.forEach(product => {
        const seller = getSellerId(product.site);
        const currentSubtotal = purchaseDetails[seller].subtotal;
        const newSubtotal = currentSubtotal + (product.price * quantity);
        
        // 배송비 계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
        const currentShippingFee = purchaseDetails[seller].shippingFee;
        const newShippingFee = newSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
        
        // 이 카드를 이 판매처에 추가했을 때의 총 비용 변화
        const costDifference = (product.price * quantity) + (newShippingFee - currentShippingFee);
        
        if (costDifference < lowestTotalCost) {
          lowestTotalCost = costDifference;
          bestSeller = seller;
          bestProduct = product;
        }
      });
      
      if (bestSeller && bestProduct) {
        // 구매 내역에 추가
        purchaseDetails[bestSeller].cards.push({
          cardName,
          price: bestProduct.price,
          product: bestProduct,
          quantity
        });
        
        purchaseDetails[bestSeller].subtotal += bestProduct.price * quantity;
        
        // 배송비 재계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[bestSeller];
        purchaseDetails[bestSeller].shippingFee = 
          purchaseDetails[bestSeller].subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
        
        // 총 비용 업데이트
        purchaseDetails[bestSeller].total = 
          purchaseDetails[bestSeller].subtotal + purchaseDetails[bestSeller].shippingFee;
        
        // 카드별 최적 구매처 정보에 추가
        cardsOptimalPurchase.push({
          cardName,
          seller: bestSeller,
          price: bestProduct.price,
          totalPrice: bestProduct.price * quantity,
          quantity,
          product: bestProduct
        });
      }
    });
    
    // 2. 두 번째 단계: 배송비 최적화 - 여러 번 반복하여 최적화
    let improved = true;
    let iterations = 0;
    
    while (improved && iterations < MAX_ITERATIONS) {
      improved = false;
      iterations++;
      
      console.log(`[개선된 탐욕] 최적화 반복 #${iterations}`);
      
      // 판매처 그룹화: 배송비를 지불하는 판매처와 배송비 면제 판매처
      const payingShippingFee = sellersList.filter(seller => {
        const details = purchaseDetails[seller];
        return details.subtotal > 0 && 
               (details.shippingFee > 0 || sellerShippingInfo[seller].freeShippingThreshold === Infinity) && 
               (details.subtotal < sellerShippingInfo[seller].freeShippingThreshold || sellerShippingInfo[seller].freeShippingThreshold === Infinity);
      });
      
      const freeShippingSellers = sellersList.filter(seller => {
        const details = purchaseDetails[seller];
        return details.subtotal > 0 && details.shippingFee === 0 && sellerShippingInfo[seller].freeShippingThreshold !== Infinity;
      });
      
      // 배송비 지불 판매처가 없으면 종료
      if (payingShippingFee.length === 0) {
        console.log('[개선된 탐욕] 더 이상 배송비를 지불하는 판매처가 없습니다.');
        break;
      }
      
      // 2.1. 무료배송 임계값 전략: 임계값에 가까운 판매처는 추가 구매로, 멀리 있는 판매처는 통합
      payingShippingFee.sort((a, b) => {
        const aGap = sellerShippingInfo[a].freeShippingThreshold - purchaseDetails[a].subtotal;
        const bGap = sellerShippingInfo[b].freeShippingThreshold - purchaseDetails[b].subtotal;
        
        // 무료배송 임계값이 없는 경우(Infinity) 항상 뒤로
        if (sellerShippingInfo[a].freeShippingThreshold === Infinity) return 1;
        if (sellerShippingInfo[b].freeShippingThreshold === Infinity) return -1;
        
        return aGap - bGap;  // 면제 임계값에 가까운 순서로 정렬
      });
      
      // 2.2. 각 배송비 지불 판매처에 대해 최적화 전략 적용
      for (const sourceSellerName of payingShippingFee) {
        const sourceSeller = purchaseDetails[sourceSellerName];
        const sourceThreshold = sellerShippingInfo[sourceSellerName].freeShippingThreshold;
        const sourceShippingFee = sellerShippingInfo[sourceSellerName].shippingFee;
        const gapToThreshold = sourceThreshold - sourceSeller.subtotal;
        
        // 전략 1: 무료배송 임계값에 가까운 경우, 추가 구매로 무료배송 달성 시도
        if (sourceThreshold !== Infinity && gapToThreshold <= sourceShippingFee * 2) {
          // 다른 판매처에서 이 판매처로 상품 이동 시도 (무료배송 달성)
          let foundImprovement = tryMoveCardsToReachThreshold(
            sourceSellerName, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
          );
          
          if (foundImprovement) {
            improved = true;
            continue;
          }
          
          // 추가 시도: 다른 카드 조합으로 무료배송 달성 가능한지 탐색
          foundImprovement = tryMultipleCardsMove(
            sourceSellerName, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
          );
          
          if (foundImprovement) {
            improved = true;
            continue;
          }
        }
        
        // 전략 2: 무료배송 달성이 어려운 경우, 다른 판매처로 통합 시도
        // 특히 배송비가 높은 판매처에서 카드를 다른 판매처로 이동
        for (const card of [...sourceSeller.cards]) {
          // 이 카드를 다른 판매처에서 구매할 수 있는 선택지 찾기
          const alternatives = [];
          
          reducedCardsList.find(c => c.cardName === card.cardName)?.products.forEach(product => {
            const seller = getSellerId(product.site);
            if (seller !== sourceSellerName) {
              alternatives.push({
                seller,
                product,
                price: product.price,
                quantity: card.quantity || 1
              });
            }
          });
          
          // 선호 순위: 1) 이미 무료배송인 판매처, 2) 무료배송 임계값에 가까운 판매처, 3) 가격이 낮은 판매처
          alternatives.sort((a, b) => {
            const aIsFreeShipping = freeShippingSellers.includes(a.seller);
            const bIsFreeShipping = freeShippingSellers.includes(b.seller);
            
            // 무료배송 판매처 우선
            if (aIsFreeShipping && !bIsFreeShipping) return -1;
            if (!aIsFreeShipping && bIsFreeShipping) return 1;
            
            // 둘 다 무료배송이 아니면 가격 비교
            return a.price - b.price;
          });
          
          for (const alt of alternatives) {
            const targetSellerName = alt.seller;
            // 타겟 판매처가 존재하는지 확인
            if (!purchaseDetails[targetSellerName]) {
              continue;
            }
            const targetSeller = purchaseDetails[targetSellerName];
            
            // 현재 비용
            const originalSourceTotal = sourceSeller.total;
            const originalTargetTotal = targetSeller.total;
            const originalCost = originalSourceTotal + originalTargetTotal;
            
            // 카드를 이동했을 때의 비용 시뮬레이션
            const cardPrice = card.price * (card.quantity || 1);
            const targetPrice = alt.price * alt.quantity;
            const newSourceSubtotal = sourceSeller.subtotal - cardPrice;
            const newTargetSubtotal = targetSeller.subtotal + targetPrice;
            
            // 새로운 배송비 계산
            const { shippingFee: sourceShippingFee } = sellerShippingInfo[sourceSellerName];
            const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = 
              sellerShippingInfo[targetSellerName];
              
            const newSourceShippingFee = newSourceSubtotal > 0 ? 
              (newSourceSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
            // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
            const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
            
            // 현재 비용과 새 비용 비교
            const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
            const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
            const newTotalCost = newSourceTotal + newTargetTotal;
            
            // 비용이 줄어들면 카드 이동
            if (newTotalCost < originalCost && (newTotalCost < originalCost || newSourceSubtotal === 0)) {
              console.log(`[개선된 탐욕] 카드 이동: ${card.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${originalCost - newTotalCost}원)`);
              
              // 소스 판매처에서 카드 제거
              const cardIndex = sourceSeller.cards.findIndex(c => c.cardName === card.cardName);
              if (cardIndex !== -1) {
                sourceSeller.cards.splice(cardIndex, 1);
              }
              sourceSeller.subtotal = newSourceSubtotal;
              sourceSeller.shippingFee = newSourceShippingFee;
              sourceSeller.total = newSourceTotal;
              
              // 타겟 판매처에 카드 추가
              targetSeller.cards.push({
                cardName: card.cardName,
                price: alt.price,
                product: alt.product,
                quantity: alt.quantity
              });
              targetSeller.subtotal = newTargetSubtotal;
              targetSeller.shippingFee = newTargetShippingFee;
              targetSeller.total = newTargetTotal;
              
              // 카드별 최적 구매처 정보 업데이트
              const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === card.cardName);
              if (cardPurchaseIndex !== -1) {
                cardsOptimalPurchase[cardPurchaseIndex] = {
                  cardName: card.cardName,
                  seller: targetSellerName,
                  price: alt.price,
                  totalPrice: alt.price * alt.quantity,
                  quantity: alt.quantity,
                  product: alt.product
                };
              }
              
              improved = true;
              break;
            }
          }
          
          if (improved) break;
        }
      }
    }
    
    // 추가 최적화: 판매처 통합 시도
    console.log('[개선된 탐욕] 판매처 통합 최적화 시작...');
    
    let consolidationImproved = true;
    let consolidationIterations = 0;
    const MAX_CONSOLIDATION_ITERATIONS = 5; // 통합 시도 최대 횟수 제한
    
    while (consolidationImproved && consolidationIterations < MAX_CONSOLIDATION_ITERATIONS) {
      consolidationImproved = false;
      consolidationIterations++;
      
      console.log(`[개선된 탐욕] 판매처 통합 시도 #${consolidationIterations}`);
      
      // 판매처 통합 최적화
      consolidationImproved = trySellersConsolidation(
        purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
      );
      
      if (consolidationImproved) {
        console.log('[개선된 탐욕] 판매처 통합 성공');
      }
    }
    
    // 최종 결과 계산
    let totalCost = 0;
    let totalProductCost = 0;
    let totalShippingCost = 0;
    
    sellersList.forEach(seller => {
      const details = purchaseDetails[seller];
      if (details.subtotal > 0) {
        totalCost += details.total;
        totalProductCost += details.subtotal;
        totalShippingCost += details.shippingFee;
      }
    });
    
    // 현재 전략의 결과가 더 좋으면 저장
    if (totalCost < bestCost) {
      bestCost = totalCost;
      
      // 사용된 판매처만 필터링
      const usedSellers = sellersList.filter(seller => purchaseDetails[seller].subtotal > 0);
      
      // 빈 판매처 제거
      const finalPurchaseDetails = {};
      usedSellers.forEach(seller => {
        finalPurchaseDetails[seller] = purchaseDetails[seller];
      });
      
      // 판매처별 구매 요약 정보 (클라이언트 표시용)
      const sellers = usedSellers.map(seller => {
        const details = finalPurchaseDetails[seller];
        return {
          name: seller,
          cards: details.cards.map(card => ({ 
            name: card.cardName, 
            quantity: card.quantity,
            price: card.price,
            totalPrice: card.price * card.quantity
          })),
          totalPrice: details.total,
          productCost: details.subtotal,
          shippingCost: details.shippingFee
        };
      });
      
      bestSolution = {
        success: cardsOptimalPurchase.length === reducedCardsList.length,
        totalCost,
        totalProductCost,
        totalShippingCost,
        sellers: usedSellers,
        purchaseDetails: finalPurchaseDetails,
        cardsOptimalPurchase,
        sellerDetails: sellers,
        shippingRegion
      };
      
      console.log(`[개선된 탐욕] 전략 #${strategyIndex + 1} 결과 - 총비용: ${totalCost.toLocaleString()}원, 판매처: ${usedSellers.length}개 (현재 최적)`);
    } else {
      console.log(`[개선된 탐욕] 전략 #${strategyIndex + 1} 결과 - 총비용: ${totalCost.toLocaleString()}원 (최적 아님, 최적 비용: ${bestCost.toLocaleString()}원)`);
    }
  }
  
  console.log(`[개선된 탐욕] 최종 결과 - 총비용: ${bestCost.toLocaleString()}원`);
  
  return bestSolution;
}

/**
 * 무료배송 임계값에 도달하기 위해 다른 판매처에서 카드를 이동하는 함수
 */
function tryMoveCardsToReachThreshold(targetSeller, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, cardsList) {
  const otherSellers = Object.keys(purchaseDetails).filter(s => 
    s !== targetSeller && purchaseDetails[s].cards.length > 0
  );
  
  // 다른 판매처의 카드 중 이동 가능한 후보 찾기
  const candidateCards = [];
  
  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      // 타겟 판매처에서도 구매 가능한지 확인
      const cardInfo = cardsList.find(c => c.cardName === card.cardName);
      if (!cardInfo) return;
      
      const productInTargetSeller = cardInfo.products.find(p => getSellerId(p.site) === targetSeller);
      if (productInTargetSeller) {
        candidateCards.push({
          seller,
          cardName: card.cardName,
          currentPrice: card.price,
          currentProduct: card.product,
          quantity: card.quantity || 1,
          targetPrice: productInTargetSeller.price,
          targetProduct: productInTargetSeller
        });
      }
    });
  });
  
  // 임계값 근처에 맞는 카드 조합 찾기 (냅색 문제와 유사)
  candidateCards.sort((a, b) => 
    (a.targetPrice * a.quantity) - (b.targetPrice * b.quantity)
  );
  
  // 적절한 크기의 카드 찾기
  for (const candidate of candidateCards) {
    const sourceSellerName = candidate.seller;
    const sourceSeller = purchaseDetails[sourceSellerName];
    const cardPrice = candidate.currentPrice * candidate.quantity;
    const targetPrice = candidate.targetPrice * candidate.quantity;
    
    // 카드 가격이 임계값 Gap과 비슷한 경우 (1.5배 이내) 이동 시도
    if (targetPrice >= gapToThreshold * 0.7 && targetPrice <= gapToThreshold * 1.5) {
      // 현재 비용 계산
      const currentSourceTotal = sourceSeller.total;
      const currentTargetTotal = purchaseDetails[targetSeller].total;
      const currentTotalCost = currentSourceTotal + currentTargetTotal;
      
      // 이동 시 비용 효과 계산
      const newSourceSubtotal = sourceSeller.subtotal - cardPrice;
      const newTargetSubtotal = purchaseDetails[targetSeller].subtotal + targetPrice;
      
      // 새로운 배송비 계산
      const { shippingFee: sourceShippingFee, freeShippingThreshold: sourceThreshold } = sellerShippingInfo[sourceSellerName];
      const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = 
        sellerShippingInfo[targetSellerName];
            
      const newSourceShippingFee = newSourceSubtotal > 0 ? 
        (newSourceSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
      // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
      const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
      
      // 현재 비용과 새 비용 비교
      const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
      const newTotalCost = newSourceTotal + newTargetTotal;
      
      // 비용이 줄어들면 카드 이동
      if (newTotalCost < currentTotalCost) {
        console.log(`[개선된 탐욕] 무료배송 달성을 위한 카드 이동: ${candidate.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${currentTotalCost - newTotalCost}원)`);
        
        // 소스 판매처에서 카드 제거
        const cardIndex = sourceSeller.cards.findIndex(c => c.cardName === candidate.cardName);
        if (cardIndex !== -1) {
          sourceSeller.cards.splice(cardIndex, 1);
        }
        sourceSeller.subtotal = newSourceSubtotal;
        sourceSeller.shippingFee = newSourceShippingFee;
        sourceSeller.total = newSourceTotal;
        
        // 타겟 판매처에 카드 추가
        targetSeller.cards.push({
          cardName: candidate.cardName,
          price: candidate.targetPrice,
          product: candidate.targetProduct,
          quantity: candidate.quantity
        });
        targetSeller.subtotal = newTargetSubtotal;
        targetSeller.shippingFee = newTargetShippingFee;
        targetSeller.total = newTargetTotal;
        
        // 카드별 최적 구매처 정보 업데이트
        const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === candidate.cardName);
        if (cardPurchaseIndex !== -1) {
          cardsOptimalPurchase[cardPurchaseIndex] = {
            cardName: candidate.cardName,
            seller: targetSellerName,
            price: candidate.targetPrice,
            totalPrice: candidate.targetPrice * candidate.quantity,
            quantity: candidate.quantity,
            product: candidate.targetProduct
          };
        }
        
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 여러 카드의 조합으로 무료배송 임계값에 도달하기 위한 최적화 시도
 * @param {string} targetSeller - 대상 판매처
 * @param {number} gapToThreshold - 무료배송 임계값까지의 차이
 * @param {Object} purchaseDetails - 판매처별 구매 내역
 * @param {Object} sellerShippingInfo - 판매처별 배송비 정보
 * @param {Array} cardsOptimalPurchase - 카드별 최적 구매처 정보
 * @param {Array} cardsList - 카드 목록
 * @returns {boolean} - 최적화 성공 여부
 */
function tryMultipleCardsMove(targetSeller, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, cardsList) {
  // 범위를 넓혀서 무료배송 임계값에 맞는 카드 조합 찾기 시도
  // 다른 판매처의 카드 중 이동 가능한 후보 찾기
  const allCandidateCards = [];
  const otherSellers = Object.keys(purchaseDetails).filter(s => 
    s !== targetSeller && purchaseDetails[s].cards.length > 0
  );
  
  // 모든 가능한 후보 카드 수집
  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      // 타겟 판매처에서도 구매 가능한지 확인
      const cardInfo = cardsList.find(c => c.cardName === card.cardName);
      if (!cardInfo) return;
      
      const productInTargetSeller = cardInfo.products.find(p => getSellerId(p.site) === targetSeller);
      if (productInTargetSeller) {
        allCandidateCards.push({
          seller,
          cardName: card.cardName,
          currentPrice: card.price,
          currentProduct: card.product,
          quantity: card.quantity || 1,
          targetPrice: productInTargetSeller.price,
          targetProduct: productInTargetSeller,
          // 효율성 계산: 가격 차이 대비 이동 가격 (낮을수록 효율적)
          efficiency: (productInTargetSeller.price - card.price) / productInTargetSeller.price
        });
      }
    });
  });
  
  // 효율성 기준으로 정렬 (가장 효율적인 이동부터 시도)
  allCandidateCards.sort((a, b) => a.efficiency - b.efficiency);
  
  // 부분집합 합 문제 해결 (Subset Sum)
  // 목표: gapToThreshold에 가장 가까운 카드 조합 찾기
  
  // 동적 프로그래밍 대신 그리디 접근법으로 근사 해결
  // (완전 탐색은 너무 비용이 높으므로)
  
  // 최대 3개까지의 카드 조합 시도 (더 많은 경우도 가능하지만 연산 비용 고려)
  const maxCardsToMove = Math.min(5, allCandidateCards.length);
  let bestCombination = [];
  let bestGapDifference = Infinity;
  let bestTotalCost = Infinity;
  
  // 싱글 카드 이동 (이미 tryMoveCardsToReachThreshold에서 시도했으므로 건너뜀)
  
  // 2~3개 카드 조합 시도 (효율적인 카드 중에서)
  for (let numCards = 2; numCards <= maxCardsToMove; numCards++) {
    // 가능한 모든 카드 조합에 대해 시뮬레이션
    // 효율성 상위 8개 카드 중에서만 조합 시도 (성능 최적화)
    const topCards = allCandidateCards.slice(0, Math.min(8, allCandidateCards.length));
    
    // 조합 생성 (재귀 함수 사용)
    const combinations = [];
    
    function generateCombinations(start, current, count) {
      if (current.length === count) {
        combinations.push([...current]);
        return;
      }
      
      for (let i = start; i < topCards.length; i++) {
        // 같은 판매처에서 여러 카드를 가져오면 안됨 (판매처 통합 효과 감소)
        if (current.some(card => card.seller === topCards[i].seller)) {
          continue;
        }
        
        current.push(topCards[i]);
        generateCombinations(i + 1, current, count);
        current.pop();
      }
    }
    
    generateCombinations(0, [], numCards);
    
    // 각 조합에 대해 비용 시뮬레이션
    for (const combination of combinations) {
      // 카드 조합의 총 가격
      let combinationTargetPrice = 0;
      let combinationSourcePrice = 0;
      
      // 원본 상태 백업
      const originalDetails = {};
      combination.forEach(card => {
        const seller = card.seller;
        if (!originalDetails[seller]) {
          originalDetails[seller] = {
            subtotal: purchaseDetails[seller].subtotal,
            shippingFee: purchaseDetails[seller].shippingFee,
            total: purchaseDetails[seller].total
          };
        }
        
        combinationTargetPrice += card.targetPrice * card.quantity;
        combinationSourcePrice += card.currentPrice * card.quantity;
      });
      
      // 타겟 판매처 원본 상태
      const originalTargetDetails = {
        subtotal: purchaseDetails[targetSeller].subtotal,
        shippingFee: purchaseDetails[targetSeller].shippingFee,
        total: purchaseDetails[targetSeller].total
      };
      
      // 새로운 가격이 무료배송 임계값에 얼마나 가까운지 확인
      const newTargetSubtotal = originalTargetDetails.subtotal + combinationTargetPrice;
      const newGapDifference = Math.abs(sellerShippingInfo[targetSeller].freeShippingThreshold - newTargetSubtotal);
      
      // 이 조합으로 무료배송을 달성할 수 있는지 확인
      const newTargetShippingFee = 
        newTargetSubtotal >= sellerShippingInfo[targetSeller].freeShippingThreshold ? 0 : sellerShippingInfo[targetSeller].shippingFee;
      
      // 소스 판매처들의 새 배송비 계산
      let totalSourceNewShippingFee = 0;
      let totalSourceOldShippingFee = 0;
      
      combination.forEach(card => {
        const seller = card.seller;
        const sourceThreshold = sellerShippingInfo[seller].freeShippingThreshold;
        const sourceShippingFee = sellerShippingInfo[seller].shippingFee;
        
        // 이미 처리한 판매처는 건너뜀
        if (originalDetails[seller].processed) return;
        
        const currentSubtotal = originalDetails[seller].subtotal;
        const currentShippingFee = originalDetails[seller].shippingFee;
        
        // 같은 판매처에서 오는 모든 카드의 가격 합산
        const allCardsPrice = combination
          .filter(c => c.seller === seller)
          .reduce((sum, c) => sum + (c.currentPrice * c.quantity), 0);
          
        const newSubtotal = currentSubtotal - allCardsPrice;
        const newShippingFee = newSubtotal > 0 ? 
          (newSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
        
        totalSourceOldShippingFee += currentShippingFee;
        totalSourceNewShippingFee += newShippingFee;
        
        // 처리 표시
        originalDetails[seller].processed = true;
      });
      
      // 처리 표시 초기화
      Object.keys(originalDetails).forEach(seller => {
        delete originalDetails[seller].processed;
      });
      
      // 총 비용 변화 계산
      const oldTotalCost = originalTargetDetails.total + 
        combination.reduce((sum, card) => sum + originalDetails[card.seller].total, 0);
        
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
      
      // 소스 판매처들의 새 총액 계산
      let newSourceTotals = 0;
      const sourceSellerUpdates = {};
      
      combination.forEach(card => {
        const seller = card.seller;
        
        // 이미 처리한 판매처는 건너뜀
        if (sourceSellerUpdates[seller]) return;
        
        const currentSubtotal = originalDetails[seller].subtotal;
        
        // 같은 판매처에서 오는 모든 카드의 가격 합산
        const allCardsPrice = combination
          .filter(c => c.seller === seller)
          .reduce((sum, c) => sum + (c.currentPrice * c.quantity), 0);
          
        const newSubtotal = currentSubtotal - allCardsPrice;
        const newShippingFee = newSubtotal > 0 ? 
          (newSubtotal >= sellerShippingInfo[seller].freeShippingThreshold ? 0 : sellerShippingInfo[seller].shippingFee) : 0;
          
        const newTotal = newSubtotal + newShippingFee;
        newSourceTotals += newTotal;
        
        sourceSellerUpdates[seller] = {
          subtotal: newSubtotal,
          shippingFee: newShippingFee,
          total: newTotal
        };
      });
      
      const newTotalCost = newTargetTotal + newSourceTotals;
      
      // 기존 결과보다 나은 경우 저장
      if (
        (newTargetShippingFee === 0 && originalTargetDetails.shippingFee > 0) || // 무료배송 달성
        (newGapDifference < bestGapDifference && newTotalCost <= oldTotalCost) || // 더 가깝고 비용 증가 없음
        (newTotalCost < bestTotalCost) // 전체 비용 감소
      ) {
        bestCombination = combination;
        bestGapDifference = newGapDifference;
        bestTotalCost = newTotalCost;
      }
    }
  }
  
  // 최적 조합 적용
  if (bestCombination.length > 0 && bestTotalCost < Infinity) {
    console.log(`[개선된 탐욕] 다중 카드 조합으로 무료배송 최적화 시도: ${bestCombination.length}개 카드 이동`);
    
    // 판매처별 변경사항 추적
    const sourceUpdates = {};
    
    for (const card of bestCombination) {
      const sourceSellerName = card.seller;
      const sourceSeller = purchaseDetails[sourceSellerName];
      const targetSeller = purchaseDetails[targetSeller];
      
      // 소스 판매처의 원본 상태 백업 (처음에만)
      if (!sourceUpdates[sourceSellerName]) {
        sourceUpdates[sourceSellerName] = {
          cards: [], // 제거할 카드들
          originalSubtotal: sourceSeller.subtotal,
          originalShippingFee: sourceSeller.shippingFee,
          originalTotal: sourceSeller.total,
          newSubtotal: sourceSeller.subtotal,
          removedTotal: 0
        };
      }
      
      // 카드 가격
      const cardPrice = card.currentPrice * card.quantity;
      const targetPrice = card.targetPrice * card.quantity;
      
      // 소스 판매처 업데이트 추적
      sourceUpdates[sourceSellerName].cards.push(card);
      sourceUpdates[sourceSellerName].newSubtotal -= cardPrice;
      sourceUpdates[sourceSellerName].removedTotal += cardPrice;
      
      // 타겟 판매처에 카드 추가
      targetSeller.cards.push({
        cardName: card.cardName,
        price: card.targetPrice,
        product: card.targetProduct,
        quantity: card.quantity
      });
      
      // 타겟 판매처 금액 업데이트
      targetSeller.subtotal += targetPrice;
      
      // 카드별 최적 구매처 정보 업데이트
      const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === card.cardName);
      if (cardPurchaseIndex !== -1) {
        cardsOptimalPurchase[cardPurchaseIndex] = {
          cardName: card.cardName,
          seller: targetSellerName,
          price: card.targetPrice,
          totalPrice: card.targetPrice * card.quantity,
          quantity: card.quantity,
          product: card.targetProduct
        };
      }
      
      console.log(`[개선된 탐욕] 카드 이동: ${card.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${originalCost - newTotalCost}원)`);
    }
    
    // 모든 판매처 업데이트 적용
    Object.entries(sourceUpdates).forEach(([sellerName, update]) => {
      const seller = purchaseDetails[sellerName];
      
      // 카드 제거
      update.cards.forEach(card => {
        const cardIndex = seller.cards.findIndex(c => c.cardName === card.cardName);
        if (cardIndex !== -1) {
          seller.cards.splice(cardIndex, 1);
        }
      });
      
      // 금액 업데이트
      seller.subtotal -= update.removedTotal;
      
      // 배송비 재계산
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[sellerName];
      seller.shippingFee = 
        seller.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
      
      // 총액 업데이트
      seller.total = seller.subtotal + seller.shippingFee;
    });
    
    // 타겟 판매처 배송비 재계산
    const { shippingFee, freeShippingThreshold } = sellerShippingInfo[targetSeller];
    purchaseDetails[targetSeller].shippingFee = 
      purchaseDetails[targetSeller].subtotal >= freeShippingThreshold ? 0 : shippingFee;
    
    // 총액 업데이트
    purchaseDetails[targetSeller].total = 
      purchaseDetails[targetSeller].subtotal + purchaseDetails[targetSeller].shippingFee;
    
    return true;
  }
  
  return false;
}

/**
 * 판매처 통합 최적화 - 판매처 수를 줄이기 위한 시도
 * @param {Object} purchaseDetails - 판매처별 구매 내역
 * @param {Object} sellerShippingInfo - 판매처별 배송비 정보
 * @param {Array} cardsOptimalPurchase - 카드별 최적 구매처 정보
 * @param {Array} cardsList - 카드 목록
 * @returns {boolean} - 최적화 성공 여부
 */
function trySellersConsolidation(purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, cardsList) {
  // 사용 중인 판매처 목록
  const usedSellers = Object.keys(purchaseDetails).filter(seller => 
    purchaseDetails[seller].subtotal > 0
  );
  
  // 판매처가 1-2개만 있으면 통합 불필요
  if (usedSellers.length <= 2) return false;
  
  // 사용중인 판매처 중 구매 금액이 가장 적은 순서로 정렬
  usedSellers.sort((a, b) => 
    purchaseDetails[a].subtotal - purchaseDetails[b].subtotal
  );
  
  // 판매처 통합 시도 - 가장 작은 금액의 판매처부터 다른 판매처로 이동
  let improved = false;
  
  for (const sourceSellerName of usedSellers) {
    const sourceSeller = purchaseDetails[sourceSellerName];
    
    // 이미 비어있으면 건너뜀
    if (sourceSeller.cards.length === 0) continue;
    
    // 이 판매처의 모든 카드를 다른 판매처로 이동할 수 있는지 시뮬레이션
    const potentialMoves = [];
    
    // 각 카드별로 다른 판매처로 이동 시뮬레이션
    for (const card of sourceSeller.cards) {
      // 이 카드가 구매 가능한 다른 판매처 목록
      const cardInfo = cardsList.find(c => c.cardName === card.cardName);
      if (!cardInfo) continue;
      
      cardInfo.products.forEach(product => {
        const targetSellerName = getSellerId(product.site);
        if (targetSellerName === sourceSellerName) return;
        
        // 타겟 판매처가 실제로 사용중인지 확인
        if (!purchaseDetails[targetSellerName] || purchaseDetails[targetSellerName].subtotal === 0) return;
        
        // 이동 비용 계산
        potentialMoves.push({
          cardName: card.cardName,
          sourcePrice: card.price,
          sourceQuantity: card.quantity || 1,
          targetSellerName,
          targetPrice: product.price,
          targetProduct: product,
          priceDifference: (product.price - card.price) * (card.quantity || 1),
          sourceSeller: sourceSellerName
        });
      });
    }
    
    // 가격 차이 순으로 정렬 (가장 적은 가격 차이부터)
    potentialMoves.sort((a, b) => a.priceDifference - b.priceDifference);
    
    // 카드를 같은 판매처로 최대한 이동시키기 위해 판매처별로 그룹화
    const movesByTargetSeller = {};
    potentialMoves.forEach(move => {
      if (!movesByTargetSeller[move.targetSellerName]) {
        movesByTargetSeller[move.targetSellerName] = [];
      }
      movesByTargetSeller[move.targetSellerName].push(move);
    });
    
    // 가장 많은 카드를 이동할 수 있는 판매처 찾기
    let bestTargetSeller = null;
    let bestMovesCount = 0;
    let bestTotalPriceDiff = Infinity;
    
    Object.entries(movesByTargetSeller).forEach(([targetSeller, moves]) => {
      // 이 판매처로 모든 카드 이동 가능한지 확인
      if (moves.length === sourceSeller.cards.length) {
        const totalPriceDiff = moves.reduce((sum, move) => sum + move.priceDifference, 0);
        
        // 최적 이동 대상 선택 (가격 차이 최소화)
        if (bestMovesCount < moves.length || 
            (bestMovesCount === moves.length && totalPriceDiff < bestTotalPriceDiff)) {
          bestTargetSeller = targetSeller;
          bestMovesCount = moves.length;
          bestTotalPriceDiff = totalPriceDiff;
        }
      }
    });
    
    // 모든 카드를 하나의 판매처로 이동할 수 있다면 비용 계산
    if (bestTargetSeller && bestMovesCount === sourceSeller.cards.length) {
      const targetSeller = purchaseDetails[bestTargetSeller];
      const moves = movesByTargetSeller[bestTargetSeller];
      
      // 현재 비용
      const originalSourceTotal = sourceSeller.total;
      const originalTargetTotal = targetSeller.total;
      const originalCost = originalSourceTotal + originalTargetTotal;
      
      // 이동 후 비용 시뮬레이션
      let newTargetSubtotal = targetSeller.subtotal;
      
      // 모든 카드 이동
      for (const move of moves) {
        newTargetSubtotal += move.targetPrice * move.sourceQuantity;
      }
      
      // 새로운 배송비 계산
      const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = 
        sellerShippingInfo[bestTargetSeller];
        
      const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
      
      // 소스 판매처는 비어질 것이므로 비용은 0
      const newTotalCost = newTargetTotal;
      
      // 이동하는 것이 이득이거나 최대 5% 비용 증가만 발생하는 경우 이동
      // (판매처 수 감소는 사용자 편의성 측면에서 약간의 비용 증가를 감수할 가치가 있음)
      const costIncreaseTolerance = originalCost * 0.05; // 5% 허용
      
      if (newTotalCost <= originalCost + costIncreaseTolerance) {
        console.log(`[개선된 탐욕] 판매처 통합: ${sourceSellerName}의 모든 카드(${moves.length}개)를 ${bestTargetSeller}로 이동 (비용 변화: ${newTotalCost - originalCost}원)`);
        
        // 모든 카드 이동 실행
        for (const move of moves) {
          // 소스 판매처에서 카드 제거
          const cardIndex = sourceSeller.cards.findIndex(c => c.cardName === move.cardName);
          if (cardIndex !== -1) {
            sourceSeller.cards.splice(cardIndex, 1);
          }
          
          // 타겟 판매처에 카드 추가
          targetSeller.cards.push({
            cardName: move.cardName,
            price: move.targetPrice,
            product: move.targetProduct,
            quantity: move.sourceQuantity
          });
          
          // 카드별 최적 구매처 정보 업데이트
          const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === move.cardName);
          if (cardPurchaseIndex !== -1) {
            cardsOptimalPurchase[cardPurchaseIndex] = {
              cardName: move.cardName,
              seller: bestTargetSeller,
              price: move.targetPrice,
              totalPrice: move.targetPrice * move.sourceQuantity,
              quantity: move.sourceQuantity,
              product: move.targetProduct
            };
          }
        }
        
        // 판매처 금액 업데이트
        sourceSeller.subtotal = 0;
        sourceSeller.shippingFee = 0;
        sourceSeller.total = 0;
        
        targetSeller.subtotal = newTargetSubtotal;
        targetSeller.shippingFee = newTargetShippingFee;
        targetSeller.total = newTargetTotal;
        
        improved = true;
        break; // 한 번에 하나의 판매처만 통합
      }
    }
  }
  
  return improved;
}

/**
 * 여러 판매처에서 다수의 카드를 동시에 이동하는 복합 최적화 시도
 * 더 복잡한 패턴의 최적화를 찾기 위한 고급 전략
 * 
 * @param {Object} purchaseDetails - 판매처별 구매 내역
 * @param {Object} sellerShippingInfo - 판매처별 배송비 정보
 * @param {Array} cardsOptimalPurchase - 카드별 최적 구매처 정보
 * @param {Array} cardsList - 카드 목록
 * @returns {boolean} - 최적화 성공 여부
 */
function tryComplexOptimization(purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, cardsList) {
  // 사용 중인 판매처 목록
  const usedSellers = Object.keys(purchaseDetails).filter(seller => 
    purchaseDetails[seller].subtotal > 0
  );
  
  // 판매처가 2개 이하면 복잡한 최적화 불필요
  if (usedSellers.length <= 2) return false;
  
  // 배송비를 지불하는 판매처와 지불하지 않는 판매처 구분
  const payingShippingFee = usedSellers.filter(seller => {
    return purchaseDetails[seller].shippingFee > 0;
  });
  
  const freeShippingSellers = usedSellers.filter(seller => {
    return purchaseDetails[seller].shippingFee === 0 && 
           sellerShippingInfo[seller].freeShippingThreshold !== Infinity;
  });
  
  // 배송비 지불 판매처가 없으면 추가 최적화 불필요
  if (payingShippingFee.length === 0) return false;
  
  // 1. 복합 이동 전략: 여러 판매처에서 여러 카드를 동시에 이동
  // 비용이 덜 중요한 카드(저렴한 카드)를 무료배송 임계값에 가까운 판매처로 이동
  
  // 무료배송 임계값 근처에 있는 판매처들 (차이가 5,000원 이내)
  const nearThresholdSellers = payingShippingFee.filter(seller => {
    const { subtotal } = purchaseDetails[seller];
    const { freeShippingThreshold } = sellerShippingInfo[seller];
    return freeShippingThreshold !== Infinity && 
           freeShippingThreshold - subtotal <= 5000 && 
           freeShippingThreshold - subtotal > 0;
  });
  
  if (nearThresholdSellers.length === 0) return false;
  
  // 각 판매처의 모든 카드에 대한 이동 가능성 분석
  let bestMoveSet = null;
  let bestSavings = 0;
  
  // 임계값 근처 판매처들에 대해 최적화
  for (const targetSellerName of nearThresholdSellers) {
    const targetSeller = purchaseDetails[targetSellerName];
    const targetGap = sellerShippingInfo[targetSellerName].freeShippingThreshold - targetSeller.subtotal;
    
    // 다른 판매처의 카드 중에서 이 판매처로 이동 가능한 것들 찾기
    const potentialCards = [];
    
    for (const sourceSellerName of usedSellers) {
      if (sourceSellerName === targetSellerName) continue;
      
      // 이 판매처의 카드들 확인
      const sourceSeller = purchaseDetails[sourceSellerName];
      
      for (const card of sourceSeller.cards) {
        // 타겟 판매처에서도 구매 가능한지 확인
        const cardInfo = cardsList.find(c => c.cardName === card.cardName);
        if (!cardInfo) continue;
        
        const productInTargetSeller = cardInfo.products.find(p => getSellerId(p.site) === targetSellerName);
        if (productInTargetSeller) {
          potentialCards.push({
            cardName: card.cardName,
            quantity: card.quantity || 1,
            sourceSellerName,
            sourcePrice: card.price,
            sourceProduct: card.product,
            targetPrice: productInTargetSeller.price,
            targetProduct: productInTargetSeller,
            priceDifference: (productInTargetSeller.price - card.price) * (card.quantity || 1)
          });
        }
      }
    }
    
    // 가격 차이가 적은 순서로 정렬
    potentialCards.sort((a, b) => a.priceDifference - b.priceDifference);
    
    // 부분집합 합 문제에 대한 근사 해법
    // 최대 5000원 추가 비용 허용하여 무료배송 달성 시도
    const MAX_ADDED_COST = 5000;
    const MAX_CARDS_TO_MOVE = 3; // 한 번에 최대 3개 카드만 이동
    
    // 가능한 모든 1~3카드 조합에 대해 시뮬레이션
    for (let numCards = 1; numCards <= Math.min(MAX_CARDS_TO_MOVE, potentialCards.length); numCards++) {
      // 전체 조합을 생성하는 대신 효율적인 그리디 접근법 사용
      // 가격 차이가 적은 카드들만 고려 (최대 8개)
      const topCards = potentialCards.slice(0, Math.min(8, potentialCards.length));
      const combinations = [];
      
      // 조합 생성 함수 (중복 판매처 카드는 배제)
      function generateCombinations(start, current, count) {
        if (current.length === count) {
          // 동일 판매처에서 너무 많은 카드를 이동하지 않도록 체크
          const sourceCounts = {};
          current.forEach(card => {
            sourceCounts[card.sourceSellerName] = (sourceCounts[card.sourceSellerName] || 0) + 1;
          });
          
          // 한 판매처에서 2개 이상의 카드를 가져오는 경우 제한
          const maxFromOneSeller = Math.max(...Object.values(sourceCounts));
          if (maxFromOneSeller <= 2) {
            combinations.push([...current]);
          }
          return;
        }
        
        for (let i = start; i < topCards.length; i++) {
          current.push(topCards[i]);
          generateCombinations(i + 1, current, count);
          current.pop();
        }
      }
      
      generateCombinations(0, [], numCards);
      
      // 각 조합에 대해 비용 시뮬레이션
      for (const combo of combinations) {
        // 총 가격 차이 및 추가될 금액 계산
        const totalPriceDiff = combo.reduce((sum, card) => sum + card.priceDifference, 0);
        const totalAddition = combo.reduce((sum, card) => sum + card.targetPrice * card.quantity, 0);
        
        // 너무 많은 추가 비용이 발생하면 건너뜀
        if (totalPriceDiff > MAX_ADDED_COST) continue;
        
        // 타겟 판매처의 새 금액이 무료배송 임계값을 넘는지 확인
        const newTargetSubtotal = targetSeller.subtotal + totalAddition;
        
        if (newTargetSubtotal >= sellerShippingInfo[targetSellerName].freeShippingThreshold) {
          // 기존 배송비와 비교하여 절감액 계산
          const savedShippingFee = sellerShippingInfo[targetSellerName].shippingFee;
          
          // 소스 판매처의 배송비 변화 계산
          let sourcesShippingChange = 0;
          const processedSellers = new Set();
          
          for (const card of combo) {
            if (processedSellers.has(card.sourceSellerName)) continue;
            sourcesShippingChange += card.priceDifference;
            processedSellers.add(card.sourceSellerName);
          }
          
          // 소스 판매처들의 새 배송비 계산
          let totalSourceNewShippingFee = 0;
          let totalSourceOldShippingFee = 0;
          
          combo.forEach(card => {
            const seller = card.seller;
            const sourceThreshold = sellerShippingInfo[seller].freeShippingThreshold;
            const sourceShippingFee = sellerShippingInfo[seller].shippingFee;
            
            // 이미 처리한 판매처는 건너뜀
            if (processedSellers.has(seller)) return;
            
            const currentSubtotal = purchaseDetails[seller].subtotal;
            const currentShippingFee = purchaseDetails[seller].shippingFee;
            
            // 같은 판매처에서 오는 모든 카드의 가격 합산
            const allCardsPrice = combo
              .filter(c => c.seller === seller)
              .reduce((sum, c) => sum + (c.currentPrice * c.quantity), 0);
              
            const newSubtotal = currentSubtotal - allCardsPrice;
            const newShippingFee = newSubtotal > 0 ? 
              (newSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
            
            totalSourceOldShippingFee += currentShippingFee;
            totalSourceNewShippingFee += newShippingFee;
            
            // 처리 표시
            processedSellers.add(seller);
          });
          
          // 처리 표시 초기화
          processedSellers.clear();
          
          // 총 비용 변화 계산
          const oldTotalCost = targetSeller.total + 
            combo.reduce((sum, card) => sum + purchaseDetails[card.seller].total, 0);
            
          const newTargetTotal = newTargetSubtotal + totalSourceNewShippingFee;
          
          // 소스 판매처들의 새 총액 계산
          let newSourceTotals = 0;
          const sourceSellerUpdates = {};
          
          combo.forEach(card => {
            const seller = card.seller;
            
            // 이미 처리한 판매처는 건너뜀
            if (sourceSellerUpdates[seller]) return;
            
            const currentSubtotal = purchaseDetails[seller].subtotal;
            
            // 같은 판매처에서 오는 모든 카드의 가격 합산
            const allCardsPrice = combo
              .filter(c => c.seller === seller)
              .reduce((sum, c) => sum + (c.currentPrice * c.quantity), 0);
              
            const newSubtotal = currentSubtotal - allCardsPrice;
            const newShippingFee = newSubtotal > 0 ? 
              (newSubtotal >= sellerShippingInfo[seller].freeShippingThreshold ? 0 : sellerShippingInfo[seller].shippingFee) : 0;
              
            const newTotal = newSubtotal + newShippingFee;
            newSourceTotals += newTotal;
            
            sourceSellerUpdates[seller] = {
              subtotal: newSubtotal,
              shippingFee: newShippingFee,
              total: newTotal
            };
          });
          
          const newTotalCost = newTargetTotal + newSourceTotals;
          
          // 기존 결과보다 나은 경우 저장
          if (
            (totalSourceNewShippingFee === 0 && totalSourceOldShippingFee > 0) || // 무료배송 달성
            (sourcesShippingChange < bestSavings && newTotalCost <= oldTotalCost) || // 더 가깝고 비용 증가 없음
            (newTotalCost < bestTotalCost) // 전체 비용 감소
          ) {
            bestMoveSet = combo;
            bestSavings = sourcesShippingChange;
            bestTotalCost = newTotalCost;
          }
        }
      }
    }
  }
  
  // 최적 조합 적용
  if (bestMoveSet && bestTotalCost < Infinity) {
    console.log(`[개선된 탐욕] 다중 카드 조합으로 무료배송 최적화 시도: ${bestMoveSet.length}개 카드 이동`);
    
    // 판매처별 변경사항 추적
    const sourceUpdates = {};
    
    for (const card of bestMoveSet) {
      const sourceSellerName = card.seller;
      const sourceSeller = purchaseDetails[sourceSellerName];
      const targetSeller = purchaseDetails[targetSeller];
      
      // 소스 판매처의 원본 상태 백업 (처음에만)
      if (!sourceUpdates[sourceSellerName]) {
        sourceUpdates[sourceSellerName] = {
          cards: [], // 제거할 카드들
          originalSubtotal: sourceSeller.subtotal,
          originalShippingFee: sourceSeller.shippingFee,
          originalTotal: sourceSeller.total,
          newSubtotal: sourceSeller.subtotal,
          removedTotal: 0
        };
      }
      
      // 카드 가격
      const cardPrice = card.currentPrice * card.quantity;
      const targetPrice = card.targetPrice * card.quantity;
      
      // 소스 판매처 업데이트 추적
      sourceUpdates[sourceSellerName].cards.push(card);
      sourceUpdates[sourceSellerName].newSubtotal -= cardPrice;
      sourceUpdates[sourceSellerName].removedTotal += cardPrice;
      
      // 타겟 판매처에 카드 추가
      targetSeller.cards.push({
        cardName: card.cardName,
        price: card.targetPrice,
        product: card.targetProduct,
        quantity: card.quantity
      });
      
      // 타겟 판매처 금액 업데이트
      targetSeller.subtotal += targetPrice;
      
      // 카드별 최적 구매처 정보 업데이트
      const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === card.cardName);
      if (cardPurchaseIndex !== -1) {
        cardsOptimalPurchase[cardPurchaseIndex] = {
          cardName: card.cardName,
          seller: targetSellerName,
          price: card.targetPrice,
          totalPrice: card.targetPrice * card.quantity,
          quantity: card.quantity,
          product: card.targetProduct
        };
      }
      
      console.log(`[개선된 탐욕] 카드 이동: ${card.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${originalCost - newTotalCost}원)`);
    }
    
    // 모든 판매처 업데이트 적용
    Object.entries(sourceUpdates).forEach(([sellerName, update]) => {
      const seller = purchaseDetails[sellerName];
      
      // 카드 제거
      update.cards.forEach(card => {
        const cardIndex = seller.cards.findIndex(c => c.cardName === card.cardName);
        if (cardIndex !== -1) {
          seller.cards.splice(cardIndex, 1);
        }
      });
      
      // 금액 업데이트
      seller.subtotal -= update.removedTotal;
      
      // 배송비 재계산
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[sellerName];
      seller.shippingFee = 
        seller.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
      
      // 총액 업데이트
      seller.total = seller.subtotal + seller.shippingFee;
    });
    
    // 타겟 판매처 배송비 재계산
    const { shippingFee, freeShippingThreshold } = sellerShippingInfo[targetSeller];
    purchaseDetails[targetSeller].shippingFee = 
      purchaseDetails[targetSeller].subtotal >= freeShippingThreshold ? 0 : shippingFee;
    
    // 총액 업데이트
    purchaseDetails[targetSeller].total = 
      purchaseDetails[targetSeller].subtotal + purchaseDetails[targetSeller].shippingFee;
    
    return true;
  }
  
  return false;
}

module.exports = {
  findOptimalPurchaseCombination,
  findGreedyOptimalPurchase,
  // 내부 유틸리티 함수도 내보내 테스트 가능하도록 함
  filterTopSellers,
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization
}; 