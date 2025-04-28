/**
 * 여러 카드를 최저가로 구매하기 위한 최적 조합 알고리즘
 * 메인 모듈 (진입점)
 */

const { filterTopSellers } = require('./cardUtils');
const { findGreedyOptimalPurchase } = require('./greedyAlgorithm');
const { 
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization
} = require('./optimizationStrategies');

/**
 * 카드 구매의 최적 조합을 찾는 함수
 * 그리디 알고리즘만 사용
 * 
 * @param {Array<Object>} cardsList - 각 카드의 구매 가능한 상품 목록
 * @param {Object} options - 알고리즘 선택 및 성능 옵션
 * @returns {Object} - 최적 구매 조합 정보
 */
function findOptimalPurchaseCombination(cardsList, options = {}) {
  console.log("그리디 알고리즘 사용 중...");
  
  // 기본 옵션 설정
  const defaultOptions = {
    maxSellersPerCard: 50, // 고정값: 각 카드별 고려할 최대 판매처 수 
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
  
  // 그리디 알고리즘 실행 (고정된 값 사용)
  console.log("개선된 그리디 알고리즘 실행 중...");
  return findGreedyOptimalPurchase(cardsList, mergedOptions);
}

module.exports = {
  findOptimalPurchaseCombination,
  findGreedyOptimalPurchase,
  // 내부 유틸리티 함수도 내보내 테스트 가능하도록 함
  filterTopSellers,
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization
}; 