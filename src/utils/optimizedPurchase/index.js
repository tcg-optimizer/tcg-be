/**
 * 여러 카드를 최저가로 구매하기 위한 최적 조합 알고리즘
 * 메인 모듈 (진입점)
 */

const { filterTopSellers } = require('./cardUtils');
const { findGreedyOptimalPurchase } = require('./greedyAlgorithm');
const { findBruteForceOptimalPurchase } = require('./bruteForceAlgorithm');
const { 
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization
} = require('./optimizationStrategies');

// 사용할 알고리즘 타입 (brute_force 또는 greedy)
let currentAlgorithmType = 'greedy';

/**
 * 카드 구매의 최적 조합을 찾는 함수
 * 그리디 알고리즘 또는 브루트 포스 알고리즘 사용
 * 
 * @param {Array<Object>} cardsList - 각 카드의 구매 가능한 상품 목록
 * @param {Object} options - 알고리즘 선택 및 성능 옵션
 * @returns {Object} - 최적 구매 조합 정보
 */
function findOptimalPurchaseCombination(cardsList, options = {}) {
  console.log(`현재 선택된 알고리즘: ${currentAlgorithmType}`);
  
  // 기본 옵션 설정
  const defaultOptions = {
    maxSellersPerCard: 30, // 고정값: 각 카드별 고려할 최대 판매처 수 (greedyAlgorithm.js와 cardController.js와 일치)
    maxIterations: 50,     // 고정값: 최적화 반복 횟수
    shippingRegion: 'default',  // 배송 지역
    pointsOptions: {
      tcgshop: false,   // TCGShop 적립금 고려 여부
      carddc: false,    // CardDC 적립금 고려 여부
      
      // 네이버 관련 적립금 옵션
      naverBasic: false,        // 네이버 기본 적립금 (2.5%, 리뷰 적립금 포함)
      naverBankbook: false,    // 네이버 제휴통장 적립금 (0.5%)
      naverMembership: false,   // 네이버 멤버십 적립금 (4%)
      naverHyundaiCard: false   // 네이버 현대카드 적립금 (7%)
    }
  };
  
  // 옵션 병합 (고정값은 병합하지 않음)
  const mergedOptions = { 
    ...defaultOptions,
    shippingRegion: options.shippingRegion || defaultOptions.shippingRegion,
    pointsOptions: { ...defaultOptions.pointsOptions }
  };
  
  // 외부에서 전달된 적립금 옵션이 있으면 적용
  if (options.pointsOptions) {
    Object.keys(mergedOptions.pointsOptions).forEach(key => {
      if (options.pointsOptions[key] !== undefined) {
        mergedOptions.pointsOptions[key] = options.pointsOptions[key];
      }
    });
  }
  
  // 선택된 알고리즘에 따라 실행
  if (currentAlgorithmType === 'brute_force') {
    console.log("브루트 포스 알고리즘 실행 중...");
    return findBruteForceOptimalPurchase(cardsList, mergedOptions);
  } else {
    console.log("그리디 알고리즘 실행 중...");
    return findGreedyOptimalPurchase(cardsList, mergedOptions);
  }
}

/**
 * 사용할 알고리즘 타입 설정
 * @param {string} algorithmType - 'greedy' 또는 'brute_force'
 */
function setAlgorithmType(algorithmType) {
  if (algorithmType === 'greedy' || algorithmType === 'brute_force') {
    currentAlgorithmType = algorithmType;
    console.log(`알고리즘 타입이 '${algorithmType}'로 변경되었습니다.`);
    return true;
  } else {
    console.error(`오류: 알 수 없는 알고리즘 타입 '${algorithmType}'. 'greedy' 또는 'brute_force'만 사용 가능합니다.`);
    return false;
  }
}

/**
 * 현재 사용 중인 알고리즘 타입 반환
 * @returns {string} - 현재 알고리즘 타입
 */
function getAlgorithmType() {
  return currentAlgorithmType;
}

/**
 * 두 알고리즘의 결과를 비교
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {Object} options - 옵션
 * @returns {Object} - 비교 결과
 */
