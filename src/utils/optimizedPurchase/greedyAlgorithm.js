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

  const considerPointsStr = Object.entries(pointsOptions)
    .filter(([, enabled]) => enabled)
    .map(([store]) => store)
    .join(', ');

  console.log(
    '\n[개선된 탐욕 알고리즘 실행] 배송 지역:',
    shippingRegion,
    '적립금 고려:',
    considerPointsStr ? `예 (${considerPointsStr})` : '아니오'
  );

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
                improved = true;

                for (const item of bestMove.neededCards) {
                  const { card, product, price, quantity } = item;
                  const cardName = card.cardName;

                  const cardIndex = sourceSeller.cards.findIndex(c => {
                    const cUniqueKey = c.uniqueCardKey || c.cardName;
                    return cUniqueKey === (card.uniqueCardKey || card.cardName);
                  });
                  if (cardIndex !== -1) {
                    sourceSeller.cards.splice(cardIndex, 1);
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
                    uniqueCardKey: card.uniqueCardKey || cardName,
                    price,
                    product,
                    quantity,
                    points: earnablePoints,
                  });

                  purchaseDetails[sourceSellerName].subtotal += price * quantity;
                  purchaseDetails[sourceSellerName].points += earnablePoints;

                  const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
                    c => (c.uniqueCardKey || c.cardName) === (card.uniqueCardKey || cardName)
                  );
                  if (cardPurchaseIndex !== -1) {
                    cardsOptimalPurchase[cardPurchaseIndex] = {
                      cardName,
                      uniqueCardKey: card.uniqueCardKey || cardName,
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


                for (const seller of [
                  sourceSellerName,
                  ...new Set(
                    bestMove.neededCards.map(
                      item =>
                        cardsOptimalPurchase.find(c => c.cardName === item.card.cardName).seller
                    )
                  ),
                ]) {
                  const details = purchaseDetails[seller];

                  details.shippingFee = calculateShippingFee(
                    seller,
                    regionType,
                    details.subtotal,
                    takeoutOptions
                  );

                  details.total = details.subtotal + details.shippingFee - details.points;
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

            const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
            const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
            const newTotalCost = newSourceTotal + newTargetTotal;

            if (
              newTotalCost < originalCost - (sourceSeller.points + targetSeller.points) &&
              (newTotalCost < originalCost || newSourceSubtotal === 0)
            ) {
              const oldSourcePoints = card.points || 0;
              const newTargetPoints = calculatePointsAmount(
                targetSellerName,
                alt.price,
                alt.quantity,
                productId,
                reviewedProducts,
                pointsOptions
              );

              const cardIndex = sourceSeller.cards.findIndex(c => {
                const cUniqueKey = c.uniqueCardKey || c.cardName;
                return cUniqueKey === (card.uniqueCardKey || card.cardName);
              });
              if (cardIndex !== -1) {
                sourceSeller.cards.splice(cardIndex, 1);
              }
              sourceSeller.subtotal = newSourceSubtotal;
              sourceSeller.points -= oldSourcePoints;
              sourceSeller.shippingFee = newSourceShippingFee;
              sourceSeller.total = newSourceTotal - sourceSeller.points;

              targetSeller.cards.push({
                cardName: card.cardName,
                uniqueCardKey: card.uniqueCardKey || card.cardName,
                price: alt.price,
                product: alt.product,
                quantity: alt.quantity,
                points: newTargetPoints,
              });

              targetSeller.subtotal = newTargetSubtotal;
              targetSeller.shippingFee = newTargetShippingFee;
              targetSeller.total = newTargetTotal - targetSeller.points;
              targetSeller.points += newTargetPoints;

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
                  points: newTargetPoints,
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
          const details = finalPurchaseDetails[seller] || purchaseDetails[seller];
          if (details) {
            groupedCardsByStore[seller].finalPrice = details.total;
            groupedCardsByStore[seller].productCost = details.subtotal;
            groupedCardsByStore[seller].shippingCost = details.shippingFee;
            groupedCardsByStore[seller].pointsEarned = details.points;
          } else {
            
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
        }
      });

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
