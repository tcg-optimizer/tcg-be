const { getShippingInfo, calculateShippingFee, REGION_TYPES } = require('../shippingInfo');
const { getSellerId } = require('./cardUtils');
const { calculatePointsAmount } = require('./pointsUtils');
const {
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
} = require('./optimizationStrategies');


function generateFreeShippingCombinations(
  sortedCards,
  seller,
  freeShippingThreshold,
  pointsOptions,
  sellerShippingInfo
) {
  const availableCards = sortedCards.filter(card =>
    card.products.some(p => getSellerId(p.site) === seller)
  );

  const cardsWithPrice = availableCards.map(card => {
    const product = card.products.find(p => getSellerId(p.site) === seller);
    const availablePrices = card.products.map(p => p.price);
    const minPriceAcrossAllSellers =
      availablePrices.length > 0 ? Math.min(...availablePrices) : product.price;

    return {
      card,
      product,
      price: product.price,
      quantity: card.quantity || 1,
      totalPrice: product.price * (card.quantity || 1),
      priceDifference: product.price - minPriceAcrossAllSellers,
    };
  });

  // 다이나믹 프로그래밍으로 무료배송 조건을 만족하는 조합 찾기 -> 배낭 문제와 유사하게 접근
  const combinations = [];
  const MAX_COMBINATIONS = 50;

  // 가격별로 정렬
  cardsWithPrice.sort((a, b) => a.priceDifference - b.priceDifference);

  // 재귀적으로 조합 생성 (백트래킹)
  function findCombinations(current, startIdx, currentSum) {
    if (currentSum >= freeShippingThreshold) {
      combinations.push([...current]);
      return combinations.length >= MAX_COMBINATIONS;
    }

    if (combinations.length >= MAX_COMBINATIONS) {
      return true;
    }

    for (let i = startIdx; i < cardsWithPrice.length; i++) {
      current.push(cardsWithPrice[i]);
      const shouldStop = findCombinations(
        current,
        i + 1,
        currentSum + cardsWithPrice[i].totalPrice
      );
      current.pop();

      if (shouldStop) return true;
    }

    return false;
  }

  findCombinations([], 0, 0);

  // 효율성 점수 계산
  combinations.forEach(combo => {
    const totalPrice = combo.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalPriceDifference = combo.reduce((sum, item) => sum + item.priceDifference, 0);

    // 효율성 점수 = 총 가격 + (가격 차이의 2배) - 절약된 배송비
    combo.efficiencyScore =
      totalPrice + totalPriceDifference * 2 - sellerShippingInfo[seller].shippingFee;
  });

  combinations.sort((a, b) => a.efficiencyScore - b.efficiencyScore);

  return combinations;
}


