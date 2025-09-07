const { getSellerId } = require('./cardUtils');
const { calculateShippingFee, REGION_TYPES } = require('../shippingInfo');
const { calculatePointsAmount } = require('./pointsUtils');

function getCardKey(card) {
  return card && (card.uniqueCardKey || card.cardName);
}

function tryMoveCardsToReachThreshold(
  targetSeller,
  gapToThreshold,
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList,
  regionType = REGION_TYPES.DEFAULT,
  takeoutOptions = [],
  pointsOptions = {},
  reviewedProducts = new Set()
) {
  const otherSellers = Object.keys(purchaseDetails).filter(
    s => s !== targetSeller && purchaseDetails[s].cards.length > 0
  );

  const candidateCards = [];

  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      const cardInfo = cardsList.find(c => getCardKey(c) === getCardKey(card));
      if (!cardInfo) return;

      const productInTargetSeller = cardInfo.products.find(
        p => getSellerId(p.site) === targetSeller
      );
      if (productInTargetSeller) {
        candidateCards.push({
          seller,
          cardName: card.cardName,
          currentPrice: card.price,
          currentProduct: card.product,
          quantity: card.quantity || 1,
          targetPrice: productInTargetSeller.price,
          targetProduct: productInTargetSeller,
        });
      }
    });
  });

  // 임계값 근처에 맞는 카드 조합 찾기
  candidateCards.sort((a, b) => a.targetPrice * a.quantity - b.targetPrice * b.quantity);

  for (const candidate of candidateCards) {
    const sourceSellerName = candidate.seller;
    const sourceSeller = purchaseDetails[sourceSellerName];
    const cardPrice = candidate.currentPrice * candidate.quantity;
    const targetPrice = candidate.targetPrice * candidate.quantity;

    if (targetPrice >= gapToThreshold * 0.7 && targetPrice <= gapToThreshold * 1.5) {
      const currentSourceTotal = sourceSeller.total;
      const currentTargetTotal = purchaseDetails[targetSeller].total;
      const currentTotalCost = currentSourceTotal + currentTargetTotal;

      const newSourceSubtotal = sourceSeller.subtotal - cardPrice;
      const newTargetSubtotal = purchaseDetails[targetSeller].subtotal + targetPrice;

      const newSourceShippingFee =
        newSourceSubtotal > 0
          ? calculateShippingFee(sourceSellerName, regionType, newSourceSubtotal, takeoutOptions)
          : 0;
      const newTargetShippingFee = calculateShippingFee(
        targetSeller,
        regionType,
        newTargetSubtotal,
        takeoutOptions
      );

      const movingCard = sourceSeller.cards.find(c => getCardKey(c) === getCardKey(candidate));
      const movingCardPoints = movingCard ? (movingCard.points || 0) : 0;
      
      const newSourcePoints = (sourceSeller.points || 0) - movingCardPoints;
      const newTargetPoints = (purchaseDetails[targetSeller].points || 0) + movingCardPoints;

      const newSourceTotal = newSourceSubtotal + newSourceShippingFee - newSourcePoints;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee - newTargetPoints;
      const newTotalCost = newSourceTotal + newTargetTotal;

      if (newTotalCost < currentTotalCost) {
        const cardIndex = sourceSeller.cards.findIndex(
          c => getCardKey(c) === getCardKey(candidate)
        );
        if (cardIndex !== -1) {
          sourceSeller.cards.splice(cardIndex, 1);
        }
        sourceSeller.subtotal = newSourceSubtotal;
        sourceSeller.shippingFee = newSourceShippingFee;
        sourceSeller.points = newSourcePoints;
        sourceSeller.total = newSourceSubtotal + newSourceShippingFee - newSourcePoints;

        const targetCardPoints = calculatePointsAmount(
          targetSeller,
          candidate.targetPrice,
          candidate.quantity,
          candidate.cardName,
          reviewedProducts,
          pointsOptions
        );
        
        purchaseDetails[targetSeller].cards.push({
          cardName: candidate.cardName,
          price: candidate.targetPrice,
          product: candidate.targetProduct,
          quantity: candidate.quantity,
          points: targetCardPoints,
        });
        purchaseDetails[targetSeller].subtotal = newTargetSubtotal;
        purchaseDetails[targetSeller].shippingFee = newTargetShippingFee;
        purchaseDetails[targetSeller].points = newTargetPoints;
        purchaseDetails[targetSeller].total = newTargetSubtotal + newTargetShippingFee - newTargetPoints;

        const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
          c => getCardKey(c) === getCardKey(candidate)
        );
        if (cardPurchaseIndex !== -1) {
          const prev = cardsOptimalPurchase[cardPurchaseIndex];
          cardsOptimalPurchase[cardPurchaseIndex] = {
            cardName: candidate.cardName,
            uniqueCardKey: prev.uniqueCardKey || candidate.cardName,
            seller: targetSeller,
            price: candidate.targetPrice,
            totalPrice: candidate.targetPrice * candidate.quantity,
            quantity: candidate.quantity,
            product: candidate.targetProduct,
            rarity: prev.rarity || candidate.targetProduct?.rarity,
            language: prev.language || candidate.targetProduct?.language,
            illustration: prev.illustration || candidate.targetProduct?.illustration || 'default',
          };
        }

        return true;
      }
    }
  }

  return false;
}


