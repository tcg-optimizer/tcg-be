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
    
    // 각 카드의 상품을 가격순으로 정렬
    const sortedProducts = [...filteredProducts].sort((a, b) => a.price - b.price);
    
    // 이미 포함된 판매처 추적
    const includedSellers = new Set();
    const filteredBySellerProducts = [];
    
    // 상위 N개의 서로 다른 판매처만 선택
    for (const product of sortedProducts) {
      if (!includedSellers.has(product.site) && includedSellers.size < topN) {
        includedSellers.add(product.site);
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
      details.shippingFee = details.subtotal >= freeShippingThreshold ? 0 : shippingFee;
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
             details.shippingFee > 0 && 
             details.subtotal < sellerShippingInfo[seller].freeShippingThreshold;
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
        
        const newSourceShippingFee = newSourceSubtotal > 0 ? 
          (newSourceSubtotal >= sellerShippingInfo[sourceSellerName].freeShippingThreshold ? 0 : sellerShippingInfo[sourceSellerName].shippingFee) : 0;
        const newTargetShippingFee = newTargetSubtotal >= targetThreshold ? 0 : targetShippingFee;
        
        const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
        const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
        const newCost = newSourceTotal + newTargetTotal;
        
        // 비용이 줄어들면 카드 이동
        if (newCost < currentCost) {
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
 * 동적 프로그래밍 기법을 사용한 최적 조합 찾기
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션
 * @returns {Object} - 최적 구매 조합
 */
function findOptimalPurchaseCombinationDP(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  
  // 각 카드별로 상위 5개의 판매처만 고려
  const reducedCardsList = filterTopSellers(cardsList, 5);
  
  // 모든 가능한 판매처 목록
  const allSellers = new Set();
  reducedCardsList.forEach(card => {
    card.products.forEach(product => {
      allSellers.add(product.site);
    });
  });
  const sellersList = Array.from(allSellers);
  
  // DP 상태를 문자열로 인코딩하기 위한 헬퍼 함수
  function encodeState(cardIndex, sellerCounts) {
    return `${cardIndex}:${sellerCounts.join(',')}`;
  }
  
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
          shippingFee: info.jejuShippingFee
        };
        break;
      case 'island':
        sellerShippingInfo[seller] = {
          ...info,
          shippingFee: info.islandShippingFee
        };
        break;
      default:
        sellerShippingInfo[seller] = info;
    }
  });
  
  // DP 메모이제이션 테이블
  const memo = new Map();
  const visitedStates = new Set(); // 방문한 상태 추적
  
  // 재귀적으로 최적 비용 계산
  function findMinCost(cardIndex, sellerAmounts) {
    // 기저 조건: 모든 카드 처리 완료
    if (cardIndex >= reducedCardsList.length) {
      // 각 판매처의 배송비 계산하여 총 비용 반환
      let totalCost = 0;
      sellersList.forEach((seller, i) => {
        const amount = sellerAmounts[i];
        if (amount > 0) {
          const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
          const shippingCost = amount >= freeShippingThreshold ? 0 : shippingFee;
          totalCost += amount + shippingCost;
        }
      });
      return {
        cost: totalCost,
        selections: []
      };
    }
    
    // 현재 상태가 이미 계산되었는지 확인
    const stateKey = encodeState(cardIndex, sellerAmounts);
    if (memo.has(stateKey)) {
      return memo.get(stateKey);
    }
    
    // 방문한 상태로 표시
    visitedStates.add(stateKey);
    
    // 현재 카드
    const currentCard = reducedCardsList[cardIndex];
    const quantity = currentCard.quantity || 1; // 카드 수량 처리
    
    // 가능한 모든 판매처에서 현재 카드를 구매하는 경우 시도
    let minCost = Infinity;
    let bestSelections = [];
    
    for (const product of currentCard.products) {
      const sellerIndex = sellersList.indexOf(product.site);
      if (sellerIndex !== -1) {
        // 선택된 판매처의 금액 업데이트 (수량 고려)
        const newSellerAmounts = [...sellerAmounts];
        newSellerAmounts[sellerIndex] += product.price * quantity;
        
        // 다음 카드로 재귀 호출
        const result = findMinCost(cardIndex + 1, newSellerAmounts);
        
        // 더 나은 결과인지 확인
        if (result.cost < minCost) {
          minCost = result.cost;
          bestSelections = [
            { cardIndex, seller: product.site, product, quantity },
            ...result.selections
          ];
        }
      }
    }
    
    // 결과 저장 및 반환
    const result = {
      cost: minCost,
      selections: bestSelections
    };
    memo.set(stateKey, result);
    return result;
  }
  
  // 초기 호출
  const initialSellerAmounts = Array(sellersList.length).fill(0);
  const result = findMinCost(0, initialSellerAmounts);
  
  console.log(`DP states explored: ${visitedStates.size}`);
  
  // 결과 형식화
  if (result.cost === Infinity) {
    return {
      success: false,
      message: "모든 카드를 구매할 수 있는 조합을 찾지 못했습니다."
    };
  }
  
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
      details.shippingFee = details.subtotal >= freeShippingThreshold ? 0 : shippingFee;
      details.total = details.subtotal + details.shippingFee;
      totalCost += details.total;
      totalProductCost += details.subtotal;
      totalShippingCost += details.shippingFee;
    }
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
  
  // 사용된 판매처 목록
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
 * 원래 알고리즘(모든 가능한 조합 탐색)
 * @param {Array<Object>} cardsList - 카드 목록
 * @returns {Object} - 최적 구매 조합
 */
