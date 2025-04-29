/**
 * 그리디 알고리즘 기반 최적 구매 조합 모듈
 */

const { getShippingInfo } = require('../shippingInfo');
const { getSellerId } = require('./cardUtils');
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
  
  // 최적화 반복 횟수 고정값 사용
  const MAX_ITERATIONS = 50; // 고정값: 최적화 반복 횟수
  
  // 각 정렬 전략별로 최적화 시도
  let bestSolution = null;
  let bestCost = Infinity;
  
  for (let strategyIndex = 0; strategyIndex < sortingStrategies.length; strategyIndex++) {
    console.log(`\n[개선된 탐욕] 정렬 전략 #${strategyIndex + 1} 시도 중...`);
    
    // 정렬 전략 적용
    const sortedCards = sortingStrategies[strategyIndex](reducedCardsList);
    
    // 리뷰 제품 목록 초기화 (각 전략마다 리셋)
    reviewedProducts.clear();
    
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
    
    // 1. 첫 번째 단계: 각 카드를 최적의 판매처에 할당 (배송비 고려)
    sortedCards.forEach((cardInfo, index) => {
      const { cardName, products, quantity = 1 } = cardInfo;
      let bestSeller = null;
      let bestProduct = null;
      let lowestTotalCost = Infinity;
      let bestPointsEarned = 0;
      const productId = cardName; // 카드 이름을 제품 ID로 사용
      
      // 각 판매처별로 이 카드를 추가했을 때의 총 비용 계산
      products.forEach(product => {
        const seller = getSellerId(product.site);
        const currentSubtotal = purchaseDetails[seller].subtotal;
        const newSubtotal = currentSubtotal + (product.price * quantity);
        
        // 배송비 계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[seller];
        const currentShippingFee = purchaseDetails[seller].shippingFee;
        const newShippingFee = newSubtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity ? 0 : shippingFee;
        
        // 적립금 계산
        const earnablePoints = calculatePointsAmount(seller, product.price, quantity, productId, reviewedProducts, pointsOptions);
        
        // 이 카드를 이 판매처에 추가했을 때의 총 비용 변화 (적립금 고려)
        const costDifference = (product.price * quantity) + (newShippingFee - currentShippingFee) - earnablePoints;
        
        if (costDifference < lowestTotalCost || 
           (costDifference === lowestTotalCost && earnablePoints > bestPointsEarned)) {
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
        const earnablePoints = calculatePointsAmount(bestSeller, bestProduct.price, quantity, productId, reviewedProducts, pointsOptions);
        
        // 구매 내역에 추가
        purchaseDetails[bestSeller].cards.push({
          cardName,
          price: bestProduct.price,
          product: bestProduct,
          quantity,
          points: earnablePoints  // 적립 예정 포인트
        });
        
        purchaseDetails[bestSeller].subtotal += cardPrice;
        purchaseDetails[bestSeller].points += earnablePoints;  // 판매처별 총 적립 포인트
        
        // 배송비 재계산
        const { shippingFee, freeShippingThreshold } = sellerShippingInfo[bestSeller];
        purchaseDetails[bestSeller].shippingFee = 
          (purchaseDetails[bestSeller].subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity) ? 0 : shippingFee;
        
        // 총 비용 업데이트 (적립금 고려 시 차감)
        purchaseDetails[bestSeller].total = 
          purchaseDetails[bestSeller].subtotal + purchaseDetails[bestSeller].shippingFee - purchaseDetails[bestSeller].points;
        
        // 카드별 최적 구매처 정보에 추가
        cardsOptimalPurchase.push({
          cardName,
          seller: bestSeller,
          price: bestProduct.price,
          totalPrice: bestProduct.price * quantity,
          quantity,
          points: earnablePoints,  // 적립 예정 포인트
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
          const productId = card.cardName; // 카드 이름을 제품 ID로 사용
          
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
            
            // 적립금 변화 계산
            // 원래 소스에서 이 카드에 대한 적립금
            const oldSourcePoints = card.points || 0;
            
            // 타겟 판매처에서 이 카드에 대한 적립금
            const newTargetPoints = calculatePointsAmount(targetSellerName, alt.price, alt.quantity, productId, reviewedProducts, pointsOptions);
            
            // 새로운 배송비 계산
            const { shippingFee: sourceShippingFee } = sellerShippingInfo[sourceSellerName];
            const { shippingFee: targetShippingFee, freeShippingThreshold: targetThreshold } = 
              sellerShippingInfo[targetSellerName];
              
            const newSourceShippingFee = newSourceSubtotal > 0 ? 
              (newSourceSubtotal >= sourceThreshold && sourceThreshold !== Infinity) ? 0 : sourceShippingFee : 0;
            // 타겟의 배송비 계산 - 임계값을 초과하는 경우에만 무료 배송
            const newTargetShippingFee = (newTargetSubtotal >= targetThreshold && targetThreshold !== Infinity) ? 0 : targetShippingFee;
            
            // 현재 비용과 새 비용 비교
            const newSourceTotal = newSourceSubtotal + newSourceShippingFee - (sourceSeller.points - oldSourcePoints);
            const newTargetTotal = newTargetSubtotal + newTargetShippingFee - (targetSeller.points + newTargetPoints);
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
              sourceSeller.points -= oldSourcePoints; // 포인트 감소
              sourceSeller.shippingFee = newSourceShippingFee;
              sourceSeller.total = newSourceTotal;
              
              // 타겟 판매처에 카드 추가
              targetSeller.cards.push({
                cardName: card.cardName,
                price: alt.price,
                product: alt.product,
                quantity: alt.quantity,
                points: newTargetPoints // 적립 예정 포인트
              });
              targetSeller.subtotal = newTargetSubtotal;
              targetSeller.points += newTargetPoints; // 포인트 증가
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
                  points: newTargetPoints,
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
    let totalPointsEarned = 0;
    
    sellersList.forEach(seller => {
      const details = purchaseDetails[seller];
      if (details.subtotal > 0) {
        // 배송비 한번 더 검증하여 계산
        const { freeShippingThreshold, shippingFee } = sellerShippingInfo[seller];
        details.shippingFee = (details.subtotal >= freeShippingThreshold && freeShippingThreshold !== Infinity) ? 0 : shippingFee;
        details.total = details.subtotal + details.shippingFee - details.points;
        
        totalCost += details.total;
        totalProductCost += details.subtotal;
        totalShippingCost += details.shippingFee;
        totalPointsEarned += details.points;
      }
    });
    
    // 최종 적립금 합계 재계산 (리뷰 적립금이 추가되었을 수 있으므로)
    totalPointsEarned = sellersList.reduce((sum, seller) => 
      sum + purchaseDetails[seller].points, 0);
    
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
      
      // 판매처별 구매 요약 정보 (클라이언트 표시용)
      const sellers = usedSellers.map(seller => {
        const details = finalPurchaseDetails[seller];
        
        // 적립금 세부 정보 계산
        let pointsDetails = {};
        if (details.points > 0) {
          const isNaverStore = require('./cardUtils').isNaverStore(seller);
          const isCardDC = seller.toLowerCase() === 'carddc';
          const isTCGShop = seller.toLowerCase() === 'tcgshop';
          
          // 판매처별 적립금 세부 정보
          if (isTCGShop && pointsOptions.tcgshop) {
            pointsDetails.tcgshop = Math.round(details.subtotal * 0.1); // 10% 적립
          } 
          else if (isCardDC && pointsOptions.carddc) {
            pointsDetails.carddc = Math.round(details.subtotal * 0.1); // 10% 적립
          }
          else if (isNaverStore) {
            // 네이버 기본 적립금 (2.5%, 리뷰 포함)
            if (pointsOptions.naverBasic) {
              // 기본 적립금 2.5%
              const basicPoints = Math.round(details.subtotal * 0.025);
              
              // 리뷰 적립금 (3000원 이상 제품당 150원)
              const reviewableCards = details.cards.filter(card => card.price >= 3000);
              // 중복 제품명 제거 (같은 제품은 한 번만 리뷰 가능)
              const uniqueCardNames = [...new Set(reviewableCards.map(card => card.cardName))];
              const reviewPoints = uniqueCardNames.length * 150;
              
              // 수정: 리뷰 적립금을 포인트 합계에 직접 추가
              if (reviewPoints > 0) {
                console.log(`[DEBUG] ${seller}에 대한 리뷰 적립금 ${reviewPoints}원 추가 (${uniqueCardNames.length}개 상품)`);
                details.points += reviewPoints;
                // 총액에도 적립금 반영
                details.total = details.subtotal + details.shippingFee - details.points;
              }
              
              pointsDetails.naverBasic = {
                basic: basicPoints,
                review: reviewPoints,
                total: basicPoints + reviewPoints
              };
            }
            
            // 네이버 제휴통장 적립금 (0.5%)
            if (pointsOptions.naverBankbook) {
              pointsDetails.naverBankbook = Math.round(details.subtotal * 0.005);
            }
            
            // 네이버 멤버십 적립금 (4%)
            if (pointsOptions.naverMembership) {
              pointsDetails.naverMembership = Math.round(details.subtotal * 0.04);
            }
            
            // 네이버 현대카드 적립금 (7%)
            if (pointsOptions.naverHyundaiCard) {
              pointsDetails.naverHyundaiCard = Math.round(details.subtotal * 0.07);
            }
          }
        }
        
        return {
          name: seller,
          cards: details.cards.map(card => ({ 
            name: card.cardName, 
            quantity: card.quantity,
            price: card.price,
            totalPrice: card.price * card.quantity,
            points: card.points
          })),
          totalPrice: details.total,
          productCost: details.subtotal,
          shippingCost: details.shippingFee,
          pointsEarned: details.points,
          pointsDetails: pointsDetails  // 적립금 세부 정보 추가
        };
      });
      
      // cardsOptimalPurchase 형식 변경 - 각 상점별로 그룹화
      const groupedCardsByStore = {};
      const cardImagesMap = {};
      
      // 각 카드를 상점별로 그룹화
      cardsOptimalPurchase.forEach(card => {
        // 카드 이미지 수집
        if (!cardImagesMap[card.cardName]) {
          const cardInfo = reducedCardsList.find(c => c.cardName === card.cardName);
          
          // 우선순위: 1. 카드 자체의 image 속성
          if (cardInfo && cardInfo.image) {
            console.log(`[INFO] "${card.cardName}" 카드의 이미지를 카드 객체에서 찾았습니다: ${cardInfo.image.substring(0, 30)}...`);
            cardImagesMap[card.cardName] = cardInfo.image;
          }
          // 2. 카드의 products 배열이 존재하고 이미지가 있는 경우
          else if (cardInfo && cardInfo.products && cardInfo.products.length > 0) {
            // 제품에 이미지 필드가 있으면 사용 (첫 번째 상품)
            const firstProduct = cardInfo.products[0];
            
            if (firstProduct.image) {
              console.log(`[INFO] "${card.cardName}" 카드의 이미지를 products[0].image에서 찾았습니다`);
              cardImagesMap[card.cardName] = firstProduct.image;
            }
            // 선택된 상품에 이미지가 있으면 사용
            else if (card.product && card.product.image) {
              console.log(`[INFO] "${card.cardName}" 카드의 이미지를 선택된 상품에서 찾았습니다`);
              cardImagesMap[card.cardName] = card.product.image;
            }
            else {
              // 모든 상품을 검사하여 이미지 찾기
              const productWithImage = cardInfo.products.find(p => p.image);
              if (productWithImage) {
                console.log(`[INFO] "${card.cardName}" 카드의 이미지를 다른 상품에서 찾았습니다`);
                cardImagesMap[card.cardName] = productWithImage.image;
              } else {
                cardImagesMap[card.cardName] = null;
                console.log(`[WARN] "${card.cardName}" 카드의 이미지를 찾을 수 없습니다.`);
              }
            }
          }
          else {
            cardImagesMap[card.cardName] = null;
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
      totalPointsEarned = usedSellers.reduce((sum, seller) => 
        sum + finalPurchaseDetails[seller].points, 0);
      
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
        cardImages: cardImagesMap
      };
      
      console.log(`[개선된 탐욕] 전략 #${strategyIndex + 1} 결과 - 총비용: ${totalCost.toLocaleString()}원, 적립금: ${totalPointsEarned.toLocaleString()}원, 판매처: ${usedSellers.length}개 (현재 최적)`);
    } else {
      console.log(`[개선된 탐욕] 전략 #${strategyIndex + 1} 결과 - 총비용: ${totalCost.toLocaleString()}원, 적립금: ${totalPointsEarned.toLocaleString()}원 (최적 아님, 최적 비용: ${bestCost.toLocaleString()}원)`);
    }
  }
  
  console.log(`[개선된 탐욕] 최종 결과 - 총비용: ${bestCost.toLocaleString()}원`);
  
  // 최종 적립금 정보 출력
  if (bestSolution && bestSolution.totalPointsEarned > 0) {
    console.log(`[개선된 탐욕] 적립 예정 포인트: ${bestSolution.totalPointsEarned.toLocaleString()}원`);
    
    // 판매처별 적립금 상세 정보 출력
    if (bestSolution.cardsOptimalPurchase) {
      console.log('\n판매처별 적립금 상세:');
      Object.entries(bestSolution.cardsOptimalPurchase).forEach(([seller, info]) => {
        if (info.pointsEarned > 0) {
          console.log(`- ${seller}: ${info.pointsEarned.toLocaleString()}원 적립`);
        }
      });
    }
  }
  
  return bestSolution;
}

module.exports = {
  findGreedyOptimalPurchase
}; 