function compareAlgorithms(cardsList, options = {}) {
  console.log("그리디 알고리즘과 브루트 포스 알고리즘의 결과를 비교합니다...");
  
  // 카드 수 제한 (브루트 포스는 작은 입력에만 실용적)
  const MAX_CARDS = 10;
  if (cardsList.length > MAX_CARDS) {
    console.log(`카드 수가 많아 처음 ${MAX_CARDS}개 카드만으로 비교합니다.`);
    cardsList = cardsList.slice(0, MAX_CARDS);
  }
  
  // 옵션 병합
  const mergedOptions = { 
    maxSellersPerCard: 30,
    maxIterations: 50,
    shippingRegion: options.shippingRegion || 'default',
    pointsOptions: { 
      tcgshop: false,
      carddc: false,
      naverBasic: false,
      naverBankbook: false,
      naverMembership: false,
      naverHyundaiCard: false 
    }
  };
  
  // 외부에서 전달된 적립금 옵션이 있으면 적용
  if (options.pointsOptions) {
    Object.keys(mergedOptions.pointsOptions).forEach(key => {
      if (options.pointsOptions[key] !== undefined) {
        mergedOptions.pointsOptions[key] = options.pointsOptions[key];
      }
    });
  }
  
  // 그리디 알고리즘 실행
  console.log("\n1. 그리디 알고리즘 실행...");
  const greedyResult = findGreedyOptimalPurchase(cardsList, mergedOptions);
  
  // 브루트 포스 알고리즘 실행
  console.log("\n2. 브루트 포스 알고리즘 실행...");
  const bruteForceResult = findBruteForceOptimalPurchase(cardsList, mergedOptions);
  
  // 결과 비교
  const greedyCost = greedyResult.totalCost;
  const bruteForceCost = bruteForceResult.totalCost;
  const costDiff = greedyCost - bruteForceCost;
  const percentage = (costDiff / bruteForceCost) * 100;
  
  // 디버깅: 더 자세한 비교 정보 출력
  console.log("\n===== 알고리즘 비교 상세 정보 =====");
  console.log(`그리디 총비용: ${greedyCost.toLocaleString()}원`);
  console.log(`브루트포스 총비용: ${bruteForceCost.toLocaleString()}원`);
  console.log(`차이: ${costDiff.toLocaleString()}원 (${percentage.toFixed(2)}%)`);
  
  // 비정상 케이스 감지 (그리디가 더 나은 경우)
  if (greedyCost < bruteForceCost) {
    console.error("\n[경고] 비정상적인 결과: 그리디 알고리즘이 브루트 포스보다 낮은 가격을 찾았습니다!");
    console.error("이는 브루트 포스 알고리즘에 문제가 있음을 의미합니다.");
    
    // 각 알고리즘의 판매처별 상세 정보
    console.log("\n[그리디 알고리즘 판매처 상세]");
    greedyResult.sellers.forEach(seller => {
      console.log(`- ${seller.sellerId}: 상품가격 ${seller.subtotal.toLocaleString()}원, 배송비 ${seller.shippingFee.toLocaleString()}원, 적립금 ${seller.points.toLocaleString()}원`);
      console.log(`  총 비용: ${seller.total.toLocaleString()}원, 카드 수: ${seller.cards.length}개`);
    });
    
    console.log("\n[브루트 포스 알고리즘 판매처 상세]");
    bruteForceResult.sellers.forEach(seller => {
      console.log(`- ${seller.sellerId}: 상품가격 ${seller.subtotal.toLocaleString()}원, 배송비 ${seller.shippingFee.toLocaleString()}원, 적립금 ${seller.points.toLocaleString()}원`);
      console.log(`  총 비용: ${seller.total.toLocaleString()}원, 카드 수: ${seller.cards.length}개`);
    });
  }
  
  // 판매처 구성 비교
  const greedySellers = greedyResult.sellers.map(s => s.sellerId).sort();
  const bruteForceSellers = bruteForceResult.sellers.map(s => s.sellerId).sort();
  const sameSellerComposition = JSON.stringify(greedySellers) === JSON.stringify(bruteForceSellers);
  
  // 결과 반환
  return {
    greedy: {
      totalCost: greedyCost,
      sellers: greedySellers,
      breakdowns: greedyResult.sellers.map(s => ({
        sellerId: s.sellerId,
        subtotal: s.subtotal,
        shippingFee: s.shippingFee,
        points: s.points,
        total: s.total
      }))
    },
    bruteForce: {
      totalCost: bruteForceCost,
      sellers: bruteForceSellers,
      breakdowns: bruteForceResult.sellers.map(s => ({
        sellerId: s.sellerId,
        subtotal: s.subtotal,
        shippingFee: s.shippingFee,
        points: s.points,
        total: s.total
      }))
    },
    comparison: {
      costDifference: costDiff,
      percentageDifference: percentage,
      isOptimal: Math.abs(costDiff) < 0.01, // 부동소수점 오차 고려
      sameSellerComposition
    },
    message: costDiff <= 0 
      ? "그리디 알고리즘이 최적해를 찾았습니다!" 
      : `그리디 알고리즘은 최적해보다 ${costDiff.toFixed(0)}원 비쌉니다 (${percentage.toFixed(2)}% 차이).`
  };
}

module.exports = {
  findOptimalPurchaseCombination,
  setAlgorithmType,
  getAlgorithmType,
  compareAlgorithms,
  findGreedyOptimalPurchase,
  findBruteForceOptimalPurchase,
  // 내부 유틸리티 함수도 내보내 테스트 가능하도록 함
  filterTopSellers,
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization
}; 