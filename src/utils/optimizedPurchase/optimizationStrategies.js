/**
 * 다양한 최적화 전략 관련 함수 모듈
 */

const { getSellerId } = require('./cardUtils');

/**
 * 무료배송 임계값에 도달하기 위해 다른 판매처에서 카드를 이동하는 함수
 * @param {string} targetSeller - 대상 판매처
 * @param {number} gapToThreshold - 무료배송 임계값까지의 차이
 * @param {Object} purchaseDetails - 판매처별 구매 내역
 * @param {Object} sellerShippingInfo - 판매처별 배송비 정보
 * @param {Array} cardsOptimalPurchase - 카드별 최적 구매처 정보
 * @param {Array} cardsList - 카드 목록
 * @returns {boolean} - 최적화 성공 여부
 */
function tryMoveCardsToReachThreshold(
  targetSeller,
  gapToThreshold,
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList
) {
  const otherSellers = Object.keys(purchaseDetails).filter(
    s => s !== targetSeller && purchaseDetails[s].cards.length > 0
  );

  // 다른 판매처의 카드 중 이동 가능한 후보 찾기
  const candidateCards = [];

  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      // 타겟 판매처에서도 구매 가능한지 확인
      const cardInfo = cardsList.find(c => c.cardName === card.cardName);
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

  // 임계값 근처에 맞는 카드 조합 찾기 (냅색 문제와 유사)
  candidateCards.sort((a, b) => a.targetPrice * a.quantity - b.targetPrice * b.quantity);

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
      const { shippingFee: sourceShippingFee, freeShippingThreshold: sourceThreshold } =
        sellerShippingInfo[sourceSellerName];
      const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } =
        sellerShippingInfo[targetSeller];

      const newSourceShippingFee =
        newSourceSubtotal > 0 ? (newSourceSubtotal >= sourceThreshold ? 0 : sourceShippingFee) : 0;
      // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
      const newTargetShippingFee =
        newTargetSubtotal >= targetThreshold && targetThreshold !== Infinity
          ? 0
          : targetShippingFee;

      // 현재 비용과 새 비용 비교
      const newSourceTotal = newSourceSubtotal + newSourceShippingFee;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;
      const newTotalCost = newSourceTotal + newTargetTotal;

      // 비용이 줄어들면 카드 이동
      if (newTotalCost < currentTotalCost) {
        // 소스 판매처에서 카드 제거
        const cardIndex = sourceSeller.cards.findIndex(c => c.cardName === candidate.cardName);
        if (cardIndex !== -1) {
          sourceSeller.cards.splice(cardIndex, 1);
        }
        sourceSeller.subtotal = newSourceSubtotal;
        sourceSeller.shippingFee = newSourceShippingFee;
        sourceSeller.total = newSourceTotal;

        // 타겟 판매처에 카드 추가
        purchaseDetails[targetSeller].cards.push({
          cardName: candidate.cardName,
          price: candidate.targetPrice,
          product: candidate.targetProduct,
          quantity: candidate.quantity,
        });
        purchaseDetails[targetSeller].subtotal = newTargetSubtotal;
        purchaseDetails[targetSeller].shippingFee = newTargetShippingFee;
        purchaseDetails[targetSeller].total = newTargetTotal;

        // 카드별 최적 구매처 정보 업데이트
        const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
          c => c.cardName === candidate.cardName
        );
        if (cardPurchaseIndex !== -1) {
          cardsOptimalPurchase[cardPurchaseIndex] = {
            cardName: candidate.cardName,
            seller: targetSeller,
            price: candidate.targetPrice,
            totalPrice: candidate.targetPrice * candidate.quantity,
            quantity: candidate.quantity,
            product: candidate.targetProduct,
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
function tryMultipleCardsMove(
  targetSeller,
  gapToThreshold,
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList
) {
  // 범위를 넓혀서 무료배송 임계값에 맞는 카드 조합 찾기 시도
  // 다른 판매처의 카드 중 이동 가능한 후보 찾기
  const allCandidateCards = [];
  const otherSellers = Object.keys(purchaseDetails).filter(
    s => s !== targetSeller && purchaseDetails[s].cards.length > 0
  );

  // 모든 가능한 후보 카드 수집
  otherSellers.forEach(seller => {
    purchaseDetails[seller].cards.forEach(card => {
      // 타겟 판매처에서도 구매 가능한지 확인
      const cardInfo = cardsList.find(c => c.cardName === card.cardName);
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
          // 효율성 계산: 가격 차이 대비 이동 가격 (낮을수록 효율적)
          efficiency: (productInTargetSeller.price - card.price) / productInTargetSeller.price,
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
  const maxCardsToMove = allCandidateCards.length;
  let bestCombination = [];
  let bestTotalCost = Infinity;

  // 싱글 카드 이동 (이미 tryMoveCardsToReachThreshold에서 시도했으므로 건너뜀)

  // 2~3개 카드 조합 시도 (효율적인 카드 중에서)
  for (let numCards = 2; numCards <= maxCardsToMove; numCards++) {
    // 가능한 모든 카드 조합에 대해 시뮬레이션
    // 제한 없이 모든 후보 카드 사용
    const topCards = allCandidateCards;

    // 조합 생성 (재귀 함수 사용)
    const combinations = [];

    // 함수 선언을 블록 외부로 이동
    const generateCombinations = function (start, current, count) {
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
    };

    generateCombinations(0, [], numCards);

    // 각 조합에 대해 비용 시뮬레이션
    for (const combination of combinations) {
      // 카드 조합의 총 가격
      let combinationTargetPrice = 0;

      // 원본 상태 백업
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
        // combinationSourcePrice += card.currentPrice * card.quantity; // 사용되지 않음
      });

      // 타겟 판매처 원본 상태
      const originalTargetDetails = {
        subtotal: purchaseDetails[targetSeller].subtotal,
        shippingFee: purchaseDetails[targetSeller].shippingFee,
        total: purchaseDetails[targetSeller].total,
      };

      // 새로운 가격이 무료배송 임계값에 얼마나 가까운지 확인
      const newTargetSubtotal = originalTargetDetails.subtotal + combinationTargetPrice;
      // 배송비 계산
      const newTargetShippingFee =
        newTargetSubtotal >= sellerShippingInfo[targetSeller].freeShippingThreshold &&
        sellerShippingInfo[targetSeller].freeShippingThreshold !== Infinity
          ? 0
          : sellerShippingInfo[targetSeller].shippingFee;

      combination.forEach(card => {
        const seller = card.seller;
        // const sourceThreshold = sellerShippingInfo[seller].freeShippingThreshold; // 사용되지 않음
        // const sourceShippingFee = sellerShippingInfo[seller].shippingFee; // 사용되지 않음

        // 이미 처리한 판매처는 건너뜀
        if (originalDetails[seller].processed) return;

        // const currentSubtotal = originalDetails[seller].subtotal; // 사용되지 않음
        // const currentShippingFee = originalDetails[seller].shippingFee; // 사용되지 않음

        // 같은 판매처에서 오는 모든 카드의 가격 합산
        // const allCardsPrice = combination
        //   .filter(c => c.seller === seller)
        //   .reduce((sum, c) => sum + c.currentPrice * c.quantity, 0); // 사용되지 않음

        // 처리 표시
        originalDetails[seller].processed = true;
      });

      // 처리 표시 초기화
      Object.keys(originalDetails).forEach(seller => {
        delete originalDetails[seller].processed;
      });

      // 총 비용 변화 계산 (현재 사용되지 않음)
      // const oldTotalCost =
      //   originalTargetDetails.total +
      //   combination.reduce((sum, card) => sum + originalDetails[card.seller].total, 0);
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;

      // 소스 판매처들의 새 총액 계산
      let newSourceTotals = 0;
      const sourceSellerUpdates = {};

      combination.forEach(card => {
        const seller = card.seller;

        // 이미 처리한 판매처는 건너뜀
        if (sourceSellerUpdates[seller]) return;

        // const currentSubtotal = originalDetails[seller].subtotal; // 사용되지 않음

        // 같은 판매처에서 오는 모든 카드의 가격 합산
        // const allCardsPrice = combination
        //   .filter(c => c.seller === seller)
        //   .reduce((sum, c) => sum + c.currentPrice * c.quantity, 0); // 사용되지 않음

        const newSubtotal = originalDetails[seller].subtotal - combinationTargetPrice;
        const newShippingFee =
          newSubtotal > 0
            ? newSubtotal >= sellerShippingInfo[seller].freeShippingThreshold &&
              sellerShippingInfo[seller].freeShippingThreshold !== Infinity
              ? 0
              : sellerShippingInfo[seller].shippingFee
            : 0;

        const newTotal = newSubtotal + newShippingFee;
        newSourceTotals += newTotal;

        sourceSellerUpdates[seller] = {
          subtotal: newSubtotal,
          shippingFee: newShippingFee,
          total: newTotal,
        };
      });

      const newTotalCost = newTargetTotal + newSourceTotals;

      // 총 비용이 더 적을 때만 최적 조합 갱신
      if (newTotalCost < bestTotalCost) {
        bestCombination = combination;
        bestTotalCost = newTotalCost;
      }
    }
  }

  // 최적 조합 적용
  if (bestCombination.length > 0 && bestTotalCost < Infinity) {
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
          removedTotal: 0,
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
        quantity: card.quantity,
      });

      // 타겟 판매처 금액 업데이트
      targetSeller.subtotal += targetPrice;

      // 카드별 최적 구매처 정보 업데이트
      const cardPurchaseIndex = cardsOptimalPurchase.findIndex(c => c.cardName === card.cardName);
      if (cardPurchaseIndex !== -1) {
        cardsOptimalPurchase[cardPurchaseIndex] = {
          cardName: card.cardName,
          seller: targetSeller,
          price: card.targetPrice,
          totalPrice: card.targetPrice * card.quantity,
          quantity: card.quantity,
          product: card.targetProduct,
        };
      }
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
        seller.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity
          ? 0
          : shippingFee;

      // 총액 업데이트
      seller.total = seller.subtotal + seller.shippingFee;
    });

    // 타겟 판매처 배송비 재계산
    const { shippingFee, freeShippingThreshold } = sellerShippingInfo[targetSeller];
    purchaseDetails[targetSeller].shippingFee =
      purchaseDetails[targetSeller].subtotal >= freeShippingThreshold &&
      freeShippingThreshold !== Infinity
        ? 0
        : shippingFee;

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
function trySellersConsolidation(
  purchaseDetails,
  sellerShippingInfo,
  cardsOptimalPurchase,
  cardsList
) {
  // 사용 중인 판매처 목록
  const usedSellers = Object.keys(purchaseDetails).filter(
    seller => purchaseDetails[seller].subtotal > 0
  );

  // 판매처가 1-2개만 있으면 통합 불필요
  if (usedSellers.length <= 2) return false;

  // 사용중인 판매처 중 구매 금액이 가장 적은 순서로 정렬
  usedSellers.sort((a, b) => purchaseDetails[a].subtotal - purchaseDetails[b].subtotal);

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
        if (!purchaseDetails[targetSellerName] || purchaseDetails[targetSellerName].subtotal === 0)
          return;

        // 이동 비용 계산
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

      const newTargetShippingFee =
        newTargetSubtotal >= targetThreshold && targetThreshold !== Infinity
          ? 0
          : targetShippingFee;
      const newTargetTotal = newTargetSubtotal + newTargetShippingFee;

      // 소스 판매처는 비어질 것이므로 비용은 0
      const newTotalCost = newTargetTotal;

      // 실제 비용 감소인 경우에만 이동
      if (newTotalCost < originalCost) {
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
            quantity: move.sourceQuantity,
          });

          // 카드별 최적 구매처 정보 업데이트
          const cardPurchaseIndex = cardsOptimalPurchase.findIndex(
            c => c.cardName === move.cardName
          );
          if (cardPurchaseIndex !== -1) {
            cardsOptimalPurchase[cardPurchaseIndex] = {
              cardName: move.cardName,
              seller: bestTargetSeller,
              price: move.targetPrice,
              totalPrice: move.targetPrice * move.sourceQuantity,
              quantity: move.sourceQuantity,
              product: move.targetProduct,
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
function tryComplexOptimization(
  purchaseDetails,
  _sellerShippingInfo,
  _cardsOptimalPurchase,
  _cardsList
) {
  // 사용 중인 판매처 목록
  const usedSellers = Object.keys(purchaseDetails).filter(
    seller => purchaseDetails[seller].subtotal > 0
  );

  // 판매처가 2개 이하면 복잡한 최적화 불필요
  if (usedSellers.length <= 2) return false;

  // 배송비를 지불하는 판매처와 지불하지 않는 판매처 구분
  const payingShippingFee = usedSellers.filter(seller => {
    return purchaseDetails[seller].shippingFee > 0;
  });

  // 배송비 지불 판매처가 없으면 추가 최적화 불필요
  if (payingShippingFee.length === 0) return false;

  return false; // 현재 구현에서는 실제 최적화 시도 없음
}

module.exports = {
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization,
};