function findOptimalPurchaseCombinationBruteForce(cardsList) {
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
  
  // 2. 가능한 모든 판매처 조합 생성
  const sellersList = Array.from(uniqueSellers);
  const possibleCombinations = [];
  
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
      const { cardName } = cardInfo;
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
          coveredCards.set(cardName, { seller: bestSeller, price: bestPrice, product: bestProduct });
          
          // 판매처별 구매 내역에 추가
          purchaseDetails[bestSeller].cards.push({
            cardName,
            price: bestPrice,
            product: bestProduct
          });
          
          purchaseDetails[bestSeller].subtotal += bestPrice;
        }
      }
    });
    
    // 모든 카드를 구매할 수 있는 조합인지 확인
    if (coveredCards.size === cardsList.length) {
      // 배송비 계산
      let totalCost = 0;
      
      for (const seller of combination) {
        const { subtotal } = purchaseDetails[seller];
        const { shippingFee, freeShippingThreshold } = getShippingInfo(seller);
        
        // 무료배송 기준 충족 여부에 따라 배송비 추가
        if (subtotal >= freeShippingThreshold) {
          purchaseDetails[seller].shippingFee = 0;
        } else {
          purchaseDetails[seller].shippingFee = shippingFee;
        }
        
        purchaseDetails[seller].total = subtotal + purchaseDetails[seller].shippingFee;
        totalCost += purchaseDetails[seller].total;
      }
      
      validCombinations.push({
        sellers: combination,
        totalCost,
        purchaseDetails
      });
    }
  }
  
  // 4. 유효한 조합 중 최저 비용 조합 선택
  if (validCombinations.length === 0) {
    return {
      success: false,
      message: "모든 카드를 구매할 수 있는 조합을 찾지 못했습니다."
    };
  }
  
  // 총 비용 기준 오름차순 정렬
  validCombinations.sort((a, b) => a.totalCost - b.totalCost);
  
  // 최적 조합 반환
  const optimalCombination = validCombinations[0];
  
  // 각 카드별 최적 구매처 정보 구성
  const cardsOptimalPurchase = [];
  
  cardsList.forEach(cardInfo => {
    const { cardName } = cardInfo;
    let bestSeller = null;
    let bestPrice = Infinity;
    let bestProduct = null;
    
    for (const seller of optimalCombination.sellers) {
      const cards = optimalCombination.purchaseDetails[seller].cards;
      const card = cards.find(c => c.cardName === cardName);
      
      if (card && card.price < bestPrice) {
        bestPrice = card.price;
        bestSeller = seller;
        bestProduct = card.product;
      }
    }
    
    if (bestSeller) {
      cardsOptimalPurchase.push({
        cardName,
        seller: bestSeller,
        price: bestPrice,
        product: bestProduct
      });
    }
  });
  
  return {
    success: true,
    totalCost: optimalCombination.totalCost,
    sellers: optimalCombination.sellers,
    purchaseDetails: optimalCombination.purchaseDetails,
    cardsOptimalPurchase
  };
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
  // 판매처 수 카운트
  const uniqueSellers = new Set();
  cardsList.forEach(card => {
    card.products.forEach(product => {
      uniqueSellers.add(product.site);
    });
  });
  const sellerCount = uniqueSellers.size;
  
  console.log(`카드 수: ${cardsList.length}, 판매처 수: ${sellerCount}`);
  
  // 레어도 조건이 있는 카드 목록 출력
  const cardsWithRarity = cardsList.filter(card => card.desiredRarity);
  if (cardsWithRarity.length > 0) {
    console.log('레어도가 지정된 카드 (지정된 레어도만 구매 가능):');
    cardsWithRarity.forEach(card => {
      console.log(`- ${card.cardName}: ${card.desiredRarity}`);
    });
  }
  
  // 배송 지역 정보 확인
  const shippingRegion = options.shippingRegion || 'default';
  console.log(`배송 지역: ${shippingRegion}`);
  
  // 항상 동적 프로그래밍 알고리즘만 사용
  console.log('동적 프로그래밍 알고리즘 사용');
  return findOptimalPurchaseCombinationDP(cardsList, { shippingRegion });
}

module.exports = {
  findOptimalPurchaseCombination,
  findOptimalPurchaseCombinationBruteForce,
  findOptimalPurchaseCombinationDP,
  findApproximateOptimalPurchase
}; 