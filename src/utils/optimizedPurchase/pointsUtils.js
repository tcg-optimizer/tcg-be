/**
 * 적립금/포인트 계산 관련 유틸리티 함수 모듈
 */

const { isNaverStore } = require('./cardUtils');

/**
 * 적립금 정보 - 수정 가능한 설정값
 * test-optimal-purchase.js에서 이 값들을 직접 수정할 수 있습니다.
 */
const pointsInfo = {
  // 판매처별 적립률
  tcgshop: { rate: 0.1 },   // TCGShop 10% 적립
  carddc: { rate: 0.1 },    // CardDC 10% 적립
  
  // 네이버 관련 적립금 정보
  naverBasic: { rate: 0.025 },         // 네이버 기본 적립금 (2.5%)
  naverReview: { amount: 150, minPrice: 3000 },  // 리뷰 적립금 (3000원 이상 제품당 150원)
  naverBankbook: { rate: 0.005 },     // 네이버 제휴통장 적립금 (0.5%)
  naverMembership: { rate: 0.04 },     // 네이버 멤버십 적립금 (4%)
  naverHyundaiCard: { rate: 0.07 }     // 네이버 현대카드 적립금 (7%)
};

/**
 * 주어진 판매처에 대한 네이버 적립금 계산
 * @param {string} seller - 판매처 이름
 * @param {number} productPrice - 제품 가격
 * @param {number} quantity - 수량
 * @param {Set<string>} reviewedProducts - 리뷰 작성한 제품 목록
 * @param {string} productId - 제품 ID나 이름
 * @param {Object} pointsOptions - 적립금 옵션
 * @returns {number} - 적립금 금액
 */
function calculateNaverPoints(seller, productPrice, quantity, reviewedProducts, productId, pointsOptions) {
  if (!isNaverStore(seller)) return 0;
  
  let totalPoints = 0;
  const totalProductPrice = productPrice * quantity;
  
  // 1. 네이버 기본 적립금 (2.5%)
  if (pointsOptions.naverBasic) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverBasic.rate);
  }
  
  // 2. 네이버 리뷰 적립금 (3000원 이상 제품당 150원, 동일 제품은 1번만)
  // naverBasic 옵션이 활성화된 경우에만 리뷰 적립금 적용
  if (pointsOptions.naverBasic && 
      productPrice >= pointsInfo.naverReview.minPrice && 
      productId && 
      !reviewedProducts.has(productId)) {
    totalPoints += pointsInfo.naverReview.amount;
    console.log(`[리뷰 적립금] ${productId}에 대한 리뷰 적립금 ${pointsInfo.naverReview.amount}원 추가 (상품가격: ${productPrice}원)`);
    reviewedProducts.add(productId); // 리뷰 작성한 제품 추가
  }
  
  // 3. 네이버 제휴통장 적립금 (0.5%)
  if (pointsOptions.naverBankbook) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverBankbook.rate);
  }
  
  // 4. 네이버 멤버십 적립금 (4%)
  if (pointsOptions.naverMembership) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverMembership.rate);
  }
  
  // 5. 네이버 현대카드 적립금 (7%)
  if (pointsOptions.naverHyundaiCard) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverHyundaiCard.rate);
  }
  
  return totalPoints;
}

/**
 * 판매처가 적립금 고려 대상인지 확인하는 함수
 * @param {string} seller - 판매처
 * @param {Object} pointsOptions - 적립금 옵션
 * @returns {boolean} - 적립금 고려 여부
 */
function isPointsEligible(seller, pointsOptions) {
  const sellerLower = seller.toLowerCase();
  
  if (sellerLower === 'tcgshop' && pointsOptions.tcgshop) {
    return true;
  }
  
  if (sellerLower === 'carddc' && pointsOptions.carddc) {
    return true;
  }
  
  // 네이버 스토어의 경우, 관련 적립금 옵션 중 하나라도 활성화되어 있으면 고려
  if (isNaverStore(seller) && (
    pointsOptions.naverBasic || 
    pointsOptions.naverBankbook || 
    pointsOptions.naverMembership || 
    pointsOptions.naverHyundaiCard
  )) {
    return true;
  }
  
  return false;
}

/**
 * 판매처의 적립률 계산 함수
 * @param {string} seller - 판매처 이름
 * @param {number} productPrice - 제품 가격
 * @param {number} quantity - 수량
 * @param {string} productId - 제품 ID나 이름
 * @param {Set<string>} reviewedProducts - 리뷰 작성한 제품 목록
 * @param {Object} pointsOptions - 적립금 옵션
 * @returns {number} - 적립금 금액
 */
function calculatePointsAmount(seller, productPrice, quantity, productId, reviewedProducts, pointsOptions) {
  const sellerLower = seller.toLowerCase();
  
  if (sellerLower === 'tcgshop' && pointsOptions.tcgshop) {
    return Math.round(productPrice * quantity * pointsInfo.tcgshop.rate);
  }
  
  if (sellerLower === 'carddc' && pointsOptions.carddc) {
    return Math.round(productPrice * quantity * pointsInfo.carddc.rate);
  }
  
  // 네이버 스토어 관련 적립금 계산
  if (isNaverStore(seller)) {
    return calculateNaverPoints(seller, productPrice, quantity, reviewedProducts, productId, pointsOptions);
  }
  
  return 0;
}

module.exports = {
  pointsInfo,
  calculateNaverPoints,
  isPointsEligible,
  calculatePointsAmount
}; 