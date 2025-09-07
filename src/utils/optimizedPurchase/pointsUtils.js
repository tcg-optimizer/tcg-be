const { isNaverStore } = require('./cardUtils');

const pointsInfo = {
  // 판매처별 적립률
  tcgshop: { rate: 0.1 }, // TCGShop 10% 적립
  carddc: { rate: 0.1 }, // CardDC 10% 적립

  naverBasic: { rate: 0.025 }, // 네이버 기본 적립금 (2.5%)
  naverReview: { amount: 150, minPrice: 3000 }, // 리뷰 적립금 (3000원 이상 제품당 150원)
  naverBankbook: { rate: 0.005 }, // 네이버 제휴통장 적립금 (0.5%)
  naverMembership: { rate: 0.04 }, // 네이버 멤버십 적립금 (4%)
  naverHyundaiCard: { rate: 0.07 }, // 네이버 현대카드 적립금 (7%)
};

function calculateNaverPoints(
  seller,
  productPrice,
  quantity,
  reviewedProducts,
  productId,
  pointsOptions
) {
  if (!isNaverStore(seller)) return 0;

  let totalPoints = 0;
  const totalProductPrice = productPrice * quantity;

  if (pointsOptions.naverBasic) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverBasic.rate);
  }

  // naverBasic 옵션이 활성화된 경우에만 리뷰 적립금 적용
  if (
    pointsOptions.naverBasic &&
    productPrice >= pointsInfo.naverReview.minPrice &&
    productId &&
    !reviewedProducts.has(productId)
  ) {
    totalPoints += pointsInfo.naverReview.amount;
    reviewedProducts.add(productId); // 리뷰 작성한 제품 추가 - 중복 방지를 위함
  }

  if (pointsOptions.naverBankbook) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverBankbook.rate);
  }

  if (pointsOptions.naverMembership) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverMembership.rate);
  }

  if (pointsOptions.naverHyundaiCard) {
    totalPoints += Math.round(totalProductPrice * pointsInfo.naverHyundaiCard.rate);
  }

  return totalPoints;
}

function calculatePointsAmount(
  seller,
  productPrice,
  quantity,
  productId,
  reviewedProducts,
  pointsOptions
) {
  const sellerLower = seller.toLowerCase();

  if (sellerLower === 'tcgshop' && pointsOptions.tcgshop) {
    return Math.round(productPrice * quantity * pointsInfo.tcgshop.rate);
  }

  if (sellerLower === 'carddc' && pointsOptions.carddc) {
    return Math.round(productPrice * quantity * pointsInfo.carddc.rate);
  }

  if (isNaverStore(seller)) {
    return calculateNaverPoints(
      seller,
      productPrice,
      quantity,
      reviewedProducts,
      productId,
      pointsOptions
    );
  }

  return 0;
}

module.exports = {
  pointsInfo,
  calculateNaverPoints,
  calculatePointsAmount,
};