function tryMultipleCardsMove(
  targetSeller,
  gapToThreshold,
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList,
  regionType = REGION_TYPES.DEFAULT,
  takeoutOptions = [],
  pointsOptions = {},
  reviewedProducts = new Set()
) {
  // 범위를 넓혀서 무료배송 임계값에 맞는 카드 조합 찾기 시도
  const allCandidateCards = [];
  const otherSellers = Object.keys(purchaseDetails).filter(
    s => s !== targetSeller && purchaseDetails[s].cards.length > 0
  );

  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      const cardInfo = cardsList.find(c => getCardKey(c) === getCardKey(card));
      if (!cardInfo) return;

      const productInTargetSeller = cardInfo.products.find(
        p => getSellerId(p.site) === targetSeller
      );
      if (productInTargetSeller) {
        allCandidateCards.push({
          seller,
          cardName: card.cardName,
          currentPrice: card.price,
          currentProduct: card.product,
          quantity: card.quantity || 1,
          targetPrice: productInTargetSeller.price,
          targetProduct: productInTargetSeller,
          efficiency: (productInTargetSeller.price - card.price) / productInTargetSeller.price,
        });
      }
    });
  });

  // 효율성 기준으로 정렬
  allCandidateCards.sort((a, b) => a.efficiency - b.efficiency);


  const maxCardsToMove = allCandidateCards.length;
  let bestCombination = [];
  let bestTotalCost = Infinity;


  for (let numCards = 2; numCards <= maxCardsToMove; numCards++) {
    const topCards = allCandidateCards;

    const combinations = [];

    const generateCombinations = function (start, current, count) {
      if (current.length === count) {
        combinations.push([...current]);
        return;
      }

      for (let i = start; i < topCards.length; i++) {
        if (current.some(card => card.seller === topCards[i].seller)) {
          continue;
        }

        current.push(topCards[i]);
        generateCombinations(i + 1, current, count);
        current.pop();
      }
    };

    generateCombinations(0, [], numCards);

    for (const combination of combinations) {
      let combinationTargetPrice = 0;

      const originalDetails = {};
      combination.forEach(card => {
        const seller = card.seller;
        if (!originalDetails[seller]) {
          originalDetails[seller] = {
            subtotal: purchaseDetails[seller].subtotal,
            shippingFee: purchaseDetails[seller].shippingFee,
            total: purchaseDetails[seller].total,
          };
        }

        combinationTargetPrice += card.targetPrice * card.quantity;
      });

      const originalTargetDetails = {
        subtotal: purchaseDetails[targetSeller].subtotal,
        shippingFee: purchaseDetails[targetSeller].shippingFee,
        total: purchaseDetails[targetSeller].total,
      };

      const newTargetSubtotal = originalTargetDetails.subtotal + combinationTargetPrice;
      const newTargetShippingFee = calculateShippingFee(
        targetSeller,
        regionType,
        newTargetSubtotal,
        takeoutOptions
      );

      combination.forEach(card => {
        const seller = card.seller;

        if (originalDetails[seller].processed) return;

        originalDetails[seller].processed = true;
      });

      Object.keys(originalDetails).forEach(seller => {
        delete originalDetails[seller].processed;
      });

      let combinationMovingPoints = 0;
      combination.forEach(card => {
        const sourceSellerData = purchaseDetails[card.seller];
        const movingCard = sourceSellerData.cards.find(c => getCardKey(c) === getCardKey(card));
        combinationMovingPoints += movingCard ? (movingCard.points || 0) : 0;
      });
      const newTargetPoints = (originalTargetDetails.points || 0) + combinationMovingPoints;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee - newTargetPoints;

      let newSourceTotals = 0;
      const sourceSellerUpdates = {};

      combination.forEach(card => {
        const seller = card.seller;

        if (sourceSellerUpdates[seller]) return;

        const allCardsFromSeller = combination.filter(c => c.seller === seller);
        const totalMovingPrice = allCardsFromSeller.reduce((sum, c) => sum + c.currentPrice * c.quantity, 0);

        const newSubtotal = originalDetails[seller].subtotal - totalMovingPrice;
        const newShippingFee =
          newSubtotal > 0
            ? calculateShippingFee(seller, regionType, newSubtotal, takeoutOptions)
            : 0;

        const movingCardsFromSeller = allCardsFromSeller;
        let totalMovingPoints = 0;
        movingCardsFromSeller.forEach(card => {
          const cardInSeller = purchaseDetails[seller].cards.find(c => getCardKey(c) === getCardKey(card));
          if (cardInSeller) {
            totalMovingPoints += cardInSeller.points || 0;
          }
        });
        const newSourcePoints = (originalDetails[seller].points || 0) - totalMovingPoints;

        const newTotal = newSubtotal + newShippingFee - newSourcePoints;
        newSourceTotals += newTotal;

        sourceSellerUpdates[seller] = {
          subtotal: newSubtotal,
          shippingFee: newShippingFee,
          points: newSourcePoints,
          total: newTotal,
        };
      });

      const newTotalCost = newTargetTotal + newSourceTotals;

      if (newTotalCost < bestTotalCost) {
        bestCombination = combination;
        bestTotalCost = newTotalCost;
      }
    }
  }

  if (bestCombination.length > 0 && bestTotalCost < Infinity) {
    const sourceUpdates = {};
    
    const originalTargetSubtotal = purchaseDetails[targetSeller].subtotal;
    const originalTargetPoints = purchaseDetails[targetSeller].points || 0;

    for (const card of bestCombination) {
      const sourceSellerName = card.seller;
      const sourceSeller = purchaseDetails[sourceSellerName];
      const targetSellerData = purchaseDetails[targetSeller];

      if (!sourceUpdates[sourceSellerName]) {
        sourceUpdates[sourceSellerName] = {
          cards: [],
          originalSubtotal: sourceSeller.subtotal,
          originalShippingFee: sourceSeller.shippingFee,
          originalTotal: sourceSeller.total,
          originalPoints: sourceSeller.points || 0,
          newSubtotal: sourceSeller.subtotal,
          removedTotal: 0,
          removedPoints: 0,
        };
      }

      const cardPrice = card.currentPrice * card.quantity;
      const targetPrice = card.targetPrice * card.quantity;

      const movingCard = sourceSeller.cards.find(c => getCardKey(c) === getCardKey(card));
      const movingCardPoints = movingCard ? (movingCard.points || 0) : 0;

      sourceUpdates[sourceSellerName].cards.push(card);
      sourceUpdates[sourceSellerName].newSubtotal -= cardPrice;
      sourceUpdates[sourceSellerName].removedTotal += cardPrice;
      sourceUpdates[sourceSellerName].removedPoints += movingCardPoints;

      const targetCardPoints = calculatePointsAmount(
        targetSeller,
        card.targetPrice,
        card.quantity,
        card.cardName,
        reviewedProducts,
        pointsOptions
      );
      
      targetSellerData.cards.push({
        cardName: card.cardName,
        price: card.targetPrice,
        product: card.targetProduct,
        quantity: card.quantity,
        points: targetCardPoints,
      });

      targetSellerData.subtotal += targetPrice;

      const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
        c => getCardKey(c) === getCardKey(card)
      );
      if (cardPurchaseIndex !== -1) {
        const prev = cardsOptimalPurchase[cardPurchaseIndex];
        cardsOptimalPurchase[cardPurchaseIndex] = {
          cardName: card.cardName,
          uniqueCardKey: prev.uniqueCardKey || card.cardName,
          seller: targetSeller,
          price: card.targetPrice,
          totalPrice: card.targetPrice * card.quantity,
          quantity: card.quantity,
          product: card.targetProduct,
          rarity: prev.rarity || card.targetProduct?.rarity,
          language: prev.language || card.targetProduct?.language,
          illustration: prev.illustration || card.targetProduct?.illustration || 'default',
        };
      }
    }

    Object.entries(sourceUpdates).forEach(([sellerName, update]) => {
      const seller = purchaseDetails[sellerName];

      update.cards.forEach(card => {
        const cardIndex = seller.cards.findIndex(c => getCardKey(c) === getCardKey(card));
        if (cardIndex !== -1) {
          seller.cards.splice(cardIndex, 1);
        }
      });

      seller.subtotal -= update.removedTotal;

      seller.shippingFee = calculateShippingFee(
        sellerName,
        regionType,
        seller.subtotal,
        takeoutOptions
      );

      seller.points = update.originalPoints - update.removedPoints;

      seller.total = seller.subtotal + seller.shippingFee - seller.points;
    });

    purchaseDetails[targetSeller].shippingFee = calculateShippingFee(
      targetSeller,
      regionType,
      purchaseDetails[targetSeller].subtotal,
      takeoutOptions
    );

    let totalMovedPoints = 0;
    Object.values(sourceUpdates).forEach(update => {
      totalMovedPoints += update.removedPoints;
    });
    const newTargetPoints = originalTargetPoints + totalMovedPoints;
    purchaseDetails[targetSeller].points = newTargetPoints;

    purchaseDetails[targetSeller].total =
      purchaseDetails[targetSeller].subtotal + purchaseDetails[targetSeller].shippingFee - newTargetPoints;

    return true;
  }

  return false;
}


