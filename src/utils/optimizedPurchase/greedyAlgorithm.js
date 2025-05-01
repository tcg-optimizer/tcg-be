/**
 * 그리디 알고리즘 기반 최적 구매 조합 모듈
 * 
 * v3.0.0 - 개선된 점수 시스템 기반 알고리즘
 * - 가격 차이에 더 높은 가중치 부여 (5%, 10%, 15% 기준)
 * - 무료배송 임계값보다 실제 가격 절감에 우선순위 부여
 * - 다양한 카드 정렬 및 판매처 정렬 전략 추가 (6×6 = 36가지 조합)
 * - 판매처 통합 시 의미 있는 비용 절감(1% 이상)이 있을 때만 적용
 * - 카드 이동 최적화 시 실질적인 비용 절감이 있을 때만 적용
 */

const { getShippingInfo } = require('../shippingInfo');
const { getSellerId, filterTopSellers } = require('./cardUtils');
const { calculatePointsAmount } = require('./pointsUtils');
const { 
  tryMoveCardsToReachThreshold, 
  tryMultipleCardsMove, 
  trySellersConsolidation 
} = require('./optimizationStrategies');

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
    naverHyundaiCard: false
  };
  
  // 적립금 고려 여부 출력
  const considerPointsStr = Object.entries(pointsOptions)
    .filter(([_, enabled]) => enabled)
    .map(([store]) => store)
    .join(', ');
  
  console.log('\n[개선된 탐욕 알고리즘 실행] 배송 지역:', shippingRegion, 
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
  
  // 각 카드별로 상위 판매처 고려 (고정값 사용)
  const maxSellersPerCard = 30; // 고정값: 각 카드별 고려할 최대 판매처 수
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
    cards => [...cards],
    // 5. 가격 편차 비율이 큰 카드부터 처리 (가격 편차 / 최저가)
    cards => [...cards].sort((a, b) => {
      const aPrices = a.products.map(p => p.price);
      const bPrices = b.products.map(p => p.price);
      const aMin = Math.min(...aPrices);
      const bMin = Math.min(...bPrices);
      const aRange = Math.max(...aPrices) - aMin;
      const bRange = Math.max(...bPrices) - bMin;
      // 최소 가격으로 나눈 범위 (비율)
      const aRatio = aRange / aMin;
      const bRatio = bRange / bMin;
      return bRatio - aRatio; // 비율이 큰 순서로
    }),
    // 6. 판매처 다양성이 큰 카드부터 처리
    cards => [...cards].sort((a, b) => {
      const aSellerCount = new Set(a.products.map(p => getSellerId(p.site))).size;
      const bSellerCount = new Set(b.products.map(p => getSellerId(p.site))).size;
      return bSellerCount - aSellerCount; // 판매처가 많은 것부터
    })
  ];
  
  // [개선] 다양한 무료 배송 조합을 위한 전략들 추가
  const freeShippingStrategies = [
    // 1. 가장 큰 무료배송 임계값을 가진 판매처 우선 (많은 제품을 한 곳에서 구매)
    sellers => [...sellers].sort((a, b) => {
      const aThreshold = sellerShippingInfo[a].freeShippingThreshold;
      const bThreshold = sellerShippingInfo[b].freeShippingThreshold;
      // Infinity는 무료배송 없음을 의미하므로 최하위로
      if (aThreshold === Infinity) return 1;
      if (bThreshold === Infinity) return -1;
      return bThreshold - aThreshold; // 임계값이 큰 순서로
    }),
    // 2. 가장 작은 무료배송 임계값을 가진 판매처 우선 (쉽게 무료배송 달성)
    sellers => [...sellers].sort((a, b) => {
      const aThreshold = sellerShippingInfo[a].freeShippingThreshold;
      const bThreshold = sellerShippingInfo[b].freeShippingThreshold;
      // Infinity는 무료배송 없음을 의미하므로 최하위로
      if (aThreshold === Infinity) return 1;
      if (bThreshold === Infinity) return -1;
      return aThreshold - bThreshold; // 임계값이 작은 순서로
    }),
    // 3. 배송비가 가장 비싼 판매처 우선 (배송비 절약 효과 극대화)
    sellers => [...sellers].sort((a, b) => {
      return sellerShippingInfo[b].shippingFee - sellerShippingInfo[a].shippingFee;
    }),
    // 4. 원본 순서 유지
    sellers => [...sellers],
    // 5. 판매처 이름 알파벳 순 (균일한 결과를 위한 결정론적 방법)
    sellers => [...sellers].sort((a, b) => a.localeCompare(b)),
    // 6. 배송비와 임계값 비율이 높은 순 (배송비 대비 무료배송 달성 효율)
    sellers => [...sellers].sort((a, b) => {
      const aThreshold = sellerShippingInfo[a].freeShippingThreshold;
      const bThreshold = sellerShippingInfo[b].freeShippingThreshold;
      const aFee = sellerShippingInfo[a].shippingFee;
      const bFee = sellerShippingInfo[b].shippingFee;
      
      // Infinity는 무료배송 없음을 의미하므로 최하위로
      if (aThreshold === Infinity) return 1;
      if (bThreshold === Infinity) return -1;
      
      // 배송비 대비 임계값 비율 (낮을수록 더 효율적)
      const aRatio = aThreshold / aFee;
      const bRatio = bThreshold / bFee;
      
      return aRatio - bRatio; // 효율이 좋은 순서로
    })
  ];
  
  // 최적화 반복 횟수 고정값 사용
  const MAX_ITERATIONS = 50;
  
  // [개선] 여러 무료 배송 조합을 시도하고 비교
  let globalBestSolution = null;
  let globalBestCost = Infinity;
  
  console.log(`[개선된 탐욕] 카드 정렬 전략 ${sortingStrategies.length}개 × 판매처 정렬 전략 ${freeShippingStrategies.length}개 = 총 ${sortingStrategies.length * freeShippingStrategies.length}가지 조합으로 최적화 시도`);
  
  // 모든 카드 정렬 전략과 무료배송 전략 조합 시도
  for (let strategyIndex = 0; strategyIndex < sortingStrategies.length; strategyIndex++) {
    for (let freeShippingStrategyIndex = 0; freeShippingStrategyIndex < freeShippingStrategies.length; freeShippingStrategyIndex++) {
      console.log(`\n[개선된 탐욕] 전략 시도: 카드정렬#${strategyIndex + 1} × 판매처정렬#${freeShippingStrategyIndex + 1}`);
      
      // 정렬 전략 적용
      const sortedCards = sortingStrategies[strategyIndex](reducedCardsList);
      const prioritizedSellers = freeShippingStrategies[freeShippingStrategyIndex](sellersList);
      
      // 리뷰 제품 목록 초기화 (각 전략마다 리셋)
      const reviewedProducts = new Set();
      
      // 각 판매처별 구매 내역 초기화
      const purchaseDetails = {};
      sellersList.forEach(seller => {
        purchaseDetails[seller] = {
          cards: [],
          subtotal: 0,
          shippingFee: 0,
          total: 0,
          points: 0  // 적립 예정 포인트
        };
      });
      
      // 카드별 최적 구매처 정보
      const cardsOptimalPurchase = [];
      
      // [개선] 무료배송 임계값에 가까운 판매처 우선 할당 시도
      // 각 카드에 대해 다양한 판매처 조합을 고려
      sortedCards.forEach((cardInfo, index) => {
        const { cardName, products, quantity = 1 } = cardInfo;
        
        // 카드가 구매 가능한 모든 판매처 정보 수집
        const availableSellers = [];
        
        products.forEach(product => {
          const sellerId = getSellerId(product.site);
          availableSellers.push({
            sellerId,
            product,
            price: product.price,
            totalPrice: product.price * quantity
          });
        });
        
        // 판매처별 무료배송 달성 가능성 평가
        const sellerEvaluations = [];
        
        // 우선순위가 지정된 판매처 순서대로 각 판매처 평가
        for (const sellerId of prioritizedSellers) {
          // 현재 카드가 이 판매처에서 구매 가능한지 확인
          const sellerProducts = availableSellers.filter(s => s.sellerId === sellerId);
          if (sellerProducts.length === 0) continue;
          
          // 이 판매처의 가장 저렴한 제품 선택
          const cheapestProduct = sellerProducts.reduce(
            (min, curr) => curr.price < min.price ? curr : min, 
            sellerProducts[0]
          );
          
          const { shippingFee, freeShippingThreshold } = sellerShippingInfo[sellerId];
          const currentSubtotal = purchaseDetails[sellerId].subtotal;
          const newSubtotal = currentSubtotal + cheapestProduct.totalPrice;
          
          // 무료배송 달성 여부 및 임계값까지 남은 금액 계산
          const currentlyFreeShipping = currentSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity;
          const willBeFreeShipping = newSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity;
          const gapToThreshold = freeShippingThreshold !== Infinity ? Math.max(0, freeShippingThreshold - currentSubtotal) : Infinity;
          
          // 적립금 계산
          const productId = cardName;
          const earnablePoints = calculatePointsAmount(sellerId, cheapestProduct.price, quantity, productId, reviewedProducts, pointsOptions);
          
          // 배송비 절약 효과 (무료배송 달성 시)
          const shippingSavings = currentlyFreeShipping ? 0 : (willBeFreeShipping ? shippingFee : 0);
          
          // 총 비용 변화 (제품가격 + 배송비 변화 - 적립금)
          const costDifference = cheapestProduct.totalPrice - shippingSavings - earnablePoints;
          
          // 무료배송 달성 임박도 (0에 가까울수록 임계값에 가까움)
          // 이미 무료배송이거나 달성 예정이면 0, 아니면 임계값까지 남은 금액 비율
          const thresholdProximity = 
            currentlyFreeShipping || willBeFreeShipping ? 
            0 : 
            (freeShippingThreshold !== Infinity ? 
              (freeShippingThreshold - newSubtotal) / freeShippingThreshold : 
              1);
          
          sellerEvaluations.push({
            sellerId,
            product: cheapestProduct.product,
            price: cheapestProduct.price,
            totalPrice: cheapestProduct.totalPrice,
            currentSubtotal,
            newSubtotal,
            costDifference,
            shippingSavings,
            earnablePoints,
            currentlyFreeShipping,
            willBeFreeShipping,
            gapToThreshold,
            thresholdProximity
          });
        }
        
        // 판매처 평가 결과 정렬 (복합 기준)
        sellerEvaluations.forEach(evaluation => {
          // 각 평가 기준에 대한 점수 부여 (낮을수록 좋음)
          let score = 0;
          
          // 1. 가격 점수 (가장 중요한 요소)
          const lowestPrice = Math.min(...sellerEvaluations.map(e => e.price));
          const priceDiff = evaluation.price - lowestPrice;
          const priceRatio = priceDiff / lowestPrice;
          
          // 가격 차이가 15% 이상이면 매우 불리한 점수
          if (priceRatio > 0.15) {
            score += 1000;
          } 
          // 가격 차이가 10% 이상이면 불리한 점수
          else if (priceRatio > 0.10) {
            score += 500;
          }
          // 가격 차이가 5% 이상이면 다소 불리한 점수
          else if (priceRatio > 0.05) {
            score += 100;
          }
          // 최저가에 가까울수록 좋은 점수
          else {
            score += priceRatio * 1000;
          }
          
          // 2. 무료배송 점수
          if (evaluation.currentlyFreeShipping) {
            // 이미 무료배송인 경우 최상의 점수
            score -= 50;
          } else if (evaluation.willBeFreeShipping) {
            // 이 카드 추가로 무료배송 달성하는 경우 좋은 점수
            score -= 40;
          } else if (evaluation.gapToThreshold < sellerShippingInfo[evaluation.sellerId].shippingFee) {
            // 무료배송까지 배송비보다 적게 남은 경우 우대
            score -= 20;
          } else if (evaluation.gapToThreshold < sellerShippingInfo[evaluation.sellerId].shippingFee * 2) {
            // 무료배송까지 배송비의 2배보다 적게 남은 경우 약간 우대
            score -= 10;
          } else {
            // 임계값 근접도에 따라 점수 차등 (0에 가까울수록 좋음)
            score += evaluation.thresholdProximity * 20;
          }
          
          // 3. 적립금 점수
          if (evaluation.earnablePoints > 0) {
            // 적립금 비율 (적립금/가격)
            const pointsRatio = evaluation.earnablePoints / evaluation.price;
            // 적립금 비율에 따라 점수 차감 (최대 -30)
            score -= pointsRatio * 300;
          }
          
          // 최종 점수 할당
          evaluation.score = score;
        });
        
        // 점수 기준으로 정렬 (낮은 점수 = 좋은 평가)
        sellerEvaluations.sort((a, b) => a.score - b.score);
        
        // 상위 3개 판매처 점수 로깅 (디버깅용)
        if (sellerEvaluations.length >= 3) {
          console.log(`${cardName} 판매처 점수:`, 
            sellerEvaluations.slice(0, 3).map(e => 
              `${e.sellerId}(${e.score.toFixed(2)}, ${e.price}원)`
            ).join(', ')
          );
        }
        
        // 최적 판매처 선택
        if (sellerEvaluations.length > 0) {
          const bestEvaluation = sellerEvaluations[0];
          const sellerId = bestEvaluation.sellerId;
          const product = bestEvaluation.product;
          const price = bestEvaluation.price;
          const totalPrice = bestEvaluation.totalPrice;
          const earnablePoints = bestEvaluation.earnablePoints;
          
          // 선택 이유 로깅
          if (bestEvaluation.currentlyFreeShipping) {
            console.log(`${cardName}: ${sellerId} 선택 (이미 무료배송 중)`);
          } else if (bestEvaluation.willBeFreeShipping) {
            console.log(`${cardName}: ${sellerId} 선택 (무료배송 달성, 배송비 ${bestEvaluation.shippingSavings}원 절약)`);
          } else if (bestEvaluation.gapToThreshold < 10000) {
            console.log(`${cardName}: ${sellerId} 선택 (무료배송까지 ${bestEvaluation.gapToThreshold}원 남음)`);
          }
          
          // 구매 내역에 추가
          purchaseDetails[sellerId].cards.push({
            cardName,
            price,
            product,
            quantity,
            points: earnablePoints
          });
          
          purchaseDetails[sellerId].subtotal += totalPrice;
          purchaseDetails[sellerId].points += earnablePoints;
          
          // 카드별 최적 구매처 정보 추가
          cardsOptimalPurchase.push({
            cardName,
            seller: sellerId,
            price,
            totalPrice,
            quantity,
            product
          });
        } else {
          console.log(`[WARN] 카드 ${cardName}에 대한 판매처를 찾을 수 없습니다.`);
        }
      });
      
      // 판매처별 배송비 및 총액 계산
      let totalProductCost = 0;
      let totalShippingCost = 0;
      let totalPointsEarned = 0;
      
      Object.keys(purchaseDetails).forEach(seller => {
        const purchase = purchaseDetails[seller];
        
        // 구매 내역이 없는 판매처는 건너뜀
        if (purchase.cards.length === 0) {
          return;
        }
        
        totalProductCost += purchase.subtotal;
        
        // 배송비 계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
        purchase.shippingFee = purchase.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
        totalShippingCost += purchase.shippingFee;
        
        // 적립금
        totalPointsEarned += purchase.points;
        
        // 총액 계산
        purchase.total = purchase.subtotal + purchase.shippingFee - purchase.points;
      });
      
      // 최적화 진행
      let iteration = 0;
      let improved = true;
      
      while (improved && iteration < MAX_ITERATIONS) {
        improved = false;
        iteration++;
        
        // 무료배송 임계값에 가까운 판매처 찾기
        const sellersNearThreshold = [];
        
        Object.keys(purchaseDetails).forEach(seller => {
          const purchase = purchaseDetails[seller];
          if (purchase.cards.length === 0) return;
          
          const { freeShippingThreshold } = sellerShippingInfo[seller];
          // 무료배송 임계값이 있고, 현재 소계가 임계값보다 작은 경우
          if (freeShippingThreshold !== Infinity && purchase.subtotal < freeShippingThreshold) {
            const gapToThreshold = freeShippingThreshold - purchase.subtotal;
            // 임계값까지의 차이가 배송비보다 작거나 같으면 최적화 시도
            if (gapToThreshold <= sellerShippingInfo[seller].shippingFee * 2) {
              sellersNearThreshold.push({
                seller,
                gapToThreshold,
                shippingFee: sellerShippingInfo[seller].shippingFee
              });
            }
          }
        });
        
        // 배송비가 큰 판매처부터 최적화 시도 (배송비 절약 효과가 큰 순)
        sellersNearThreshold.sort((a, b) => b.shippingFee - a.shippingFee);
        
        // 각 판매처에 대해 무료배송 달성 시도
        for (const { seller, gapToThreshold } of sellersNearThreshold) {
          // 단일 카드 이동으로 무료배송 달성 시도
          const moveResult = tryMoveCardsToReachThreshold(
            seller, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
          );
          
          if (moveResult) {
            improved = true;
            break;
          }
          
          // 여러 카드 조합으로 무료배송 달성 시도
          const multiMoveResult = tryMultipleCardsMove(
            seller, gapToThreshold, purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
          );
          
          if (multiMoveResult) {
            improved = true;
            break;
          }
        }
        
        // 판매처 통합 최적화 (하나의 판매처에서 구매 집중)
        if (!improved) {
          const consolidationResult = trySellersConsolidation(
            purchaseDetails, sellerShippingInfo, cardsOptimalPurchase, reducedCardsList
          );
          
          if (consolidationResult) {
            improved = true;
          }
        }
      }
      
      // 최종 비용 계산
      let totalCost = 0;
      let totalStores = 0;
      
      Object.keys(purchaseDetails).forEach(seller => {
        const purchase = purchaseDetails[seller];
        if (purchase.cards.length === 0) return;
        
        totalStores++;
        // 각 판매처의 총 비용을 다시 계산
        purchase.total = purchase.subtotal + purchase.shippingFee - purchase.points;
        totalCost += purchase.total;
      });
      
      // 이 전략의 비용이 글로벌 최적해보다 낮으면 업데이트
      if (totalCost < globalBestCost) {
        console.log(`\n[개선된 탐욕] 새로운 최적 조합 발견 - 총 비용: ${totalCost.toLocaleString()}원 (${totalStores}개 판매처)`);
        
        globalBestCost = totalCost;
        globalBestSolution = {
          purchaseDetails: JSON.parse(JSON.stringify(purchaseDetails)),
          cardsOptimalPurchase: JSON.parse(JSON.stringify(cardsOptimalPurchase)),
          totalCost,
          totalProductCost,
          totalShippingCost,
          totalPointsEarned
        };
      }
    }
  }
  
  // 최적 결과가 없으면 에러 반환
  if (!globalBestSolution) {
    return {
      success: false,
      error: "유효한 구매 조합을 찾을 수 없습니다."
    };
  }
  
  // 결과 데이터 구성
  const purchaseDetails = globalBestSolution.purchaseDetails;
  const cardsOptimalPurchase = globalBestSolution.cardsOptimalPurchase;
  
  // 카드 이미지 수집
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
  
  // 사용 중인 판매처만 필터링
  const usedSellers = Object.keys(purchaseDetails).filter(seller => 
    purchaseDetails[seller].cards.length > 0
  );
  
  // 각 판매처별 카드 정보 구성
  usedSellers.forEach(seller => {
    const purchase = purchaseDetails[seller];
    
    groupedCardsByStore[seller] = {
      cards: purchase.cards.map(card => ({
        cardName: card.cardName,
        price: card.price,
        quantity: card.quantity,
        totalPrice: card.price * card.quantity,
        product: card.product,
        image: cardImagesMap[card.cardName]
      })),
      finalPrice: purchase.total,
      productCost: purchase.subtotal,
      shippingCost: purchase.shippingFee,
      pointsEarned: purchase.points
    };
  });
  
  // 최종 결과 포맷
  return {
    success: cardsOptimalPurchase.length === reducedCardsList.length,
    totalCost: globalBestCost,
    totalProductCost: globalBestSolution.totalProductCost,
    totalShippingCost: globalBestSolution.totalShippingCost,
    totalPointsEarned: globalBestSolution.totalPointsEarned,
    pointsOptions,
    shippingRegion,
    cardsOptimalPurchase: groupedCardsByStore,
    cardImages: cardImagesMap,
    algorithm: 'improved_greedy',
    version: 'v3.0.0'
  };
}

module.exports = {
  findGreedyOptimalPurchase
}; 