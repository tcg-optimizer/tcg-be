const { getShippingInfo } = require('../shippingInfo');
const { getSellerId } = require('./cardUtils');
const { calculatePointsAmount } = require('./pointsUtils');
const {
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
} = require('./optimizationStrategies');

/**
 * 무료 배송 조건을 만족하는 카드 조합 생성
 * @param {Array<Object>} sortedCards - 정렬된 카드 목록
 * @param {string} seller - 판매처
 * @param {number} freeShippingThreshold - 무료배송 임계값
 * @param {Object} pointsOptions - 적립금 옵션
 * @param {Object} sellerShippingInfo - 판매처별 배송비 정보
 * @returns {Array<Object>} - 가능한 카드 조합 목록
 */
function generateFreeShippingCombinations(
  sortedCards,
  seller,
  freeShippingThreshold,
  pointsOptions,
  sellerShippingInfo
) {
  // 판매처에서 구매 가능한 카드만 필터링
  const availableCards = sortedCards.filter(card =>
    card.products.some(p => getSellerId(p.site) === seller)
  );

  // 각 카드의 이 판매처에서의 가격 정보 추출
  const cardsWithPrice = availableCards.map(card => {
    const product = card.products.find(p => getSellerId(p.site) === seller);
    // 각 카드의 모든 판매처 중 최저 가격 찾기
    const minPriceAcrossAllSellers = Math.min(...card.products.map(p => p.price));
    return {
      card,
      product,
      price: product.price,
      quantity: card.quantity || 1,
      totalPrice: product.price * (card.quantity || 1),
      priceDifference: product.price - minPriceAcrossAllSellers, // 이 판매처와 최저가의 차이
    };
  });

  // 다이나믹 프로그래밍으로 무료배송 조건을 만족하는 조합 찾기
  // (배낭 문제와 유사하게 접근)
  const combinations = [];
  const MAX_COMBINATIONS = 100; // 최대 조합 수 제한

  // 가격별로 정렬 (가격차이 적은 것부터)
  cardsWithPrice.sort((a, b) => a.priceDifference - b.priceDifference);

  // 재귀적으로 조합 생성 (백트래킹)
  function findCombinations(current, startIdx, currentSum) {
    // 무료배송 조건 달성시 조합 저장
    if (currentSum >= freeShippingThreshold) {
      combinations.push([...current]);
      return combinations.length >= MAX_COMBINATIONS;
    }

    // 최대 조합 수 초과시 중단
    if (combinations.length >= MAX_COMBINATIONS) {
      return true;
    }

    // 남은 모든 카드에 대해 조합 시도
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

  // 조합 찾기 시작
  findCombinations([], 0, 0);

  // 총 효율성 점수 계산 (가격과 차이를 모두 고려)
  combinations.forEach(combo => {
    const totalPrice = combo.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalPriceDifference = combo.reduce((sum, item) => sum + item.priceDifference, 0);

    // 효율성 점수 = 총 가격 + (가격 차이의 2배) - 절약된 배송비
    // 가격 차이에 가중치를 두어 지나치게 비싼 조합을 피함
    combo.efficiencyScore =
      totalPrice + totalPriceDifference * 2 - sellerShippingInfo[seller].shippingFee;
  });

  // 효율성 점수가 가장 낮은 순서로 정렬
  combinations.sort((a, b) => a.efficiencyScore - b.efficiencyScore);

  return combinations;
}

/**
 * 탐욕 알고리즘을 사용한 준최적해 찾기
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 추가 옵션
 * @returns {Object} - 최적 구매 조합
 */
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

  // 최적화 반복 횟수 고정값 사용
  const MAX_ITERATIONS = 100; // 고정값: 최적화 반복 횟수

  // 다양한 정렬 전략으로 여러 시도 수행
  const sortingStrategies = [
    // 1. 가격이 높은 카드부터 처리 (기존 방식)
    cards =>
      [...cards].sort((a, b) => {
        const aMinPrice = Math.min(...a.products.map(p => p.price));
        const bMinPrice = Math.min(...b.products.map(p => p.price));
        return bMinPrice - aMinPrice; // 내림차순 정렬
      }),
    // 2. 가격이 낮은 카드부터 처리
    cards =>
      [...cards].sort((a, b) => {
        const aMinPrice = Math.min(...a.products.map(p => p.price));
        const bMinPrice = Math.min(...b.products.map(p => p.price));
        return aMinPrice - bMinPrice; // 오름차순 정렬
      }),
    // 3. 가격 차이가 큰 카드부터 처리 (최저가와 최고가 차이가 큰 것)
    cards =>
      [...cards].sort((a, b) => {
        const aPrices = a.products.map(p => p.price);
        const bPrices = b.products.map(p => p.price);
        const aDiff = Math.max(...aPrices) - Math.min(...aPrices);
        const bDiff = Math.max(...bPrices) - Math.min(...bPrices);
        return bDiff - aDiff; // 차이가 큰 순서로
      }),
    // 4. 원본 순서 유지 (입력된 순서)
    cards => [...cards],
  ];

  // 적립금 고려 여부 출력
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

  // 각 카드별로 상위 판매처 고려 (고정값 사용)
  const maxSellersPerCard = 30; // 고정값: 각 카드별 고려할 최대 판매처 수
  const reducedCardsList = require('./cardUtils').filterTopSellers(cardsList, maxSellersPerCard);

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

    // 방문수령 옵션 확인
    const { TAKEOUT_INFO, TAKEOUT_KEY_MAPPING } = require('../shippingInfo');
    const takeoutOptions = options.takeout || [];

    // 네이버 판매자인 경우 'Naver_' 접두사 제거
    let sellerName = seller;
    if (sellerName.startsWith('Naver_')) {
      sellerName = sellerName.substring(6);
    }

    // 방문수령 옵션이 활성화된 상점인지 확인 (정규화된 이름으로 비교)
    const { normalizeSellerName } = require('../shippingInfo');
    const normalizedSellerName = normalizeSellerName(sellerName);

    let isTakeoutEnabled = false;
    let takeoutFee = null;

    if (takeoutOptions && takeoutOptions.length > 0) {
      // 프론트엔드 키를 실제 상점명으로 변환
      const enabledTakeoutStores = takeoutOptions
        .map(key => TAKEOUT_KEY_MAPPING[key])
        .filter(Boolean);

      // 현재 상점이 방문수령 활성화된 상점인지 확인 (정규화된 이름으로 비교)
      for (const enabledStore of enabledTakeoutStores) {
        const normalizedEnabledStore = normalizeSellerName(enabledStore);

        if (
          normalizedSellerName === normalizedEnabledStore &&
          TAKEOUT_INFO[enabledStore] !== undefined
        ) {
          isTakeoutEnabled = true;
          takeoutFee = TAKEOUT_INFO[enabledStore];
          console.log(`[INFO] "${sellerName}" 상점의 방문수령 옵션 적용: ${takeoutFee}원`);
          break;
        }
      }
    }

    if (isTakeoutEnabled) {
      // 방문수령인 경우 고정 비용으로 설정
      sellerShippingInfo[seller] = {
        ...info,
        shippingFee: takeoutFee,
        jejuShippingFee: takeoutFee,
        islandShippingFee: takeoutFee,
        freeShippingThreshold: Infinity, // 방문수령시 무료배송 조건 무시
      };
    } else {
      // 일반 배송인 경우 지역별 배송비 확인
      switch (shippingRegion) {
        case 'jeju':
          sellerShippingInfo[seller] = {
            ...info,
            shippingFee: info.jejuShippingFee || info.shippingFee,
          };
          break;
        case 'island':
          sellerShippingInfo[seller] = {
            ...info,
            shippingFee: info.islandShippingFee || info.shippingFee,
          };
          break;
        default:
          sellerShippingInfo[seller] = info;
      }
    }
  });

  // 리뷰 작성한 제품 목록 (ID 또는 이름)
  const reviewedProducts = new Set();

  // 각 정렬 전략별로 최적화 시도
  let bestSolution = null;
  let bestCost = Infinity;

  for (let strategyIndex = 0; strategyIndex < sortingStrategies.length; strategyIndex++) {
    // 정렬 전략 적용
    const sortedCards = sortingStrategies[strategyIndex](reducedCardsList);

    // 리뷰 제품 목록 초기화 (각 전략마다 리셋)
    reviewedProducts.clear();

    // 각 판매처별로 무료 배송 조건을 충족하는 카드 조합 탐색
    const freeShippingCombinationsBySeller = {};

    sellersList.forEach(seller => {
      const { freeShippingThreshold } = sellerShippingInfo[seller];

      // 무료 배송 임계값이 존재하는 경우에만 조합 찾기
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

    // 각 판매처별 구매 내역 초기화
    const purchaseDetails = {};
    sellersList.forEach(seller => {
      purchaseDetails[seller] = {
        cards: [],
        subtotal: 0,
        shippingFee: 0,
        total: 0,
        points: 0, // 적립 예정 포인트
      };
    });

    // 카드별 최적 구매처 정보
    const cardsOptimalPurchase = [];

    // 1단계: 무료 배송 조합을 우선적으로 할당
    const assignedCards = new Set();
    const freeShippingSellersSorted = Object.keys(freeShippingCombinationsBySeller).sort((a, b) => {
      // 배송비가 높은 판매처 우선 (배송비 절약 효과가 큰 순서)
      return sellerShippingInfo[b].shippingFee - sellerShippingInfo[a].shippingFee;
    });

    // 효율적인 무료 배송 조합 후보 목록 생성
    const efficientCombinations = [];

    // 각 판매처의 무료 배송 조합 평가
    for (const seller of freeShippingSellersSorted) {
      const combinations = freeShippingCombinationsBySeller[seller];
      const shippingFee = sellerShippingInfo[seller].shippingFee;

      for (const combo of combinations) {
        // 조합의 카드들에 대해 다른 판매처에서의 최저 가격 합계 계산
        let totalMinPriceElsewhere = 0;
        let totalPriceInThisSeller = 0;

        for (const item of combo) {
          // 같은 카드의 다른 판매처 최저가 찾기
          const cardInfo = sortedCards.find(
            c => (c.uniqueCardKey || c.cardName) === (item.card.uniqueCardKey || item.card.cardName)
          );
          const otherProducts = cardInfo.products.filter(p => getSellerId(p.site) !== seller);
          const minPriceElsewhere =
            otherProducts.length > 0
              ? Math.min(...otherProducts.map(p => p.price)) * item.quantity
              : Infinity;

          totalMinPriceElsewhere += minPriceElsewhere;
          totalPriceInThisSeller += item.totalPrice;
        }

        // 이 조합을 사용함으로써 절약되는 비용 (배송비 - 가격 차이)
        const calculatedSavings = shippingFee - (totalPriceInThisSeller - totalMinPriceElsewhere);

        if (calculatedSavings > 0) {
          // 배송비 절약이 가격 차이보다 클 경우만 고려
          efficientCombinations.push({
            seller,
            combo,
            savings: calculatedSavings,
            totalPrice: totalPriceInThisSeller,
          });
        }
      }
    }

    // 절약 효과가 큰 순서대로 정렬
    efficientCombinations.sort((a, b) => b.savings - a.savings);

    // 효율적인 조합 할당
    for (const { seller, combo } of efficientCombinations) {
      // 이미 할당된 카드 제외
      const availableItems = combo.filter(item => !assignedCards.has(item.card.cardName));

      if (availableItems.length > 0) {
        // 실제로 무료 배송 조건을 만족하는지 다시 확인
        const totalPrice = availableItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const freeShippingThreshold = sellerShippingInfo[seller].freeShippingThreshold;

        if (totalPrice >= freeShippingThreshold) {
          // 선택된 조합의 카드들 할당
          for (const item of availableItems) {
            const { card, product, price, quantity } = item;
            const cardName = card.cardName;
            const uniqueCardKey = card.uniqueCardKey || cardName;

            // 중복 할당 방지
            if (assignedCards.has(uniqueCardKey)) continue;
            assignedCards.add(uniqueCardKey);

            // 적립 예정 포인트 계산
            const productId = cardName; // 카드 이름을 제품 ID로 사용
            const earnablePoints = calculatePointsAmount(
              seller,
              price,
              quantity,
              productId,
              reviewedProducts,
              pointsOptions
            );

            // 구매 내역에 추가
            purchaseDetails[seller].cards.push({
              cardName,
              uniqueCardKey,
              price,
              product,
              quantity,
              points: earnablePoints, // 적립 예정 포인트
            });

            const cardPrice = price * quantity;
            purchaseDetails[seller].subtotal += cardPrice;
            purchaseDetails[seller].points += earnablePoints;

            // 카드별 최적 구매처 정보에 추가
            cardsOptimalPurchase.push({
              cardName,
              uniqueCardKey,
              seller,
              price,
              totalPrice: price * quantity,
              quantity,
              points: earnablePoints,
              product,
              cardId: product.cardId,
              // 선택된 상품의 상세 정보 추가
              rarity: product.rarity,
              language: product.language,
              illustration: product.illustration || 'default',
              url: product.url,
              site: product.site,
              available: product.available,
              cardCode: product.cardCode,
              condition: product.condition,
            });
          }

          // 해당 판매처의 배송비 업데이트
          const { freeShippingThreshold, shippingFee } = sellerShippingInfo[seller];
          purchaseDetails[seller].shippingFee =
            purchaseDetails[seller].subtotal >= freeShippingThreshold ? 0 : shippingFee;

          // 총 비용 업데이트 (적립금 고려 시 차감)
          purchaseDetails[seller].total =
            purchaseDetails[seller].subtotal +
            purchaseDetails[seller].shippingFee -
            purchaseDetails[seller].points;
        }
      }
    }

    // 2단계: 아직 할당되지 않은 카드는 일반 그리디 방식으로 할당
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
      const productId = uniqueCardKey; // 고유 카드 키를 제품 ID로 사용

      // 각 판매처별로 이 카드를 추가했을 때의 총 비용 계산
      products.forEach(product => {
        const seller = getSellerId(product.site);
        const currentSubtotal = purchaseDetails[seller].subtotal;
        const newSubtotal = currentSubtotal + product.price * quantity;

        // 배송비 계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
        const currentShippingFee = purchaseDetails[seller].shippingFee;
        const newShippingFee =
          newSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity
            ? 0
            : shippingFee;

        // 적립금 계산
        const earnablePoints = calculatePointsAmount(
          seller,
          product.price,
          quantity,
          productId,
          reviewedProducts,
          pointsOptions
        );

        // 이 카드를 이 판매처에 추가했을 때의 총 비용 변화 (적립금 고려)
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
        // 카드 가격 계산
        const cardPrice = bestProduct.price * quantity;

        // 적립 예정 포인트 계산
        const earnablePoints = calculatePointsAmount(
          bestSeller,
          bestProduct.price,
          quantity,
          productId,
          reviewedProducts,
          pointsOptions
        );

        // 구매 내역에 추가
        purchaseDetails[bestSeller].cards.push({
          cardName,
          uniqueCardKey,
          price: bestProduct.price,
          product: bestProduct,
          quantity,
          points: earnablePoints, // 적립 예정 포인트
        });

        purchaseDetails[bestSeller].subtotal += cardPrice;
        purchaseDetails[bestSeller].points += earnablePoints; // 판매처별 총 적립 포인트

        // 배송비 재계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[bestSeller];
        purchaseDetails[bestSeller].shippingFee =
          purchaseDetails[bestSeller].subtotal >= freeShippingThreshold &&
          freeShippingThreshold !== Infinity
            ? 0
            : shippingFee;

        // 총 비용 업데이트 (적립금 고려 시 차감)
        purchaseDetails[bestSeller].total =
          purchaseDetails[bestSeller].subtotal +
          purchaseDetails[bestSeller].shippingFee -
          purchaseDetails[bestSeller].points;

        // 카드별 최적 구매처 정보에 추가
        cardsOptimalPurchase.push({
          cardName,
          uniqueCardKey,
          seller: bestSeller,
          price: bestProduct.price,
          totalPrice: bestProduct.price * quantity,
          quantity,
          points: earnablePoints, // 적립 예정 포인트
          product: bestProduct,
          cardId: bestProduct.cardId,
          // 선택된 상품의 상세 정보 추가
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

    // 3단계: 추가 최적화 - 배송비 최적화 및 판매처 통합
    let improved = true;
    let iterations = 0;

    while (improved && iterations < MAX_ITERATIONS) {
      improved = false;
      iterations++;

      // 판매처 그룹화: 배송비를 지불하는 판매처와 배송비 면제 판매처
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

      // 배송비 지불 판매처가 없으면 종료
      if (payingShippingFee.length === 0) {
        break;
      }

      // 3.1. 무료배송 임계값 전략: 임계값에 가까운 판매처는 추가 구매로, 멀리 있는 판매처는 통합
      payingShippingFee.sort((a, b) => {
        const aGap = sellerShippingInfo[a].freeShippingThreshold - purchaseDetails[a].subtotal;
        const bGap = sellerShippingInfo[b].freeShippingThreshold - purchaseDetails[b].subtotal;

        // 무료배송 임계값이 없는 경우(Infinity) 항상 뒤로
        if (sellerShippingInfo[a].freeShippingThreshold === Infinity) return 1;
        if (sellerShippingInfo[b].freeShippingThreshold === Infinity) return -1;

        return aGap - bGap; // 면제 임계값에 가까운 순서로 정렬
      });

      // 3.2. 각 배송비 지불 판매처에 대해 최적화 전략 적용
      for (const sourceSellerName of payingShippingFee) {
        const sourceSeller = purchaseDetails[sourceSellerName];
        const sourceThreshold = sellerShippingInfo[sourceSellerName].freeShippingThreshold;
        const sourceShippingFee = sellerShippingInfo[sourceSellerName].shippingFee;
        const gapToThreshold = sourceThreshold - sourceSeller.subtotal;

        // 전략 1: 무료배송 임계값에 가까운 경우, 추가 구매로 무료배송 달성 시도
        if (sourceThreshold !== Infinity && gapToThreshold <= sourceShippingFee * 2) {
          // 무료배송 조합 재확인
          if (freeShippingCombinationsBySeller[sourceSellerName]) {
            const availableCombos = freeShippingCombinationsBySeller[sourceSellerName].filter(
              combo => {
                // 현재 구매 내역에 없는 카드만 포함
                return combo.every(
                  item => !sourceSeller.cards.some(card => card.cardName === item.card.cardName)
                );
              }
            );

            if (availableCombos.length > 0) {
              // 이미 할당된 카드 중 다른 무료 배송 조합에 포함된 것들 필터링
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

              // 가장 비용 효율적인 이동 선택
              potentialMoves.sort((a, b) => a.totalPrice - b.totalPrice);

              if (potentialMoves.length > 0) {
                const bestMove = potentialMoves[0];
                improved = true;

                // 카드 이동 실행
                for (const item of bestMove.neededCards) {
                  const { card, product, price, quantity } = item;
                  const cardName = card.cardName;

                  // 소스 판매처에서 카드 제거
                  const cardIndex = sourceSeller.cards.findIndex(c => {
                    const cUniqueKey = c.uniqueCardKey || c.cardName;
                    return cUniqueKey === (card.uniqueCardKey || card.cardName);
                  });
                  if (cardIndex !== -1) {
                    sourceSeller.cards.splice(cardIndex, 1);
                  }

                  // 새 판매처에 카드 추가
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

                  // 카드별 최적 구매처 정보 업데이트
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
                      // 선택된 상품의 상세 정보 추가
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

                // 배송비 재계산
                // 원본 판매처
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
                  const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];

                  details.shippingFee =
                    details.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity
                      ? 0
                      : shippingFee;

                  details.total = details.subtotal + details.shippingFee - details.points;
                }

                continue;
              }
            }
          }

          // 이전 방식의 최적화 시도
          // 다른 판매처에서 이 판매처로 상품 이동 시도 (무료배송 달성)
          let foundImprovement = tryMoveCardsToReachThreshold(
            sourceSellerName,
            gapToThreshold,
            purchaseDetails,
            sellerShippingInfo,
            cardsOptimalPurchase,
            reducedCardsList
          );

          if (foundImprovement) {
            improved = true;
            continue;
          }

          // 추가 시도: 다른 카드 조합으로 무료배송 달성 가능한지 탐색
          foundImprovement = tryMultipleCardsMove(
            sourceSellerName,
            gapToThreshold,
            purchaseDetails,
            sellerShippingInfo,
            cardsOptimalPurchase,
            reducedCardsList
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
          const productId = card.cardName; // 카드 이름을 제품 ID로 사용
          const cardUniqueKey = card.uniqueCardKey || card.cardName; // uniqueCardKey 사용

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

            // 적립금 변화 계산
            // 원래 소스에서 이 카드에 대한 적립금
            const oldSourcePoints = card.points || 0;

            // 타겟 판매처에서 이 카드에 대한 적립금
            const newTargetPoints = calculatePointsAmount(
              targetSellerName,
              alt.price,
              alt.quantity,
              productId,
              reviewedProducts,
              pointsOptions
            );

            // 새로운 배송비 계산
            const { shippingFee: sourceShippingFee } = sellerShippingInfo[sourceSellerName];
            const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } =
              sellerShippingInfo[targetSellerName];

            const newSourceShippingFee =
              newSourceSubtotal > 0
                ? newSourceSubtotal >= sourceThreshold && sourceThreshold !== Infinity
                  ? 0
                  : sourceShippingFee
                : 0;
            // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
            const newTargetShippingFee =
              newTargetSubtotal >= targetThreshold && targetThreshold !== Infinity
                ? 0
                : targetShippingFee;

            // 현재 비용과 새 비용 비교
            const newSourceTotal =
              newSourceSubtotal + newSourceShippingFee - (sourceSeller.points - oldSourcePoints);
            const newTargetTotal =
              newTargetSubtotal + newTargetShippingFee - (targetSeller.points + newTargetPoints);
            const newTotalCost = newSourceTotal + newTargetTotal;

            // 비용이 줄어들면 카드 이동
            if (
              newTotalCost < originalCost &&
              (newTotalCost < originalCost || newSourceSubtotal === 0)
            ) {
              // 소스 판매처에서 카드 제거
              const cardIndex = sourceSeller.cards.findIndex(c => {
                const cUniqueKey = c.uniqueCardKey || c.cardName;
                return cUniqueKey === (card.uniqueCardKey || card.cardName);
              });
              if (cardIndex !== -1) {
                sourceSeller.cards.splice(cardIndex, 1);
              }
              sourceSeller.subtotal = newSourceSubtotal;
              sourceSeller.points -= oldSourcePoints; // 포인트 감소
              sourceSeller.shippingFee = newSourceShippingFee;
              sourceSeller.total = newSourceTotal;

              // 타겟 판매처에 카드 추가
              targetSeller.cards.push({
                cardName: card.cardName,
                uniqueCardKey: card.uniqueCardKey || card.cardName,
                price: alt.price,
                product: alt.product,
                quantity: alt.quantity,
                points: newTargetPoints, // 적립 예정 포인트
              });

              targetSeller.subtotal = newTargetSubtotal;
              targetSeller.shippingFee = newTargetShippingFee;
              targetSeller.total = newTargetTotal;
              targetSeller.points += newTargetPoints;

              // 카드별 최적 구매처 정보 업데이트
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
                  // 선택된 상품의 상세 정보 추가
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
    const MAX_CONSOLIDATION_ITERATIONS = 5; // 통합 시도 최대 횟수 제한

    while (consolidationImproved && consolidationIterations < MAX_CONSOLIDATION_ITERATIONS) {
      consolidationImproved = trySellersConsolidation(
        purchaseDetails,
        sellerShippingInfo,
        cardsOptimalPurchase,
        reducedCardsList
      );
    }

    // 최종 결과 계산
    let totalCost = 0;
    let totalProductCost = 0;
    let totalShippingCost = 0;
    let totalPointsEarned = 0;

    sellersList.forEach(seller => {
      const details = purchaseDetails[seller];
      if (details.subtotal > 0) {
        // 배송비 한번 더 검증하여 계산
        const { freeShippingThreshold, shippingFee } = sellerShippingInfo[seller];
        details.shippingFee =
          details.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity
            ? 0
            : shippingFee;
        details.total = details.subtotal + details.shippingFee - details.points;

        totalCost += details.total;
        totalProductCost += details.subtotal;
        totalShippingCost += details.shippingFee;
        totalPointsEarned += details.points;
      }
    });

    // 최종 적립금 합계 재계산 (리뷰 적립금이 추가되었을 수 있으므로)
    totalPointsEarned = sellersList.reduce(
      (sum, seller) => sum + purchaseDetails[seller].points,
      0
    );

    // totalCost 재계산 (totalPointsEarned가 업데이트된 값으로)
    totalCost = totalProductCost + totalShippingCost - totalPointsEarned;

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

      // cardsOptimalPurchase 형식 변경 - 각 상점별로 그룹화
      const groupedCardsByStore = {};
      const cardImagesMap = {};

      // 각 카드를 상점별로 그룹화
      cardsOptimalPurchase.forEach(card => {
        // 카드 이미지 수집 - 실제 선택된 상품의 레어도에 맞는 이미지 사용
        const imageKey = card.uniqueCardKey || card.cardName; // uniqueCardKey 우선 사용
        if (!cardImagesMap[imageKey]) {
          const cardInfo = reducedCardsList.find(
            c => (c.uniqueCardKey || c.cardName) === (card.uniqueCardKey || card.cardName)
          );
          let selectedImage = null;

          // 1. 선택된 상품의 레어도와 일러스트에 맞는 이미지 찾기 (최우선)
          if (cardInfo && cardInfo.rarityPrices) {
            // product에서 속성을 가져옴
            const selectedRarity = card.product?.rarity || card.rarity;
            const selectedLanguage = card.product?.language || card.language;
            const selectedIllustration =
              card.product?.illustration || card.illustration || 'default';

            // rarityPrices가 문자열인 경우 파싱
            const rarityPrices =
              typeof cardInfo.rarityPrices === 'string'
                ? JSON.parse(cardInfo.rarityPrices)
                : cardInfo.rarityPrices;

            // rarityPrices에서 선택된 레어도/언어/일러스트에 맞는 이미지 찾기
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

            // 정확한 조합을 찾지 못했으면 다른 일러스트에서 같은 언어/레어도 조합 찾기
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

            // 여전히 없으면 같은 레어도의 다른 언어에서 찾기
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

            // 그래도 없으면 첫 번째 이미지 사용
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

          // 2. 선택된 상품 자체에 이미지가 있는 경우
          if (!selectedImage && card.product && card.product.image) {
            selectedImage = card.product.image;
          }

          // 3. 카드 자체의 image 속성 사용
          if (!selectedImage && cardInfo && cardInfo.image) {
            selectedImage = cardInfo.image;
          }

          // 4. 카드의 products 배열에서 첫 번째 상품의 이미지 사용
          if (!selectedImage && cardInfo && cardInfo.products && cardInfo.products.length > 0) {
            const firstProduct = cardInfo.products[0];
            if (firstProduct.image) {
              selectedImage = firstProduct.image;
            }
          }

          // 5. 마지막 대안: 모든 상품을 검사하여 이미지 찾기
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

        // 상점별 그룹화
        if (!groupedCardsByStore[card.seller]) {
          groupedCardsByStore[card.seller] = {
            cards: [],
            finalPrice: 0,
            productCost: 0,
            shippingCost: 0,
            pointsEarned: 0,
          };
        }

        // 개별 카드의 이미지 결정 (레어도에 맞는 이미지 우선 사용)
        let cardImage = cardImagesMap[imageKey];

        // 실제 선택된 상품에 이미지가 있으면 우선 사용
        if (card.product && card.product.image) {
          cardImage = card.product.image;
        }

        // 카드 정보 추가
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
            illustration: card.illustration || card.product?.illustration || 'default', // illustration 필드 추가
            cardId: card.cardId, // product에 cardId 추가
          },
          image: cardImage, // 레어도에 맞는 이미지 또는 실제 상품 이미지 사용
          cardId: card.cardId, // 카드 자체에도 cardId 추가
        });
      });

      // 각 상점별 합계 정보 추가
      usedSellers.forEach(seller => {
        if (groupedCardsByStore[seller]) {
          const details = finalPurchaseDetails[seller];
          groupedCardsByStore[seller].finalPrice = details.total;
          groupedCardsByStore[seller].productCost = details.subtotal;
          groupedCardsByStore[seller].shippingCost = details.shippingFee;
          groupedCardsByStore[seller].pointsEarned = details.points;
        }
      });

      // 최종 적립금 합계 재계산 (리뷰 적립금이 추가되었을 수 있으므로)
      totalPointsEarned = usedSellers.reduce(
        (sum, seller) => sum + finalPurchaseDetails[seller].points,
        0
      );

      // totalCost 재계산 (totalPointsEarned가 업데이트된 값으로)
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
        version: 'v3.1.0',
      };
    }
  }

  return bestSolution;
}

/**
 * 상품의 일관된 ID 생성 함수
 * 사이트별로 다른 접두어를 사용하여 동일 상품이 항상 같은 ID를 갖도록 합니다
 * @param {Object} card - 카드 정보 객체
 * @returns {string} 일관된 상품 ID
 */
function generateConsistentProductId(card) {
  const site = card.site || card.product?.site;
  const url = card.url || card.product?.url;
  const existingId = card.product?.id || card.productId;

  // 카드 고유 정보
  const cardName = card.cardName || '';
  const rarity = card.rarity || card.product?.rarity || '';
  const language = card.language || card.product?.language || '';
  const cardCode = card.cardCode || card.product?.cardCode || '';

  // 이미 일관된 ID 형식을 가진 경우 그대로 반환
  if (
    existingId &&
    typeof existingId === 'string' &&
    (existingId.startsWith('tcg-') ||
      existingId.startsWith('carddc-') ||
      existingId.startsWith('onlyyugioh-'))
  ) {
    return existingId;
  }

  // TCGShop 상품의 경우
  if (site === 'TCGShop') {
    // URL에서 goodsIdx 추출 시도
    if (url && url.includes('goodsIdx=')) {
      const match = url.match(/goodsIdx=(\d+)/);
      if (match && match[1]) {
        return `tcg-${match[1]}`; // TCGShop 상품은 tcg- 접두어 사용
      }
    }

    // 기존 ID가 있는 경우 접두어 추가
    if (existingId) {
      return `tcg-${existingId}`;
    }

    // 카드 정보로 해시 생성 (URL이 없는 경우)
    const cardIdentity = `${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
    const hashCode = simpleStringHash(cardIdentity);
    return `tcg-${hashCode}`;
  }

  // CardDC 상품의 경우
  if (site === 'CardDC') {
    // 기존 ID가 있는 경우 접두어 추가
    if (existingId) {
      return `carddc-${existingId}`;
    }

    // URL에서 상품 ID 추출 시도
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

  // OnlyYugioh 상품의 경우
  if (site === 'OnlyYugioh') {
    // 기존 ID가 있는 경우 접두어 추가
    if (existingId) {
      return `onlyyugioh-${existingId}`;
    }

    // URL에서 상품 ID 추출 시도
    if (url) {
      const productMatch = url.match(/product\/(\d+)/);
      if (productMatch && productMatch[1]) {
        return `onlyyugioh-${productMatch[1]}`;
      }
      const productNoMatch = url.match(/product_no=(\d+)/);
      if (productNoMatch && productNoMatch[1]) {
        return `onlyyugioh-${productNoMatch[1]}`;
      }
    }

    // 카드 정보로 해시 생성 (URL이 없는 경우)
    const cardIdentity = `${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
    const hashCode = simpleStringHash(cardIdentity);
    return `onlyyugioh-${hashCode}`;
  }

  // 그 외 사이트는 기존 ID 사용 또는 카드 정보 기반 해시 생성
  if (existingId) {
    return existingId.toString();
  }

  // 카드 정보로 해시 생성
  const cardIdentity =
    `${site || 'unknown'}-${cardName}-${rarity}-${language}-${cardCode}`.toLowerCase();
  const hashCode = simpleStringHash(cardIdentity);
  return `${site || 'unknown'}-${hashCode}`;
}

/**
 * 문자열에서 일관된 해시 코드를 생성하는 간단한 함수
 * 동일한 입력에 대해 항상 동일한 출력을 보장합니다
 * @param {string} str - 해시할 문자열
 * @returns {string} - 해시 코드 (16진수 문자열)
 */
function simpleStringHash(str) {
  let hash = 0;

  if (!str || str.length === 0) {
    return hash.toString(16);
  }

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32비트 정수로 변환
  }

  return Math.abs(hash).toString(16); // 16진수로 변환하고 절대값 사용
}

module.exports = {
  findGreedyOptimalPurchase,
};