function trySellersConsolidation(
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList,
  regionType = REGION_TYPES.DEFAULT,
  takeoutOptions = [],
  pointsOptions = {},
  reviewedProducts = new Set()
) {
  const usedSellers = Object.keys(purchaseDetails).filter(
    seller => purchaseDetails[seller].cards && purchaseDetails[seller].cards.length > 0
  );

  if (usedSellers.length <= 2) return false;

  usedSellers.sort((a, b) => purchaseDetails[a].subtotal - purchaseDetails[b].subtotal);

  let improved = false;

  for (const sourceSellerName of usedSellers) {
    const sourceSeller = purchaseDetails[sourceSellerName];

    if (sourceSeller.cards.length === 0) continue;

    const potentialMoves = [];

    for (const card of sourceSeller.cards) {
      const cardInfo = cardsList.find(c => getCardKey(c) === getCardKey(card));
      if (!cardInfo) continue;

      cardInfo.products.forEach(product => {
        const targetSellerName = getSellerId(product.site);
        if (targetSellerName === sourceSellerName) return;

        if (!purchaseDetails[targetSellerName]) {
          purchaseDetails[targetSellerName] = {
            cards: [],
            subtotal: 0,
            shippingFee: 0,
            total: 0,
            points: 0,
          };
        }

        potentialMoves.push({
          cardName: card.cardName,
          sourcePrice: card.price,
          sourceQuantity: card.quantity || 1,
          targetSellerName,
          targetPrice: product.price,
          targetProduct: product,
          priceDifference: (product.price - card.price) * (card.quantity || 1),
          sourceSeller: sourceSellerName,
        });
      });
    }

    potentialMoves.sort((a, b) => a.priceDifference - b.priceDifference);

    const movesByTargetSeller = {};
    potentialMoves.forEach(move => {
      if (!movesByTargetSeller[move.targetSellerName]) {
        movesByTargetSeller[move.targetSellerName] = [];
      }
      movesByTargetSeller[move.targetSellerName].push(move);
    });

    let bestTargetSeller = null;
    let bestMovesCount = 0;
    let bestTotalPriceDiff = Infinity;

    Object.entries(movesByTargetSeller).forEach(([targetSeller, moves]) => {
      if (moves.length === sourceSeller.cards.length) {
        const totalPriceDiff = moves.reduce((sum, move) => sum + move.priceDifference, 0);

        if (
          bestMovesCount < moves.length ||
          (bestMovesCount === moves.length && totalPriceDiff < bestTotalPriceDiff)
        ) {
          bestTargetSeller = targetSeller;
          bestMovesCount = moves.length;
          bestTotalPriceDiff = totalPriceDiff;
        }
      }
    });

    if (bestTargetSeller && bestMovesCount === sourceSeller.cards.length) {
      const targetSeller = purchaseDetails[bestTargetSeller];
      const moves = movesByTargetSeller[bestTargetSeller];

        const originalSourceTotal = sourceSeller.total;
        const originalTargetTotal = targetSeller.total;
        const originalCost = originalSourceTotal + originalTargetTotal;

        let newTargetSubtotal = targetSeller.subtotal;

        for (const move of moves) {
          newTargetSubtotal += move.targetPrice * move.sourceQuantity;
        }

        const newTargetShippingFee = calculateShippingFee(
          bestTargetSeller,
          regionType,
          newTargetSubtotal,
          takeoutOptions
        );

        const newTargetPoints = (targetSeller.points || 0) + (sourceSeller.points || 0);
        const newTargetTotal = newTargetSubtotal + newTargetShippingFee - newTargetPoints;

        const newTotalCost = newTargetTotal;


      if (newTotalCost < originalCost) {
        for (const move of moves) {
          const cardIndex = sourceSeller.cards.findIndex(c => getCardKey(c) === getCardKey(move));
          if (cardIndex !== -1) {
            sourceSeller.cards.splice(cardIndex, 1);
          }

          const targetCardPoints = calculatePointsAmount(
            bestTargetSeller,
            move.targetPrice,
            move.sourceQuantity,
            move.cardName,
            reviewedProducts,
            pointsOptions
          );
          
          targetSeller.cards.push({
            cardName: move.cardName,
            price: move.targetPrice,
            product: move.targetProduct,
            quantity: move.sourceQuantity,
            points: targetCardPoints,
          });

          const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
            c => getCardKey(c) === getCardKey(move)
          );
          if (cardPurchaseIndex !== -1) {
            const prev = cardsOptimalPurchase[cardPurchaseIndex];
            cardsOptimalPurchase[cardPurchaseIndex] = {
              cardName: move.cardName,
              uniqueCardKey: prev.uniqueCardKey || move.cardName,
              seller: bestTargetSeller,
              price: move.targetPrice,
              totalPrice: move.targetPrice * move.sourceQuantity,
              quantity: move.sourceQuantity,
              product: move.targetProduct,
              rarity: prev.rarity || move.targetProduct?.rarity,
              language: prev.language || move.targetProduct?.language,
              illustration: prev.illustration || move.targetProduct?.illustration || 'default',
            };
          }
        }

        sourceSeller.subtotal = 0;
        sourceSeller.shippingFee = 0;
        sourceSeller.total = 0;
        sourceSeller.points = 0;

        targetSeller.subtotal = newTargetSubtotal;
        targetSeller.shippingFee = newTargetShippingFee;
        targetSeller.points = newTargetPoints;
        targetSeller.total = newTargetSubtotal + newTargetShippingFee - newTargetPoints;

        improved = true;
        break;
      }
    }
  }

  return improved;
}


module.exports = {
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
};
