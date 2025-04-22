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
    // 기본 상품 목록
    let filteredProducts = card.products;
    
    // 레어도 조건이 있는 경우 해당 조건에 맞는 상품만 필터링
    if (card.desiredRarity) {
      filteredProducts = card.products.filter(product => {
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
      
      // 배송비 비교 (제주 지역 배송비 고려)
      return aInfo.jejuShippingFee - bInfo.jejuShippingFee;
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
 * 판매처별 제품 목록과 판매처 정보 구성
 * @param {Array<Object>} cardsList - 카드 목록
 * @returns {Object} - 판매처 정보
 */
function prepareSellerInfo(cardsList) {
  // 1. 각 판매처별로 구매 가능한 카드 목록을 정리
  const sellerCards = {};
  const uniqueSellers = new Set();
  
  // 각 카드에 대해 판매처별 가격 정보 수집
  cardsList.forEach(cardInfo => {
    const { cardName, products } = cardInfo;
    
    products.forEach(product => {
      const sellerName = product.site;
      uniqueSellers.add(sellerName);
      
      if (!sellerCards[sellerName]) {
        sellerCards[sellerName] = [];
      }
      
      sellerCards[sellerName].push({
        cardName,
        price: product.price,
        productInfo: product
      });
    });
  });
  
  // 모든 판매처 목록
  const sellersList = Array.from(uniqueSellers);
  
  // 각 판매처의 배송비 정보
  const sellerShippingInfo = {};
  sellersList.forEach(seller => {
    sellerShippingInfo[seller] = getShippingInfo(seller);
  });
  
  return { sellersList, sellerCards, sellerShippingInfo, uniqueSellers };
}

/**
 * 휴리스틱 접근법을 사용한 근사 최적해 찾기
 * @param {Array<Object>} cardsList - 카드 목록
 * @returns {Object} - 근사 최적 구매 조합
 */
function findApproximateOptimalPurchase(cardsList) {
  // 각 카드별로 상위 5개의 판매처만 고려
  const reducedCardsList = filterTopSellers(cardsList, 5);
  const { sellersList, sellerCards, sellerShippingInfo } = prepareSellerInfo(reducedCardsList);
  
  // 각 카드를 가장 저렴한 판매처에서 구매하는 것으로 시작
  const initialPurchase = {};
  sellersList.forEach(seller => {
    initialPurchase[seller] = {
      cards: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0
    };
  });
  
  // 각 카드별로 가장 저렴한 판매처 선택
  const cardsOptimalPurchase = [];
  
  reducedCardsList.forEach(cardInfo => {
    const { cardName, products } = cardInfo;
    
    // 가장 저렴한 상품 찾기
    const sortedProducts = [...products].sort((a, b) => a.price - b.price);
    if (sortedProducts.length > 0) {
      const cheapestProduct = sortedProducts[0];
      const seller = cheapestProduct.site;
      
      // 구매 내역에 추가
      initialPurchase[seller].cards.push({
        cardName,
        price: cheapestProduct.price,
        product: cheapestProduct
      });
      
      initialPurchase[seller].subtotal += cheapestProduct.price;
      
      // 카드별 최적 구매처 정보에 추가
      cardsOptimalPurchase.push({
        cardName,
        seller,
        price: cheapestProduct.price,
        product: cheapestProduct
      });
    }
  });
  
  // 배송비 및 총 비용 계산
  let totalCost = 0;
  sellersList.forEach(seller => {
    const details = initialPurchase[seller];
    if (details.subtotal > 0) {
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
      details.shippingFee = details.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
      details.total = details.subtotal + details.shippingFee;
      totalCost += details.total;
    }
  });
  
  // 배송비 최적화 - 배송비를 지불하는 판매처의 카드를 다른 판매처로 이동해 볼까?
  let improved = true;
  let iterations = 0;
  const MAX_ITERATIONS = 100; // 무한 루프 방지
  
  while (improved && iterations < MAX_ITERATIONS) {
    improved = false;
    iterations++;
    
    // 배송비를 지불해야 하는 판매처들 중에서
    // 구매 금액이 가장 작은 판매처를 찾아 그 카드들을 다른 판매처로 이동 시도
    const payingShippingFee = sellersList.filter(seller => {
      const details = initialPurchase[seller];
      return details.subtotal > 0 && 
             (details.shippingFee > 0 || sellerShippingInfo[seller].freeShippingThreshold === Infinity) && 
             (details.subtotal < sellerShippingInfo[seller].freeShippingThreshold || sellerShippingInfo[seller].freeShippingThreshold === Infinity);
    });
    
    if (payingShippingFee.length === 0) break;
    
    // 구매 금액이 가장 작은 판매처
    payingShippingFee.sort((a, b) => initialPurchase[a].subtotal - initialPurchase[b].subtotal);
    const sourceSellerName = payingShippingFee[0];
    const sourceSeller = initialPurchase[sourceSellerName];
    
    // 이 판매처의 카드들을 다른 판매처로 이동해보기
    for (const card of [...sourceSeller.cards]) {
      // 이 카드를 다른 판매처에서 구매할 수 있는지 확인
      const alternativeSellers = sellersList.filter(seller => 
        seller !== sourceSellerName && 
        sellerCards[seller]?.some(sellerCard => sellerCard.cardName === card.cardName)
      );
      
      for (const targetSellerName of alternativeSellers) {
        const targetSeller = initialPurchase[targetSellerName];
        const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = sellerShippingInfo[targetSellerName];
        
        // 이 카드의 대체 상품 찾기
        const alternativeCard = sellerCards[targetSellerName].find(sellerCard => 
          sellerCard.cardName === card.cardName
        );
        
        if (!alternativeCard) continue;
        
        // 현재 비용
        const currentCost = sourceSeller.total + targetSeller.total;
        
        // 카드를 이동했을 때의 비용 시뮬레이션
        const newSourceSubtotal = sourceSeller.subtotal - card.price;
        const newTargetSubtotal = targetSeller.subtotal + alternativeCard.price;
        
        // 새로운 배송비 계산
        const { shippingFee: sourceShippingFee } = sellerShippingInfo[sourceSellerName];
            
        const newSourceShippingFee = newSourceSubtotal > 0 ? 
          (newSourceSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
        // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
        const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
        
        // 현재 비용과 새 비용 비교
        const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
        const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
        const newTotalCost = newSourceTotal + newTargetTotal;
        
        // 비용이 줄어들면 카드 이동
        if (newTotalCost < currentCost) {
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
            cardName: alternativeCard.cardName,
            price: alternativeCard.price,
            product: alternativeCard.productInfo
          });
          targetSeller.subtotal = newTargetSubtotal;
          targetSeller.shippingFee = newTargetShippingFee;
          targetSeller.total = newTargetTotal;
          
          // 카드별 최적 구매처 정보 업데이트
          const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === card.cardName);
          if (cardPurchaseIndex !== -1) {
            cardsOptimalPurchase[cardPurchaseIndex] = {
              cardName: alternativeCard.cardName,
              seller: targetSellerName,
              price: alternativeCard.price,
              product: alternativeCard.productInfo
            };
          }
          
          // 총 비용 업데이트
          totalCost = 0;
          sellersList.forEach(seller => {
            totalCost += initialPurchase[seller].total;
          });
          
          improved = true;
          break;
        }
      }
      
      if (improved) break;
    }
  }
  
  // 사용된 판매처만 필터링
  const usedSellers = sellersList.filter(seller => initialPurchase[seller].subtotal > 0);
  
  // 빈 판매처 제거
  const finalPurchaseDetails = {};
  usedSellers.forEach(seller => {
    finalPurchaseDetails[seller] = initialPurchase[seller];
  });
  
  return {
    success: cardsOptimalPurchase.length === reducedCardsList.length,
    totalCost,
    sellers: usedSellers,
    purchaseDetails: finalPurchaseDetails,
    cardsOptimalPurchase
  };
}

/**
 * 판매처 객체 또는 문자열에서 ID를 추출하는 함수
 * @param {string|Object} seller - 판매처 정보
 * @returns {string} - 판매처 ID
 */
function getSellerId(seller) {
  return typeof seller === 'string' ? seller : (seller.name || seller.id || String(seller));
}

/**
 * 동적 프로그래밍 기법을 사용한 최적 조합 찾기
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션
 * @returns {Object} - 최적 구매 조합
 */
function findOptimalPurchaseCombinationDP(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  const maxSellersPerCard = options.maxSellersPerCard || 30; // 상위 판매처 수 제한
  
  // 각 카드별로 상위 판매처만 고려 (메모리 사용량 감소)
  const reducedCardsList = filterTopSellers(cardsList, maxSellersPerCard);
  
  // 디버그 정보 출력 - 카드별 상품 목록
  console.log(`\n카드별 고려 대상 판매처 (가격 오름차순, 상위 ${maxSellersPerCard}개):`);
  reducedCardsList.forEach(card => {
    console.log(`[${card.cardName}]`);
    card.products.forEach((p, idx) => {
      const sellerId = getSellerId(p.site);
      const info = getShippingInfo(sellerId);
      const shippingFee = shippingRegion === 'jeju' ? info.jejuShippingFee : 
                          shippingRegion === 'island' ? info.islandShippingFee : 
                          info.shippingFee;
      console.log(`  ${idx+1}. ${sellerId}: ${p.price}원 (배송비: ${shippingFee}원, 무료배송: ${info.freeShippingThreshold}원)`);
    });
  });
  
  // 모든 가능한 판매처 목록
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
    // 배송 지역 정보 적용
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
  
  // 메모리 효율을 위한 압축된 상태 인코딩
  function encodeState(cardIndex, sellerAmounts) {
    // 메모리 효율적인 인코딩: 값이 0인 판매처는 생략
    const nonZeroAmounts = [];
    sellerAmounts.forEach((amount, idx) => {
      if (amount > 0) {
        nonZeroAmounts.push(`${idx}:${amount}`);
      }
    });
    return `${cardIndex}|${nonZeroAmounts.join('|')}`;
  }
  
  // 압축된 상태 디코딩
  function decodeState(encodedState) {
    const parts = encodedState.split('|');
    const cardIndex = parseInt(parts[0]);
    const sellerAmounts = Array(sellersList.length).fill(0);
    
    for (let i = 1; i < parts.length; i++) {
      if (parts[i]) {
        const [sellerIdx, amount] = parts[i].split(':').map(Number);
        sellerAmounts[sellerIdx] = amount;
      }
    }
    
    return { cardIndex, sellerAmounts };
  }
  
  // DP 메모이제이션 테이블 - Map 대신 Object 사용
  const memo = {};
  let visitedStatesCount = 0;
  
  // 재귀적으로 최적 비용 계산 - 비재귀 방식으로 최적화
  function findMinCost(startCardIndex, initialSellerAmounts) {
    // 미리 계산해둔 상태를 저장할 스택
    const stack = [{ cardIndex: startCardIndex, sellerAmounts: initialSellerAmounts }];
    // 각 상태의 최적 결과를 저장
    const results = {};
    
    // 기저 상태(모든 카드 처리) 결과 미리 계산
    const baseStateKey = encodeState(reducedCardsList.length, Array(sellersList.length).fill(0));
    results[baseStateKey] = { cost: 0, selections: [] };
    
    // 스택이 비어있을 때까지 처리
    while (stack.length > 0) {
      const { cardIndex, sellerAmounts } = stack.pop();
      const stateKey = encodeState(cardIndex, sellerAmounts);
      
      // 이미 계산된 상태면 건너뜀
      if (results[stateKey]) continue;
      
      // 모든 카드 처리 완료
      if (cardIndex >= reducedCardsList.length) {
        // 각 판매처의 배송비 계산하여 총 비용 반환
        let totalCost = 0;
        sellersList.forEach((seller, i) => {
          const amount = sellerAmounts[i];
          if (amount > 0) {
            const { shippingFee, freeShippingThreshold } = sellerShippingInfo[sellersList[i]];
            // 배송비 계산 - 제주/도서 지역 고려
            const shippingCost = amount >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
            totalCost += amount + shippingCost;
          }
        });
        results[stateKey] = { cost: totalCost, selections: [] };
        continue;
      }
      
      // 현재 카드와 다음 상태를 위한 필요한 값들
      const currentCard = reducedCardsList[cardIndex];
      const quantity = currentCard.quantity || 1;
      let nextStateKeys = [];
      let processed = true;
      
      // 가능한 모든 판매처에서 현재 카드를 구매하는 경우 시도
      for (const product of currentCard.products) {
        const sellerIndex = sellersList.indexOf(getSellerId(product.site));
        if (sellerIndex !== -1) {
          // 선택된 판매처의 금액 업데이트 (수량 고려)
          const newSellerAmounts = [...sellerAmounts];
          newSellerAmounts[sellerIndex] += product.price * quantity;
          
          // 다음 상태 생성
          const nextCardIndex = cardIndex + 1;
          const nextStateKey = encodeState(nextCardIndex, newSellerAmounts);
          
          // 이미 계산된 상태가 아니라면 스택에 추가하고 처리 필요 표시
          if (!results[nextStateKey]) {
            stack.push({ cardIndex: nextCardIndex, sellerAmounts: newSellerAmounts });
            processed = false;
          }
          
          nextStateKeys.push({
            stateKey: nextStateKey,
            seller: getSellerId(product.site),
            product,
            sellerIndex
          });
        }
      }
      
      // 모든 다음 상태가 이미 처리되었는지 확인
      if (!processed) {
        // 아직 처리되지 않은 다음 상태가 있으면 현재 상태도 다시 스택에 넣음
        stack.push({ cardIndex, sellerAmounts });
        continue;
      }
      
      // 최적 비용 계산
      let minCost = Infinity;
      let bestNextStateKey = null;
      let bestSeller = null;
      let bestProduct = null;
      
      for (const { stateKey, seller, product, sellerIndex } of nextStateKeys) {
        const nextResult = results[stateKey];
        if (nextResult && nextResult.cost < minCost) {
          minCost = nextResult.cost;
          bestNextStateKey = stateKey;
          bestSeller = seller;
          bestProduct = product;
        }
      }
      
      // 최적 선택 저장
      if (bestNextStateKey) {
        const nextSelections = results[bestNextStateKey].selections;
        results[stateKey] = {
          cost: minCost,
          selections: [
            { cardIndex, seller: bestSeller, product: bestProduct, quantity },
            ...nextSelections
          ]
        };
      } else {
        // 경우의 수가 없는 경우
        results[stateKey] = { cost: Infinity, selections: [] };
      }
      
      visitedStatesCount++;
      
      // 메모리 관리: 결과 개수가 너무 많아지면 중간 상태 일부 삭제
      if (Object.keys(results).length > 1000000) {
        console.log("메모리 관리: 중간 결과 일부 삭제");
        const keysToKeep = new Set();
        
        // 현재 스택의 상태와 그 다음 상태들만 유지
        stack.forEach(item => {
          const key = encodeState(item.cardIndex, item.sellerAmounts);
          keysToKeep.add(key);
        });
        
        // 결과 정리
        const newResults = {};
        keysToKeep.forEach(key => {
          if (results[key]) newResults[key] = results[key];
        });
        
        // 초기 상태와 최종 상태 유지
        if (results[baseStateKey]) newResults[baseStateKey] = results[baseStateKey];
        
        // 결과 교체
        Object.keys(results).length = 0;
        Object.assign(results, newResults);
      }
    }
    
    // 초기 상태의 결과 반환
    const initialStateKey = encodeState(startCardIndex, initialSellerAmounts);
    return results[initialStateKey] || { cost: Infinity, selections: [] };
  }
  
  // 초기 호출
  console.time('DP 알고리즘 실행 시간');
  const initialSellerAmounts = Array(sellersList.length).fill(0);
  const result = findMinCost(0, initialSellerAmounts);
  console.timeEnd('DP 알고리즘 실행 시간');
  
  console.log(`DP states explored: ${visitedStatesCount}`);
  
  // 결과 형식화
  if (result.cost === Infinity) {
    return {
      success: false,
      message: "모든 카드를 구매할 수 있는 조합을 찾지 못했습니다."
    };
  }
  
  // DP 알고리즘을 통해 찾은 최적 조합 정보 출력
  console.log('\n최적 조합 선택 과정:');
  result.selections.forEach((selection, idx) => {
    console.log(`${idx+1}. ${reducedCardsList[selection.cardIndex].cardName}: ${selection.seller} 에서 ${selection.product.price}원에 ${selection.quantity}장 구매`);
  });
  
  // 판매처별 구매 내역 구성
  const purchaseDetails = {};
  sellersList.forEach(seller => {
    purchaseDetails[seller] = {
      cards: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0
    };
  });
  
  // 선택 정보를 구매 내역으로 변환
  result.selections.forEach(selection => {
    const { cardIndex, seller, product, quantity } = selection;
    const card = reducedCardsList[cardIndex];
    
    purchaseDetails[seller].cards.push({
      cardName: card.cardName,
      price: product.price,
      product,
      quantity
    });
    
    purchaseDetails[seller].subtotal += product.price * quantity;
  });
  
  // 각 판매처의 배송비 및 총 비용 계산
  let totalCost = 0;
  let totalProductCost = 0;
  let totalShippingCost = 0;
  
  sellersList.forEach(seller => {
    const details = purchaseDetails[seller];
    if (details.subtotal > 0) {
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
      // 최종 배송비 계산 (제주/도서 지역 고려)
      details.shippingFee = details.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
      details.total = details.subtotal + details.shippingFee;
      totalCost += details.total;
      totalProductCost += details.subtotal;
      totalShippingCost += details.shippingFee;
    }
  });
  
  // 사용된 판매처 목록
  const usedSellers = sellersList.filter(seller => purchaseDetails[seller].subtotal > 0);
  
  // 빈 판매처 제거
  const finalPurchaseDetails = {};
  usedSellers.forEach(seller => {
    finalPurchaseDetails[seller] = purchaseDetails[seller];
  });
  
  // 카드별 최적 구매처 정보
  const cardsOptimalPurchase = result.selections.map(selection => {
    const { cardIndex, seller, product, quantity } = selection;
    return {
      cardName: reducedCardsList[cardIndex].cardName,
      seller,
      price: product.price,
      totalPrice: product.price * quantity,
      quantity,
      product
    };
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
  
  // 전체 판매처에서 구매 시 비용 계산
  console.log("\n단일 판매처에서 모두 구매 시 총 비용:");
  const singleSellerCosts = [];
  
  sellersList.forEach(seller => {
    let allCardsAvailable = true;
    let totalProductCost = 0;
    
    // 이 판매처에서 모든 카드를 구매할 수 있는지 확인
    for (const card of reducedCardsList) {
      const productFromSeller = card.products.find(p => getSellerId(p.site) === seller);
      if (!productFromSeller) {
        allCardsAvailable = false;
        break;
      }
      totalProductCost += productFromSeller.price * (card.quantity || 1);
    }
    
    if (allCardsAvailable) {
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
      const finalShippingFee = totalProductCost >= freeShippingThreshold ? 0 : shippingFee;
      const totalCost = totalProductCost + finalShippingFee;
      
      singleSellerCosts.push({
        seller,
        productCost: totalProductCost,
        shippingFee: finalShippingFee, 
        totalCost
      });
      
      console.log(`- ${seller}: 상품 ${totalProductCost.toLocaleString()}원 + 배송비 ${finalShippingFee.toLocaleString()}원 = ${totalCost.toLocaleString()}원`);
    }
  });
  
  // 단일 판매처 최적 조합이 있으면 DP 결과와 비교
  if (singleSellerCosts.length > 0) {
    singleSellerCosts.sort((a, b) => a.totalCost - b.totalCost);
    const bestSingleSeller = singleSellerCosts[0];
    
    if (bestSingleSeller.totalCost < result.cost) {
      console.log(`\n단일 판매처(${bestSingleSeller.seller})에서 구매가 더 저렴합니다: ${bestSingleSeller.totalCost.toLocaleString()}원 vs DP 결과 ${result.cost.toLocaleString()}원`);
      
      // 단일 판매처 구매 내역 구성
      const singleSellerPurchaseDetails = {};
      singleSellerPurchaseDetails[bestSingleSeller.seller] = {
        cards: [],
        subtotal: 0,
        shippingFee: bestSingleSeller.shippingFee,
        total: bestSingleSeller.totalCost
      };
      
      const selections = [];
      for (let i = 0; i < reducedCardsList.length; i++) {
        const card = reducedCardsList[i];
        const product = card.products.find(p => getSellerId(p.site) === bestSingleSeller.seller);
        const quantity = card.quantity || 1;
        
        singleSellerPurchaseDetails[bestSingleSeller.seller].cards.push({
          cardName: card.cardName,
          price: product.price,
          product,
          quantity
        });
        
        singleSellerPurchaseDetails[bestSingleSeller.seller].subtotal += product.price * quantity;
        
        selections.push({
          cardIndex: i,
          seller: bestSingleSeller.seller,
          product,
          quantity
        });
      }
      
      // 단일 판매처 결과 반환
      return {
        success: true,
        totalCost: bestSingleSeller.totalCost,
        totalProductCost: bestSingleSeller.productCost,
        totalShippingCost: bestSingleSeller.shippingFee,
        sellers: [bestSingleSeller.seller],
        purchaseDetails: singleSellerPurchaseDetails,
        cardsOptimalPurchase: selections.map(selection => {
          const { cardIndex, seller, product, quantity } = selection;
          return {
            cardName: reducedCardsList[cardIndex].cardName,
            seller,
            price: product.price,
            totalPrice: product.price * quantity,
            quantity,
            product
          };
        }),
        shippingRegion
      };
    }
  }
  
  return {
    success: true,
    totalCost,
    totalShippingCost,
    totalProductCost,
    shippingRegion: options.shippingRegion || 'default',
    sellers,
    purchaseDetails: finalPurchaseDetails,
    cardsOptimalPurchase
  };
}

/**
 * 완전 탐색을 통해 최적 구매 조합을 찾는 함수
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션 (배송 지역 등)
 * @returns {Object} - 최적 구매 조합
 */
function findOptimalPurchaseCombinationBruteForce(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  console.log('[브루트포스] 최적 조합 찾기 시작...');
  console.log(`배송 지역: ${shippingRegion}`);
  
  // 1. 각 판매처별로 구매 가능한 카드 목록을 정리
  const sellerCards = {};
  const uniqueSellers = new Set();
  
  // 각 카드에 대해 판매처별 가격 정보 수집
  cardsList.forEach(cardInfo => {
    const { cardName, products, quantity = 1 } = cardInfo;  // 수량 정보 추가
    
    products.forEach(product => {
      const sellerName = getSellerId(product.site);
      uniqueSellers.add(sellerName);
      
      if (!sellerCards[sellerName]) {
        sellerCards[sellerName] = [];
      }
      
      sellerCards[sellerName].push({
        cardName,
        price: product.price,
        productInfo: product,
        quantity // 수량 정보 추가
      });
    });
  });
  
  // 2. 가능한 모든 판매처 조합 생성
  const sellersList = Array.from(uniqueSellers);
  const possibleCombinations = [];
  
  console.log(`[브루트포스] ${sellersList.length}개의 판매처에서 가능한 조합 계산 중...`);
  
  // 파워셋(모든 부분집합) 생성 - 2^n 조합
  for (let i = 1; i < (1 << sellersList.length); i++) {
    const combination = [];
    for (let j = 0; j < sellersList.length; j++) {
      if (i & (1 << j)) {
        combination.push(sellersList[j]);
      }
    }
    possibleCombinations.push(combination);
  }
  
  console.log(`[브루트포스] 총 ${possibleCombinations.length}개의 조합 생성 완료`);
  
  // 3. 각 조합이 모든 카드를 포함하는지 확인하고 총 비용 계산
  const validCombinations = [];
  
  for (const combination of possibleCombinations) {
    // 이 조합으로 구매 가능한 카드 목록
    const coveredCards = new Map();
    const purchaseDetails = {};
    
    // 각 판매처별 구매 금액
    combination.forEach(seller => {
      purchaseDetails[seller] = {
        cards: [],
        subtotal: 0,
        shippingFee: 0,
        total: 0
      };
    });
    
    // 각 카드에 대해 이 조합 내에서 최저가 판매처 선택
    cardsList.forEach(cardInfo => {
      const { cardName, quantity = 1 } = cardInfo;  // 수량 정보 추가
      let bestPrice = Infinity;
      let bestSeller = null;
      let bestProduct = null;
      
      // 이 조합 내 판매처들 중 최저가 찾기
      combination.forEach(seller => {
        const sellerCardList = sellerCards[seller] || [];
        const cardFromSeller = sellerCardList.find(card => card.cardName === cardName);
        
        if (cardFromSeller && cardFromSeller.price < bestPrice) {
          bestPrice = cardFromSeller.price;
          bestSeller = seller;
          bestProduct = cardFromSeller.productInfo;
        }
      });
      
      // 이 카드를 판매하는 판매처를 찾았으면 추가
      if (bestSeller) {
        if (!coveredCards.has(cardName)) {
          coveredCards.set(cardName, { 
            seller: bestSeller, 
            price: bestPrice, 
            product: bestProduct,
            quantity // 수량 정보 추가
          });
          
          // 판매처별 구매 내역에 추가 (수량 곱하기)
          purchaseDetails[bestSeller].cards.push({
            cardName,
            price: bestPrice,
            product: bestProduct,
            quantity
          });
          
          purchaseDetails[bestSeller].subtotal += bestPrice * quantity;  // 수량 반영
        }
      }
    });
    
    // 모든 카드를 구매할 수 있는 조합인지 확인
    if (coveredCards.size === cardsList.length) {
      // 배송비 계산
      let totalCost = 0;
      let totalProductCost = 0;
      let totalShippingCost = 0;
      
      for (const seller of combination) {
        const { subtotal } = purchaseDetails[seller];
        const info = getShippingInfo(seller);
        
        // 배송 지역에 따른 배송비 설정
        const { shippingFee, freeShippingThreshold, jejuShippingFee, islandShippingFee } = info;
        
        // 지역에 따른 배송비 선택
        let appliedShippingFee = shippingFee;
        if (shippingRegion === 'jeju' && jejuShippingFee !== undefined) {
          appliedShippingFee = jejuShippingFee;
        } else if (shippingRegion === 'island' && islandShippingFee !== undefined) {
          appliedShippingFee = islandShippingFee;
        }
        
        // 무료배송 기준 충족 여부에 따라 배송비 추가
        if (subtotal >= freeShippingThreshold) {
          purchaseDetails[seller].shippingFee = 0;
        } else {
          purchaseDetails[seller].shippingFee = appliedShippingFee;
        }
        
        purchaseDetails[seller].total = subtotal + purchaseDetails[seller].shippingFee;
        totalCost += purchaseDetails[seller].total;
        totalProductCost += subtotal;
        totalShippingCost += purchaseDetails[seller].shippingFee;
      }
      
      validCombinations.push({
        sellers: combination,
        totalCost,
        totalProductCost,
        totalShippingCost,
        purchaseDetails
      });
    }
  }
  
  // 4. 유효한 조합 중 최저 비용 조합 선택
  if (validCombinations.length === 0) {
    console.log('[브루트포스] 모든 카드를 구매할 수 있는 조합을 찾지 못했습니다.');
    return {
      success: false,
      message: "모든 카드를 구매할 수 있는 조합을 찾지 못했습니다."
    };
  }
  
  console.log(`[브루트포스] ${validCombinations.length}개의 유효한 조합 발견`);
  
  // 총 비용 기준 오름차순 정렬
  validCombinations.sort((a, b) => a.totalCost - b.totalCost);
  
  // 최적 조합 반환
  const optimalCombination = validCombinations[0];
  
  // 각 카드별 최적 구매처 정보 구성
  const cardsOptimalPurchase = [];
  
  cardsList.forEach(cardInfo => {
    const { cardName, quantity = 1 } = cardInfo;
    let bestSeller = null;
    let bestProduct = null;
    let lowestTotalCost = Infinity;
    
    // 각 판매처별로 이 카드를 추가했을 때의 총 비용 계산
    cardInfo.products.forEach(product => {
      const seller = getSellerId(product.site);
      const currentSubtotal = purchaseDetails[seller].subtotal;
      const newSubtotal = currentSubtotal + (product.price * quantity);
      
      // 배송비 계산
      const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
      const currentShippingFee = purchaseDetails[seller].shippingFee;
      const newShippingFee = newSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
      
      // 이 카드를 이 판매처에 추가했을 때의 총 비용 변화
      const costDifference = (product.price * quantity) + (newShippingFee - currentShippingFee);
      
      // 새 판매처 페널티 부분 제거 - 실제 비용만 고려
      const totalCostWithPenalty = costDifference;
      
      if (totalCostWithPenalty < lowestTotalCost) {
        lowestTotalCost = totalCostWithPenalty;
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
  
  console.log('[브루트포스] 최적 조합 찾기 완료');
  console.log(`총 비용: ${optimalCombination.totalCost}원 (상품: ${optimalCombination.totalProductCost}원, 배송: ${optimalCombination.totalShippingCost}원)`);
  
  return {
    success: true,
    totalCost: optimalCombination.totalCost,
    totalProductCost: optimalCombination.totalProductCost,
    totalShippingCost: optimalCombination.totalShippingCost,
    sellers: optimalCombination.sellers,
    purchaseDetails: optimalCombination.purchaseDetails,
    cardsOptimalPurchase
  };
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
  
  // 각 카드별로 상위 30개의 판매처만 고려 (성능/품질 트레이드오프 조절 가능)
  const reducedCardsList = filterTopSellers(cardsList, 30);
  
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
  
  // 카드 정렬 - 가격이 높은 카드부터 처리 (중요한 카드부터 최적 배치)
  const sortedCards = [...reducedCardsList].sort((a, b) => {
    const aMinPrice = Math.min(...a.products.map(p => p.price));
    const bMinPrice = Math.min(...b.products.map(p => p.price));
    return bMinPrice - aMinPrice; // 내림차순 정렬
  });
  
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
      
      // 새 판매처 페널티 부분 제거 - 실제 비용만 고려
      const totalCostWithPenalty = costDifference;
      
      if (totalCostWithPenalty < lowestTotalCost) {
        lowestTotalCost = totalCostWithPenalty;
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
  const MAX_ITERATIONS = 20;
  
  while (improved && iterations < MAX_ITERATIONS) {
    improved = false;
    iterations++;
    
    console.log(`[개선된 탐욕] 최적화 반복 #${iterations}`);
    
    // 배송비를 지불하는 판매처 목록
    const payingShippingFee = sellersList.filter(seller => {
      const details = purchaseDetails[seller];
      return details.subtotal > 0 && 
             (details.shippingFee > 0 || sellerShippingInfo[seller].freeShippingThreshold === Infinity) && 
             (details.subtotal < sellerShippingInfo[seller].freeShippingThreshold || sellerShippingInfo[seller].freeShippingThreshold === Infinity);
    });
    
    // 배송비 지불 판매처가 없으면 종료
    if (payingShippingFee.length === 0) {
      console.log('[개선된 탐욕] 더 이상 배송비를 지불하는 판매처가 없습니다.');
      break;
    }
    
    // 2.1. 배송비 면제 임계값에 가장 가까운 판매처부터 처리 (효율적 최적화)
    payingShippingFee.sort((a, b) => {
      const aGap = sellerShippingInfo[a].freeShippingThreshold - purchaseDetails[a].subtotal;
      const bGap = sellerShippingInfo[b].freeShippingThreshold - purchaseDetails[b].subtotal;
      return aGap - bGap;  // 면제 임계값에 가까운 순서로 정렬
    });
    
    for (const sourceSellerName of payingShippingFee) {
      const sourceSeller = purchaseDetails[sourceSellerName];
      const sourceThreshold = sellerShippingInfo[sourceSellerName].freeShippingThreshold;
      const gapToThreshold = sourceThreshold - sourceSeller.subtotal;
      
      // 임계값 달성이 쉬울 경우(5000원 이내), 다른 판매처에서 상품 이동 시도
      if (gapToThreshold <= 5000) {
        // 다른 판매처에서 이 판매처로 상품 이동 시도 (무료배송 달성)
        let foundImprovement = tryMoveCardsToReachThreshold(
          sourceSellerName, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
        );
        
        if (foundImprovement) {
          improved = true;
          continue;
        }
      }
      
      // 이 판매처의 상품을 다른 판매처로 이동 시도 (판매처 통합)
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
        
        // 가격 순으로 정렬
        alternatives.sort((a, b) => a.price - b.price);
        
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
          if (newTotalCost < originalCost) {
            console.log(`[개선된 탐욕] 무료배송 달성을 위한 카드 이동: ${card.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${originalCost - newTotalCost}원)`);
            
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
  
  console.log(`[개선된 탐욕] 결과 - 총비용: ${totalCost.toLocaleString()}원, 판매처: ${usedSellers.length}개`);
  
  return {
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
      // 이동 시 비용 효과 계산
      const newSourceSubtotal = sourceSeller.subtotal - cardPrice;
      const newTargetSubtotal = purchaseDetails[targetSeller].subtotal + targetPrice;
      
      // 새로운 배송비 계산
      const { shippingFee: sourceShippingFee } = sellerShippingInfo[sourceSellerName];
      const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = 
        sellerShippingInfo[targetSellerName];
            
      const newSourceShippingFee = newSourceSubtotal > 0 ? 
        (newSourceSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
      // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
      const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
      
      // 현재 비용과 새 비용 비교
      const currentTotalCost = sourceSeller.total + purchaseDetails[targetSeller].total;
      const originalCost = currentTotalCost;
      const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
      const newTotalCost = newSourceTotal + newTargetTotal;
      
      // 비용이 줄어들면 카드 이동
      if (newTotalCost < originalCost) {
        console.log(`[개선된 탐욕] 무료배송 달성을 위한 카드 이동: ${candidate.cardName} - ${sourceSellerName} → ${targetSellerName} (비용 절감: ${originalCost - newTotalCost}원)`);
        
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
 * 카드 구매의 최적 조합을 찾는 함수
 * 카드 수와 판매처 수에 따라 자동으로 알고리즘 선택
 * 
 * @param {Array<Object>} cardsList - 각 카드의 구매 가능한 상품 목록
 * @param {Object} options - 알고리즘 선택 옵션
 * @returns {Object} - 최적 구매 조합 정보
 */
function findOptimalPurchaseCombination(cardsList, options = {}) {
  console.log("사용 알고리즘:", options.algorithm || 'greedy');
  
  // 알고리즘 선택
  switch (options.algorithm) {
    case 'bruteforce':
      // 브루트포스 알고리즘
      return findOptimalPurchaseCombinationBruteForce(cardsList, options);
    case 'dp':
      // DP 알고리즘 (주석 처리되어 사용 안함)
      console.log("DP 알고리즘은 더 이상 사용되지 않습니다. 그리디 알고리즘으로 대체합니다.");
      return findGreedyOptimalPurchase(cardsList, options);
    default:
      // 기본 알고리즘: 그리디
      return findGreedyOptimalPurchase(cardsList, options);
  }
}

module.exports = {
  findOptimalPurchaseCombination,
  findOptimalPurchaseCombinationBruteForce,
  findOptimalPurchaseCombinationDP,
  findApproximateOptimalPurchase,
  findGreedyOptimalPurchase
}; 