function findGreedyOptimalPurchase(cardsList, options = {}) {
  const shippingRegion = options.shippingRegion || 'default';
  const pointsOptions = options.pointsOptions || {
    tcgshop: false,
    carddc: false,
    naverBasic: false,
    naverBankbook: false,
    naverMembership: false,
    naverHyundaiCard: false,
  };

  const MAX_ITERATIONS = 100;

  const sortingStrategies = [
    // 1. 가격이 높은 카드부터 처리
    cards =>
      [...cards].sort((a, b) => {
        const aMinPrice = Math.min(...a.products.map(p => p.price));
        const bMinPrice = Math.min(...b.products.map(p => p.price));
        return bMinPrice - aMinPrice;
      }),
    // 2. 가격이 낮은 카드부터 처리
    cards =>
      [...cards].sort((a, b) => {
        const aMinPrice = Math.min(...a.products.map(p => p.price));
        const bMinPrice = Math.min(...b.products.map(p => p.price));
        return aMinPrice - bMinPrice;
      }),
    // 3. 가격 차이가 큰 카드부터 처리
    cards =>
      [...cards].sort((a, b) => {
        const aPrices = a.products.map(p => p.price);
        const bPrices = b.products.map(p => p.price);
        const aDiff = Math.max(...aPrices) - Math.min(...aPrices);
        const bDiff = Math.max(...bPrices) - Math.min(...bPrices);
        return bDiff - aDiff;
      }),
  ];

  const maxSellersPerCard = 30;

  const excludedStores = options.excludedStores || [];
  const excludedProductIds = options.excludedProductIds || [];

  const reducedCardsList = require('./cardUtils').filterTopSellers(cardsList, {
    maxSellersPerCard,
    excludedStores,
    excludedProductIds,
  });

  const allSellers = new Set();
  reducedCardsList.forEach(card => {
    card.products.forEach(product => {
      const sellerId = getSellerId(product.site);
      if (!excludedStores.includes(sellerId)) {
        allSellers.add(sellerId);
      }
    });
  });
  const sellersList = Array.from(allSellers);

  const sellerShippingInfo = {};

  const regionType =
    shippingRegion === 'jeju'
      ? REGION_TYPES.JEJU
      : shippingRegion === 'island'
        ? REGION_TYPES.ISLAND
        : REGION_TYPES.DEFAULT;

  const takeoutOptions = options.takeout || [];

  sellersList.forEach(seller => {
    sellerShippingInfo[seller] = getShippingInfo(seller);
  });

  const reviewedProducts = new Set();

  let bestSolution = null;
  let bestCost = Infinity;

  for (let strategyIndex = 0; strategyIndex < sortingStrategies.length; strategyIndex++) {
    const sortedCards = sortingStrategies[strategyIndex](reducedCardsList);

    // 리뷰 제품 목록 초기화
    reviewedProducts.clear();

    const freeShippingCombinationsBySeller = {};

    sellersList.forEach(seller => {
      const { freeShippingThreshold } = sellerShippingInfo[seller];

      if (freeShippingThreshold !== Infinity && freeShippingThreshold > 0) {
        const combinations = generateFreeShippingCombinations(
          sortedCards,
          seller,
          freeShippingThreshold,
          pointsOptions,
          sellerShippingInfo
        );

        if (combinations.length > 0) {
          freeShippingCombinationsBySeller[seller] = combinations;
        }
      }
    });

    const purchaseDetails = {};
    sellersList.forEach(seller => {
      purchaseDetails[seller] = {
        cards: [],
        subtotal: 0,
        shippingFee: 0,
        total: 0,
        points: 0,
      };
    });

    const cardsOptimalPurchase = [];

    const assignedCards = new Set();
    const freeShippingSellersSorted = Object.keys(freeShippingCombinationsBySeller).sort((a, b) => {
      return sellerShippingInfo[b].shippingFee - sellerShippingInfo[a].shippingFee;
    });

    const efficientCombinations = [];

    for (const seller of freeShippingSellersSorted) {
      const combinations = freeShippingCombinationsBySeller[seller];
      const shippingFee = sellerShippingInfo[seller].shippingFee;

      for (const combo of combinations) {
        let totalMinPriceElsewhere = 0;
        let totalPriceInThisSeller = 0;
        let canUseAllCards = true;

        for (const item of combo) {
          // 같은 카드의 다른 판매처 최저가 찾기
          const cardInfo = sortedCards.find(
            c => (c.uniqueCardKey || c.cardName) === (item.card.uniqueCardKey || item.card.cardName)
          );

          if (!cardInfo) {
            canUseAllCards = false;
            break;
          }

          const otherProducts = cardInfo.products.filter(p => getSellerId(p.site) !== seller);

          if (otherProducts.length === 0) {
            // 다른 판매처에서 구매할 수 없는 카드라면 이 조합은 반드시 필요
            totalMinPriceElsewhere += Infinity;
          } else {
            const minPriceElsewhere = Math.min(...otherProducts.map(p => p.price)) * item.quantity;
            totalMinPriceElsewhere += minPriceElsewhere;
          }

          totalPriceInThisSeller += item.totalPrice;
        }

        if (canUseAllCards && totalMinPriceElsewhere !== Infinity) {
          const calculatedSavings = shippingFee - (totalPriceInThisSeller - totalMinPriceElsewhere);

          if (calculatedSavings > 0) {
            efficientCombinations.push({
              seller,
              combo,
              savings: calculatedSavings,
              totalPrice: totalPriceInThisSeller,
              totalMinPriceElsewhere,
            });
          }
        }
      }
    }

    efficientCombinations.sort((a, b) => b.savings - a.savings);

    // efficientCombinations 적용 - 무료배송 조합이 이득인 경우 적용
    for (const efficient of efficientCombinations) {
      const { seller, combo, savings } = efficient;
      
      // 이미 할당된 카드가 있으면 스킵
      const hasAssignedCard = combo.some(item => 
        assignedCards.has(item.card.uniqueCardKey || item.card.cardName)
      );
      if (hasAssignedCard) continue;
      
      // savings가 양수이면 이 조합을 적용
      if (savings > 0) {
        for (const item of combo) {
          const { card, product, price, quantity } = item;
          const cardKey = card.uniqueCardKey || card.cardName;
          const productId = cardKey;
          
          const earnablePoints = calculatePointsAmount(
            seller,
            price,
            quantity,
            productId,
            reviewedProducts,
            pointsOptions
          );
          
          purchaseDetails[seller].cards.push({
            cardName: card.cardName,
            uniqueCardKey: cardKey,
            price,
            product,
            quantity,
            points: earnablePoints,
          });
          
          purchaseDetails[seller].subtotal += price * quantity;
          purchaseDetails[seller].points += earnablePoints;
          
          cardsOptimalPurchase.push({
            cardName: card.cardName,
            uniqueCardKey: cardKey,
            seller,
            price,
            totalPrice: price * quantity,
            quantity,
            points: earnablePoints,
            product,
            cardId: product.cardId,
            rarity: product.rarity,
            language: product.language,
            illustration: product.illustration || 'default',
            url: product.url,
            site: product.site,
            available: product.available,
            cardCode: product.cardCode,
            condition: product.condition,
          });
          
          assignedCards.add(cardKey);
        }
        
        // 배송비 업데이트
        purchaseDetails[seller].shippingFee = calculateShippingFee(
          seller,
          regionType,
          purchaseDetails[seller].subtotal,
          takeoutOptions
        );
        purchaseDetails[seller].total =
          purchaseDetails[seller].subtotal +
          purchaseDetails[seller].shippingFee -
          purchaseDetails[seller].points;
      }
    }

    // 아직 할당되지 않은 카드는 일반 그리디 방식으로 할당
    const remainingCards = sortedCards.filter(
      card => !assignedCards.has(card.uniqueCardKey || card.cardName)
    );

    remainingCards.forEach(cardInfo => {
      const { cardName, products, quantity = 1 } = cardInfo;
      const uniqueCardKey = cardInfo.uniqueCardKey || cardName;
      let bestSeller = null;
      let bestProduct = null;
      let lowestTotalCost = Infinity;
      let bestPointsEarned = 0;
      const productId = uniqueCardKey;

      products.forEach(product => {
        const seller = getSellerId(product.site);
        const currentSubtotal = purchaseDetails[seller].subtotal;
        const newSubtotal = currentSubtotal + product.price * quantity;

        const currentShippingFee = purchaseDetails[seller].shippingFee;
        const newShippingFee = calculateShippingFee(
          seller,
          regionType,
          newSubtotal,
          takeoutOptions
        );

        const earnablePoints = calculatePointsAmount(
          seller,
          product.price,
          quantity,
          productId,
          new Set(reviewedProducts),
          pointsOptions
        );

        const costDifference =
          product.price * quantity + (newShippingFee - currentShippingFee) - earnablePoints;

        if (
          costDifference < lowestTotalCost ||
          (costDifference === lowestTotalCost && earnablePoints > bestPointsEarned)
        ) {
          lowestTotalCost = costDifference;
          bestSeller = seller;
          bestProduct = product;
          bestPointsEarned = earnablePoints;
        }
      });

      if (bestSeller && bestProduct) {
        const cardPrice = bestProduct.price * quantity;

        const earnablePoints = calculatePointsAmount(
          bestSeller,
          bestProduct.price,
          quantity,
          productId,
          reviewedProducts,
          pointsOptions
        );

        purchaseDetails[bestSeller].cards.push({
          cardName,
          uniqueCardKey,
          price: bestProduct.price,
          product: bestProduct,
          quantity,
          points: earnablePoints,
        });

        purchaseDetails[bestSeller].subtotal += cardPrice;
        purchaseDetails[bestSeller].points += earnablePoints;

        purchaseDetails[bestSeller].shippingFee = calculateShippingFee(
          bestSeller,
          regionType,
          purchaseDetails[bestSeller].subtotal,
          takeoutOptions
        );

        purchaseDetails[bestSeller].total =
          purchaseDetails[bestSeller].subtotal +
          purchaseDetails[bestSeller].shippingFee -
          purchaseDetails[bestSeller].points;

        cardsOptimalPurchase.push({
          cardName,
          uniqueCardKey,
          seller: bestSeller,
          price: bestProduct.price,
          totalPrice: bestProduct.price * quantity,
          quantity,
          points: earnablePoints,
          product: bestProduct,
          cardId: bestProduct.cardId,
          rarity: bestProduct.rarity,
          language: bestProduct.language,
          illustration: bestProduct.illustration || 'default',
          url: bestProduct.url,
          site: bestProduct.site,
          available: bestProduct.available,
          cardCode: bestProduct.cardCode,
          condition: bestProduct.condition,
        });
      }
    });

    // 추가 최적화 - 배송비 최적화 및 판매처 통합
    let improved = true;
    let iterations = 0;

    while (improved && iterations < MAX_ITERATIONS) {
      improved = false;
      iterations++;

      const payingShippingFee = sellersList.filter(seller => {
        const details = purchaseDetails[seller];
        return (
          details.subtotal > 0 &&
          (details.shippingFee > 0 ||
            sellerShippingInfo[seller].freeShippingThreshold === Infinity) &&
          (details.subtotal < sellerShippingInfo[seller].freeShippingThreshold ||
            sellerShippingInfo[seller].freeShippingThreshold === Infinity)
        );
      });

      const freeShippingSellers = sellersList.filter(seller => {
        const details = purchaseDetails[seller];
        return (
          details.subtotal > 0 &&
          details.shippingFee === 0 &&
          sellerShippingInfo[seller].freeShippingThreshold !== Infinity
        );
      });

      if (payingShippingFee.length === 0) {
        break;
      }

      // 무료배송 임계값 전략 - 임계값에 가까운 판매처는 추가 구매로, 멀리 있는 판매처는 통합
      payingShippingFee.sort((a, b) => {
        const aGap = sellerShippingInfo[a].freeShippingThreshold - purchaseDetails[a].subtotal;
        const bGap = sellerShippingInfo[b].freeShippingThreshold - purchaseDetails[b].subtotal;

        if (sellerShippingInfo[a].freeShippingThreshold === Infinity) return 1;
        if (sellerShippingInfo[b].freeShippingThreshold === Infinity) return -1;

        return aGap - bGap;
      });

      for (const sourceSellerName of payingShippingFee) {
        const sourceSeller = purchaseDetails[sourceSellerName];
        const sourceThreshold = sellerShippingInfo[sourceSellerName].freeShippingThreshold;
        const sourceShippingFee = sellerShippingInfo[sourceSellerName].shippingFee;
        const gapToThreshold = sourceThreshold - sourceSeller.subtotal;


        if (sourceThreshold !== Infinity && gapToThreshold <= sourceShippingFee * 2) {
          if (freeShippingCombinationsBySeller[sourceSellerName]) {
            const availableCombos = freeShippingCombinationsBySeller[sourceSellerName].filter(
              combo => {
                return combo.every(
                  item => !sourceSeller.cards.some(card => card.cardName === item.card.cardName)
                );
              }
            );

            if (availableCombos.length > 0) {
              const potentialMoves = [];

              for (const combo of availableCombos) {
                const neededCards = combo.filter(item =>
                  cardsOptimalPurchase.some(
                    card => card.cardName === item.card.cardName && card.seller !== sourceSellerName
                  )
                );

                if (neededCards.length > 0) {
                  potentialMoves.push({
                    combo,
                    neededCards,
                    totalPrice: neededCards.reduce((sum, item) => sum + item.totalPrice, 0),
                  });
                }
              }

              potentialMoves.sort((a, b) => a.totalPrice - b.totalPrice);

              if (potentialMoves.length > 0) {
                const bestMove = potentialMoves[0];

                // 비용 검증: 이동 후 비용이 실제로 줄어드는지 확인
                let currentTotalCostBeforeMove = 0;
                const affectedSellers = new Set([sourceSellerName]);
                
                for (const item of bestMove.neededCards) {
                  const cardKey = item.card.uniqueCardKey || item.card.cardName;
                  const existingCard = cardsOptimalPurchase.find(
                    c => (c.uniqueCardKey || c.cardName) === cardKey
                  );
                  if (existingCard && existingCard.seller) {
                    affectedSellers.add(existingCard.seller);
                  }
                }
                
                // 영향받는 판매자들의 현재 총 비용 계산
                for (const seller of affectedSellers) {
                  const details = purchaseDetails[seller];
                  if (details && details.subtotal > 0) {
                    currentTotalCostBeforeMove += details.subtotal + details.shippingFee - (details.points || 0);
                  }
                }
                
                // 이동 후 예상 비용 계산 (시뮬레이션)
                let estimatedCostAfterMove = 0;
                
                // sourceSellerName에 카드들을 추가했을 때의 비용
                let newSourceSubtotal = sourceSeller.subtotal;
                let newSourcePoints = sourceSeller.points || 0;
                const tempReviewedProducts = new Set(reviewedProducts);
                
                for (const item of bestMove.neededCards) {
                  newSourceSubtotal += item.price * item.quantity;
                  const cardPoints = calculatePointsAmount(
                    sourceSellerName,
                    item.price,
                    item.quantity,
                    item.card.cardName,
                    tempReviewedProducts,
                    pointsOptions
                  );
                  newSourcePoints += cardPoints;
                }
                
                const newSourceShippingFee = calculateShippingFee(
                  sourceSellerName,
                  regionType,
                  newSourceSubtotal,
                  takeoutOptions
                );
                estimatedCostAfterMove += newSourceSubtotal + newSourceShippingFee - newSourcePoints;
                
                // 다른 영향받는 판매자들의 비용 (카드가 제거된 후)
                for (const seller of affectedSellers) {
                  if (seller === sourceSellerName) continue;
                  
                  const details = purchaseDetails[seller];
                  if (!details) continue;
                  
                  // 해당 판매자에서 제거될 카드들의 가격과 포인트 계산
                  let removedPrice = 0;
                  let removedPoints = 0;
                  for (const item of bestMove.neededCards) {
                    const cardKey = item.card.uniqueCardKey || item.card.cardName;
                    const existingCard = cardsOptimalPurchase.find(
                      c => (c.uniqueCardKey || c.cardName) === cardKey && c.seller === seller
                    );
                    if (existingCard) {
                      removedPrice += existingCard.price * (existingCard.quantity || 1);
                      removedPoints += existingCard.points || 0;
                    }
                  }
                  
                  const newSellerSubtotal = details.subtotal - removedPrice;
                  const newSellerPoints = (details.points || 0) - removedPoints;
                  
                  if (newSellerSubtotal > 0) {
                    const newSellerShippingFee = calculateShippingFee(
                      seller,
                      regionType,
                      newSellerSubtotal,
                      takeoutOptions
                    );
                    estimatedCostAfterMove += newSellerSubtotal + newSellerShippingFee - newSellerPoints;
                  }
                }
                
                // 비용이 줄어들지 않으면 이동하지 않음
                if (estimatedCostAfterMove >= currentTotalCostBeforeMove) {
                  continue;
                }
                
                improved = true;

                // 먼저 각 카드의 원래 판매자를 기록
                const originalSellers = new Set();
                for (const item of bestMove.neededCards) {
                  const cardKey = item.card.uniqueCardKey || item.card.cardName;
                  const existingCard = cardsOptimalPurchase.find(
                    c => (c.uniqueCardKey || c.cardName) === cardKey
                  );
                  if (existingCard && existingCard.seller) {
                    originalSellers.add(existingCard.seller);
                  }
                }

                for (const item of bestMove.neededCards) {
                  const { card, product, price, quantity } = item;
                  const cardName = card.cardName;
                  const cardKey = card.uniqueCardKey || cardName;

                  // 원래 판매자 찾기
                  const existingCardIndex = cardsOptimalPurchase.findIndex(
                    c => (c.uniqueCardKey || c.cardName) === cardKey
                  );
                  
                  if (existingCardIndex !== -1) {
                    const existingCard = cardsOptimalPurchase[existingCardIndex];
                    const originalSellerName = existingCard.seller;
                    
                    // 원래 판매자에서 카드 제거
                    if (originalSellerName && purchaseDetails[originalSellerName]) {
                      const originalSeller = purchaseDetails[originalSellerName];
                      const cardIndexInOriginal = originalSeller.cards.findIndex(c => {
                        const cKey = c.uniqueCardKey || c.cardName;
                        return cKey === cardKey;
                      });
                      
                      if (cardIndexInOriginal !== -1) {
                        const removedCard = originalSeller.cards[cardIndexInOriginal];
                        const removedPrice = (removedCard.price || 0) * (removedCard.quantity || 1);
                        const removedPoints = removedCard.points || 0;
                        
                        originalSeller.cards.splice(cardIndexInOriginal, 1);
                        originalSeller.subtotal -= removedPrice;
                        originalSeller.points -= removedPoints;
                      }
                    }
                  }

                  const productId = cardName;
                  const earnablePoints = calculatePointsAmount(
                    sourceSellerName,
                    price,
                    quantity,
                    productId,
                    reviewedProducts,
                    pointsOptions
                  );

                  purchaseDetails[sourceSellerName].cards.push({
                    cardName,
                    uniqueCardKey: cardKey,
                    price,
                    product,
                    quantity,
                    points: earnablePoints,
                  });

                  purchaseDetails[sourceSellerName].subtotal += price * quantity;
                  purchaseDetails[sourceSellerName].points += earnablePoints;

                  if (existingCardIndex !== -1) {
                    cardsOptimalPurchase[existingCardIndex] = {
                      cardName,
                      uniqueCardKey: cardKey,
                      seller: sourceSellerName,
                      price,
                      totalPrice: price * quantity,
                      quantity,
                      points: earnablePoints,
                      product,
                      cardId: product.cardId,
                      rarity: product.rarity,
                      language: product.language,
                      illustration: product.illustration || 'default',
                      url: product.url,
                      site: product.site,
                      available: product.available,
                      cardCode: product.cardCode,
                      condition: product.condition,
                    };
                  }
                }

                // 배송비 재계산 - sourceSellerName과 원래 판매자들 모두
                const sellersToUpdate = new Set([sourceSellerName, ...originalSellers]);
                for (const seller of sellersToUpdate) {
                  const details = purchaseDetails[seller];
                  if (details) {
                    details.shippingFee = calculateShippingFee(
                      seller,
                      regionType,
                      details.subtotal,
                      takeoutOptions
                    );
                    details.total = details.subtotal + details.shippingFee - details.points;
                  }
                }

                continue;
              }
            }

            let foundImprovement = tryMoveCardsToReachThreshold(
              sourceSellerName,
              gapToThreshold,
              purchaseDetails,
              sellerShippingInfo,
              cardsOptimalPurchase,
              reducedCardsList,
              regionType,
              takeoutOptions,
              pointsOptions,
              reviewedProducts
            );

            if (foundImprovement) {
              improved = true;
              continue;
            }

            foundImprovement = tryMultipleCardsMove(
              sourceSellerName,
              gapToThreshold,
              purchaseDetails,
              sellerShippingInfo,
              cardsOptimalPurchase,
              reducedCardsList,
              regionType,
              takeoutOptions,
              pointsOptions,
              reviewedProducts
            );

            if (foundImprovement) {
              improved = true;
              continue;
            }
          }
        }

        for (const card of [...sourceSeller.cards]) {

          const alternatives = [];
          const productId = card.cardName;
          const cardUniqueKey = card.uniqueCardKey || card.cardName;

          reducedCardsList
            .find(c => (c.uniqueCardKey || c.cardName) === cardUniqueKey)
            ?.products.forEach(product => {
              const seller = getSellerId(product.site);
              if (seller !== sourceSellerName) {
                alternatives.push({
                  seller,
                  product,
                  price: product.price,
                  quantity: card.quantity || 1,
                });
              }
            });

          alternatives.sort((a, b) => {
            const aIsFreeShipping = freeShippingSellers.includes(a.seller);
            const bIsFreeShipping = freeShippingSellers.includes(b.seller);

            if (aIsFreeShipping && !bIsFreeShipping) return -1;
            if (!aIsFreeShipping && bIsFreeShipping) return 1;

            return a.price - b.price;
          });

          for (const alt of alternatives) {
            const targetSellerName = alt.seller;
            if (!purchaseDetails[targetSellerName]) {
              continue;
            }
            const targetSeller = purchaseDetails[targetSellerName];

            const originalSourceTotal = sourceSeller.total;
            const originalTargetTotal = targetSeller.total;
            const originalCost = originalSourceTotal + originalTargetTotal;

            const cardPrice = card.price * (card.quantity || 1);
            const targetPrice = alt.price * alt.quantity;
            const newSourceSubtotal = sourceSeller.subtotal - cardPrice;
            const newTargetSubtotal = targetSeller.subtotal + targetPrice;

            const newSourceShippingFee =
              newSourceSubtotal > 0
                ? calculateShippingFee(
                    sourceSellerName,
                    regionType,
                    newSourceSubtotal,
                    takeoutOptions
                  )
                : 0;
            const newTargetShippingFee = calculateShippingFee(
              targetSellerName,
              regionType,
              newTargetSubtotal,
              takeoutOptions
            );

            // 포인트를 고려한 비용 비교
            const oldSourcePoints = card.points || 0;
            const newSourcePoints = (sourceSeller.points || 0) - oldSourcePoints;
            
            // 새 판매자에서의 포인트를 미리 계산
            const newTargetCardPoints = calculatePointsAmount(
              targetSellerName,
              alt.price,
              alt.quantity,
              productId,
              new Set(reviewedProducts), // 복사본 사용
              pointsOptions
            );
            const newTargetPoints = (targetSeller.points || 0) + newTargetCardPoints;

            const newSourceTotal = newSourceSubtotal + newSourceShippingFee - newSourcePoints;
            const newTargetTotal = newTargetSubtotal + newTargetShippingFee - newTargetPoints;
            const newTotalCost = newSourceTotal + newTargetTotal;

            // 단순화된 비교: 새 비용이 더 저렴하거나, source가 비워지면 이동
            if (newTotalCost < originalCost || (newTotalCost === originalCost && newSourceSubtotal === 0)) {

              const cardIndex = sourceSeller.cards.findIndex(c => {
                const cUniqueKey = c.uniqueCardKey || c.cardName;
                return cUniqueKey === (card.uniqueCardKey || card.cardName);
              });
              if (cardIndex !== -1) {
                sourceSeller.cards.splice(cardIndex, 1);
              }
              sourceSeller.subtotal = newSourceSubtotal;
              sourceSeller.points = newSourcePoints;
              sourceSeller.shippingFee = newSourceShippingFee;
              sourceSeller.total = newSourceSubtotal + newSourceShippingFee - newSourcePoints;

              // 실제로 reviewedProducts에 추가하면서 포인트 계산
              const actualTargetCardPoints = calculatePointsAmount(
                targetSellerName,
                alt.price,
                alt.quantity,
                productId,
                reviewedProducts,
                pointsOptions
              );

              targetSeller.cards.push({
                cardName: card.cardName,
                uniqueCardKey: card.uniqueCardKey || card.cardName,
                price: alt.price,
                product: alt.product,
                quantity: alt.quantity,
                points: actualTargetCardPoints,
              });

              targetSeller.subtotal = newTargetSubtotal;
              targetSeller.shippingFee = newTargetShippingFee;
              targetSeller.points = (targetSeller.points || 0) + actualTargetCardPoints;
              targetSeller.total = newTargetSubtotal + newTargetShippingFee - targetSeller.points;

              const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
                c => (c.uniqueCardKey || c.cardName) === (card.uniqueCardKey || card.cardName)
              );
              if (cardPurchaseIndex !== -1) {
                cardsOptimalPurchase[cardPurchaseIndex] = {
                  cardName: card.cardName,
                  uniqueCardKey: card.uniqueCardKey || card.cardName,
                  seller: targetSellerName,
                  price: alt.price,
                  totalPrice: alt.price * alt.quantity,
                  quantity: alt.quantity,
                  points: actualTargetCardPoints,
                  product: alt.product,
                  cardId: alt.product.cardId,
                  rarity: alt.product.rarity,
                  language: alt.product.language,
                  illustration: alt.product.illustration || 'default',
                  url: alt.product.url,
                  site: alt.product.site,
                  available: alt.product.available,
                  cardCode: alt.product.cardCode,
                  condition: alt.product.condition,
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

    let consolidationImproved = true;
    let consolidationIterations = 0;
    const MAX_CONSOLIDATION_ITERATIONS = 5;

    while (consolidationImproved && consolidationIterations < MAX_CONSOLIDATION_ITERATIONS) {
      consolidationImproved = trySellersConsolidation(
        purchaseDetails,
        sellerShippingInfo,
        cardsOptimalPurchase,
        reducedCardsList,
        regionType,
        takeoutOptions,
        pointsOptions,
        reviewedProducts
      );
      consolidationIterations++;
    }

    // 상점 제거 시뮬레이션: 각 상점을 제거했을 때 전체 비용이 더 저렴해지는지 확인
    const tryRemoveSellerAndReassign = () => {
      const usedSellers = sellersList.filter(
        seller => purchaseDetails[seller].cards && purchaseDetails[seller].cards.length > 0
      );

      if (usedSellers.length <= 1) {
        return false; // 상점이 하나뿐이면 제거할 수 없음
      }

      // 제거 우선순위: 배송비가 높고 구매 금액이 적은 상점을 먼저 시도
      usedSellers.sort((a, b) => {
        const aDetails = purchaseDetails[a];
        const bDetails = purchaseDetails[b];
        
        const aShippingCost = aDetails.shippingFee || 0;
        const bShippingCost = bDetails.shippingFee || 0;
        
        // 배송비가 있는 상점을 우선
        if (aShippingCost > 0 && bShippingCost === 0) return -1;
        if (aShippingCost === 0 && bShippingCost > 0) return 1;
        
        // 둘 다 배송비가 있다면, 구매 금액이 적은 상점을 우선
        if (aShippingCost > 0 && bShippingCost > 0) {
          return aDetails.subtotal - bDetails.subtotal;
        }
        
        // 둘 다 무료배송이면 구매 금액이 적은 상점을 우선
        return aDetails.subtotal - bDetails.subtotal;
      });

      let improved = false;

      for (const sellerToRemove of usedSellers) {
        const cardsToReassign = [...purchaseDetails[sellerToRemove].cards];

        if (cardsToReassign.length === 0) continue;

        // 현재 총 비용 계산
        let currentTotalCost = 0;
        usedSellers.forEach(seller => {
          const details = purchaseDetails[seller];
          const shippingFee = calculateShippingFee(
            seller,
            regionType,
            details.subtotal,
            takeoutOptions
          );
          currentTotalCost += details.subtotal + shippingFee - details.points;
        });

        // 백업 생성
        const backupPurchaseDetails = JSON.parse(JSON.stringify(purchaseDetails));
        const backupCardsOptimalPurchase = JSON.parse(JSON.stringify(cardsOptimalPurchase));
        
        // 시뮬레이션용 reviewedProducts 복사본 생성
        const simulationReviewedProducts = new Set(reviewedProducts);

        // 제거할 상점의 카드들을 모두 제거
        purchaseDetails[sellerToRemove].cards = [];
        purchaseDetails[sellerToRemove].subtotal = 0;
        purchaseDetails[sellerToRemove].points = 0;
        purchaseDetails[sellerToRemove].shippingFee = 0;
        purchaseDetails[sellerToRemove].total = 0;

        // 각 카드를 다른 상점에 재배치
        let allCardsReassigned = true;
        
        // 재배치 계획 저장 (실제 적용은 검증 후)
        const reassignmentPlan = [];

        for (const card of cardsToReassign) {
          const cardUniqueKey = card.uniqueCardKey || card.cardName;
          const cardInfo = reducedCardsList.find(
            c => (c.uniqueCardKey || c.cardName) === cardUniqueKey
          );

          if (!cardInfo) {
            allCardsReassigned = false;
            break;
          }

          // 다른 상점에서 이 카드를 구매할 수 있는 옵션 찾기
          const alternativeProducts = cardInfo.products.filter(
            p => getSellerId(p.site) !== sellerToRemove
          );

          if (alternativeProducts.length === 0) {
            allCardsReassigned = false;
            break;
          }

          // 가장 비용 효율적인 상점 찾기
          let bestAlternativeSeller = null;
          let bestAlternativeProduct = null;
          let lowestCostIncrease = Infinity;
          let bestAlternativePoints = 0;

          for (const altProduct of alternativeProducts) {
            const altSeller = getSellerId(altProduct.site);
            const currentSubtotal = purchaseDetails[altSeller].subtotal;
            const newSubtotal = currentSubtotal + altProduct.price * card.quantity;

            const currentShippingFee = calculateShippingFee(
              altSeller,
              regionType,
              currentSubtotal,
              takeoutOptions
            );
            const newShippingFee = calculateShippingFee(
              altSeller,
              regionType,
              newSubtotal,
              takeoutOptions
            );

            // 시뮬레이션에서는 복사본 사용
            const earnablePoints = calculatePointsAmount(
              altSeller,
              altProduct.price,
              card.quantity,
              cardUniqueKey,
              simulationReviewedProducts,
              pointsOptions
            );

            const costIncrease =
              altProduct.price * card.quantity +
              (newShippingFee - currentShippingFee) -
              earnablePoints;

            if (
              costIncrease < lowestCostIncrease ||
              (costIncrease === lowestCostIncrease && earnablePoints > bestAlternativePoints)
            ) {
              lowestCostIncrease = costIncrease;
              bestAlternativeSeller = altSeller;
              bestAlternativeProduct = altProduct;
              bestAlternativePoints = earnablePoints;
            }
          }

          if (!bestAlternativeSeller) {
            allCardsReassigned = false;
            break;
          }

          // 재배치 계획에 추가
          reassignmentPlan.push({
            card,
            cardUniqueKey,
            bestAlternativeSeller,
            bestAlternativeProduct,
            bestAlternativePoints,
          });

          // 시뮬레이션: purchaseDetails 업데이트
          purchaseDetails[bestAlternativeSeller].cards.push({
            cardName: card.cardName,
            uniqueCardKey: cardUniqueKey,
            price: bestAlternativeProduct.price,
            product: bestAlternativeProduct,
            quantity: card.quantity,
            points: bestAlternativePoints,
          });

          purchaseDetails[bestAlternativeSeller].subtotal +=
            bestAlternativeProduct.price * card.quantity;
          purchaseDetails[bestAlternativeSeller].points += bestAlternativePoints;

          // cardsOptimalPurchase 업데이트
          const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
            c => (c.uniqueCardKey || c.cardName) === cardUniqueKey
          );

          if (cardPurchaseIndex !== -1) {
            cardsOptimalPurchase[cardPurchaseIndex] = {
              cardName: card.cardName,
              uniqueCardKey: cardUniqueKey,
              seller: bestAlternativeSeller,
              price: bestAlternativeProduct.price,
              totalPrice: bestAlternativeProduct.price * card.quantity,
              quantity: card.quantity,
              points: bestAlternativePoints,
              product: bestAlternativeProduct,
              cardId: bestAlternativeProduct.cardId,
              rarity: bestAlternativeProduct.rarity,
              language: bestAlternativeProduct.language,
              illustration: bestAlternativeProduct.illustration || 'default',
              url: bestAlternativeProduct.url,
              site: bestAlternativeProduct.site,
              available: bestAlternativeProduct.available,
              cardCode: bestAlternativeProduct.cardCode,
              condition: bestAlternativeProduct.condition,
            };
          }
        }

        if (!allCardsReassigned) {
          // 복원
          Object.keys(backupPurchaseDetails).forEach(seller => {
            purchaseDetails[seller] = backupPurchaseDetails[seller];
          });
          cardsOptimalPurchase.length = 0;
          cardsOptimalPurchase.push(...backupCardsOptimalPurchase);
          continue;
        }

        // 재배치 후 배송비 재계산
        usedSellers.forEach(seller => {
          if (purchaseDetails[seller].subtotal > 0) {
            purchaseDetails[seller].shippingFee = calculateShippingFee(
              seller,
              regionType,
              purchaseDetails[seller].subtotal,
              takeoutOptions
            );
            purchaseDetails[seller].total =
              purchaseDetails[seller].subtotal +
              purchaseDetails[seller].shippingFee -
              purchaseDetails[seller].points;
          }
        });

        // 새로운 총 비용 계산
        let newTotalCost = 0;
        usedSellers.forEach(seller => {
          const details = purchaseDetails[seller];
          if (details.subtotal > 0) {
            const shippingFee = calculateShippingFee(
              seller,
              regionType,
              details.subtotal,
              takeoutOptions
            );
            newTotalCost += details.subtotal + shippingFee - details.points;
          }
        });

        if (newTotalCost < currentTotalCost) {
          // 개선되면 실제 reviewedProducts에도 적용
          for (const plan of reassignmentPlan) {
            // reviewedProducts에 추가 (리뷰 포인트 중복 방지)
            calculatePointsAmount(
              plan.bestAlternativeSeller,
              plan.bestAlternativeProduct.price,
              plan.card.quantity,
              plan.cardUniqueKey,
              reviewedProducts,
              pointsOptions
            );
          }
          improved = true;
          break; // 개선되면 중단하고 다시 시도
        } else {
          // 개선되지 않으면 복원
          Object.keys(backupPurchaseDetails).forEach(seller => {
            purchaseDetails[seller] = backupPurchaseDetails[seller];
          });
          cardsOptimalPurchase.length = 0;
          cardsOptimalPurchase.push(...backupCardsOptimalPurchase);
        }
      }

      return improved;
    };

    // 상점 제거 시뮬레이션 반복 실행
    let removalImproved = true;
    let removalIterations = 0;
    const MAX_REMOVAL_ITERATIONS = 10;

    while (removalImproved && removalIterations < MAX_REMOVAL_ITERATIONS) {
      removalImproved = tryRemoveSellerAndReassign();
      removalIterations++;
    }

    let totalCost = 0;
    let totalProductCost = 0;
    let totalShippingCost = 0;
    let totalPointsEarned = 0;

    sellersList.forEach(seller => {
      const details = purchaseDetails[seller];
      if (details.cards && details.cards.length > 0) {
        details.shippingFee = calculateShippingFee(
          seller,
          regionType,
          details.subtotal,
          takeoutOptions
        );
        details.total = details.subtotal + details.shippingFee - details.points;

        totalCost += details.total;
        totalProductCost += details.subtotal;
        totalShippingCost += details.shippingFee;
        totalPointsEarned += details.points;
      }
    });

    if (totalCost < bestCost) {
      bestCost = totalCost;

      const usedSellers = sellersList.filter(seller => 
        purchaseDetails[seller].cards && purchaseDetails[seller].cards.length > 0
      );

      const finalPurchaseDetails = {};
      usedSellers.forEach(seller => {
        finalPurchaseDetails[seller] = purchaseDetails[seller];
      });

      const groupedCardsByStore = {};
      const cardImagesMap = {};

      cardsOptimalPurchase.forEach(card => {
        const imageKey = card.uniqueCardKey || card.cardName;
        if (!cardImagesMap[imageKey]) {
          const cardInfo = reducedCardsList.find(
            c => (c.uniqueCardKey || c.cardName) === (card.uniqueCardKey || card.cardName)
          );
          let selectedImage = null;

          if (cardInfo && cardInfo.rarityPrices) {
            const selectedRarity = card.product?.rarity || card.rarity;
            const selectedLanguage = card.product?.language || card.language;
            const selectedIllustration =
              card.product?.illustration || card.illustration || 'default';

            const rarityPrices =
              typeof cardInfo.rarityPrices === 'string'
                ? JSON.parse(cardInfo.rarityPrices)
                : cardInfo.rarityPrices;

            if (
              selectedRarity &&
              selectedLanguage &&
              rarityPrices[selectedIllustration] &&
              rarityPrices[selectedIllustration][selectedLanguage] &&
              rarityPrices[selectedIllustration][selectedLanguage][selectedRarity]
            ) {
              selectedImage =
                rarityPrices[selectedIllustration][selectedLanguage][selectedRarity].image;
            }

            if (!selectedImage && selectedRarity && selectedLanguage) {
              for (const illustration of Object.keys(rarityPrices)) {
                if (
                  rarityPrices[illustration] &&
                  rarityPrices[illustration][selectedLanguage] &&
                  rarityPrices[illustration][selectedLanguage][selectedRarity] &&
                  rarityPrices[illustration][selectedLanguage][selectedRarity].image
                ) {
                  selectedImage =
                    rarityPrices[illustration][selectedLanguage][selectedRarity].image;
                  break;
                }
              }
            }

            if (!selectedImage && selectedRarity) {
              for (const illustration of Object.keys(rarityPrices)) {
                for (const language of Object.keys(rarityPrices[illustration] || {})) {
                  if (
                    rarityPrices[illustration][language] &&
                    rarityPrices[illustration][language][selectedRarity] &&
                    rarityPrices[illustration][language][selectedRarity].image
                  ) {
                    selectedImage = rarityPrices[illustration][language][selectedRarity].image;
                    break;
                  }
                }
                if (selectedImage) break;
              }
            }

            if (!selectedImage) {
              for (const illustration of Object.keys(rarityPrices)) {
                for (const language of Object.keys(rarityPrices[illustration] || {})) {
                  for (const rarity of Object.keys(rarityPrices[illustration][language] || {})) {
                    if (rarityPrices[illustration][language][rarity].image) {
                      selectedImage = rarityPrices[illustration][language][rarity].image;
                      break;
                    }
                  }
                  if (selectedImage) break;
                }
                if (selectedImage) break;
              }
            }
          }

          if (!selectedImage && card.product && card.product.image) {
            selectedImage = card.product.image;
          }

          if (!selectedImage && cardInfo && cardInfo.image) {
            selectedImage = cardInfo.image;
          }

          if (!selectedImage && cardInfo && cardInfo.products && cardInfo.products.length > 0) {
            const firstProduct = cardInfo.products[0];
            if (firstProduct.image) {
              selectedImage = firstProduct.image;
            }
          }

          if (!selectedImage && cardInfo && cardInfo.products && cardInfo.products.length > 0) {
            const productWithImage = cardInfo.products.find(p => p.image);
            if (productWithImage) {
              selectedImage = productWithImage.image;
            }
          }

          cardImagesMap[imageKey] = selectedImage;

          if (!selectedImage) {
            console.log(`[WARN] "${card.cardName}" 카드의 이미지 정보가 없습니다.`);
          }
        }

        if (!groupedCardsByStore[card.seller]) {
          groupedCardsByStore[card.seller] = {
            cards: [],
            finalPrice: 0,
            productCost: 0,
            shippingCost: 0,
            pointsEarned: 0,
          };
        }

        let cardImage = cardImagesMap[imageKey];

        if (card.product && card.product.image) {
          cardImage = card.product.image;
        }

        groupedCardsByStore[card.seller].cards.push({
          cardName: card.cardName,
          price: card.price,
          quantity: card.quantity,
          totalPrice: card.totalPrice,
          product: {
            id: generateConsistentProductId(card),
            url: card.url || card.product?.url,
            site: card.site || card.product?.site,
            price: card.price,
            available: card.available || card.product?.available,
            cardCode: card.cardCode || card.product?.cardCode,
            condition: card.condition || card.product?.condition,
            language: card.language || card.product?.language,
            rarity: card.rarity || card.product?.rarity,
            illustration: card.illustration || card.product?.illustration || 'default',
            cardId: card.cardId,
          },
          image: cardImage,
          cardId: card.cardId,
        });
      });

      Object.keys(groupedCardsByStore).forEach(seller => {
        if (groupedCardsByStore[seller]) {
          // 항상 cards 배열에서 직접 계산하여 정확성을 보장
          const cards = groupedCardsByStore[seller].cards || [];
          const recalculatedProductCost = cards.reduce((sum, card) => {
            return sum + (card.price * card.quantity);
          }, 0);
          
          const recalculatedShippingCost = calculateShippingFee(
            seller,
            regionType,
            recalculatedProductCost,
            takeoutOptions
          );
          
          const recalculatedPoints = cards.reduce((sum, card) => {
            const cardPoints = calculatePointsAmount(
              seller,
              card.price,
              card.quantity,
              card.cardName,
              reviewedProducts,
              pointsOptions
            );
            return sum + cardPoints;
          }, 0);
          
          groupedCardsByStore[seller].productCost = recalculatedProductCost;
          groupedCardsByStore[seller].shippingCost = recalculatedShippingCost;
          groupedCardsByStore[seller].pointsEarned = recalculatedPoints;
          groupedCardsByStore[seller].finalPrice = recalculatedProductCost + recalculatedShippingCost - recalculatedPoints;
        }
      });

      // groupedCardsByStore에서 직접 집계하여 정확성 보장
      totalProductCost = Object.keys(groupedCardsByStore).reduce(
        (sum, seller) => {
          const storeProductCost = groupedCardsByStore[seller]?.productCost || 0;
          return sum + storeProductCost;
        },
        0
      );

      totalShippingCost = Object.keys(groupedCardsByStore).reduce(
        (sum, seller) => {
          const storeShippingCost = groupedCardsByStore[seller]?.shippingCost || 0;
          return sum + storeShippingCost;
        },
        0
      );

      totalPointsEarned = Object.keys(groupedCardsByStore).reduce(
        (sum, seller) => {
          const storePoints = groupedCardsByStore[seller]?.pointsEarned || 0;
          return sum + storePoints;
        },
        0
      );

      totalCost = totalProductCost + totalShippingCost - totalPointsEarned;

      bestSolution = {
        success: cardsOptimalPurchase.length === reducedCardsList.length,
        totalCost,
        totalProductCost,
        totalShippingCost,
        totalPointsEarned,
        pointsOptions,
        shippingRegion,
        cardsOptimalPurchase: groupedCardsByStore,
        cardImages: cardImagesMap,
        algorithm: 'improved_greedy',
      };
    }
  }

  return bestSolution;
}


function generateConsistentProductId(card) {
  const site = card.site || card.product?.site;
  const url = card.url || card.product?.url;
  const existingId = card.product?.id || card.productId;

  const cardName = card.cardName || '';
  const rarity = card.rarity || card.product?.rarity || '';
  const language = card.language || card.product?.language || '';
  const cardCode = card.cardCode || card.product?.cardCode || '';

  if (
    existingId &&
    typeof existingId === 'string' &&
    (existingId.startsWith('tcg-') || existingId.startsWith('carddc-'))
  ) {
    return existingId;
  }

  if (site === 'TCGShop') {
  
    if (url && url.includes('goodsIdx=')) {
      const match = url.match(/goodsIdx=(\d+)/);
      if (match && match[1]) {
        return `tcg-${match[1]}`;
      }
    }

    if (existingId) {
      return `tcg-${existingId}`;
    }

    // 카드 정보로 해시 생성 (URL이 없는 경우)
    const cardIdentity = `${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
    const hashCode = simpleStringHash(cardIdentity);
    return `tcg-${hashCode}`;
  }

  if (site === 'CardDC') {
    if (existingId) {
      return `carddc-${existingId}`;
    }

    if (url && url.includes('item_id=')) {
      const match = url.match(/item_id=(\d+)/);
      if (match && match[1]) {
        return `carddc-${match[1]}`;
      }
    }

    // 카드 정보로 해시 생성 (URL이 없는 경우)
    const cardIdentity = `${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
    const hashCode = simpleStringHash(cardIdentity);
    return `carddc-${hashCode}`;
  }

  if (existingId) {
    return existingId.toString();
  }

  const cardIdentity =
    `${site || 'unknown'}-${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
  const hashCode = simpleStringHash(cardIdentity);
  return `${site || 'unknown'}-${hashCode}`;
}

function simpleStringHash(str) {
  let hash = 0;

  if (!str || str.length === 0) {
    return hash.toString(16);
  }

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16);
}

module.exports = {
  findGreedyOptimalPurchase,
};
