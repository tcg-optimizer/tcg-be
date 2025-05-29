/**
 * 여러 카드를 최저가로 구매하기 위한 최적 조합 알고리즘
 * 배송비와 적립금을 고려하여 최적의 구매 방법을 찾습니다.
 *
 * 이 파일은 최적화된 구매 모듈의 진입점입니다.
 * 관련 기능은 /optimizedPurchase 디렉토리에 모듈화되어 있습니다.
 */

// 모듈화된 구조로 리팩토링된 기능 불러오기
module.exports = require('./optimizedPurchase/index');

const findOptimalPurchaseCombination = (cards, options = {}) => {
  try {
    // 옵션 기본값 설정
    const defaultOptions = {
      maxSellersPerCard: 30, // 카드당 최대 판매자 수
      maxIterations: 50, // 최대 반복 횟수
      shippingRegion: 'default', // 기본 배송 지역
      pointsOptions: {
        tcgshop: false, // 티씨지샵 적립금 (기본 10%)
        carddc: false, // 카드디씨 적립금 (기본 10%)
        naverBasic: false, // 네이버 기본 적립금 (2.5%, 리뷰 적립금 포함)
        naverBankbook: false, // 네이버 제휴통장 적립금 (0.5%)
        naverMembership: false, // 네이버 멤버십 적립금 (4%)
        naverHyundaiCard: false, // 네이버 현대카드 적립금 (7%)
      },
    };

    // 기본 옵션과 사용자 지정 옵션 병합
    const finalOptions = {
      ...defaultOptions,
      ...options,
      pointsOptions: {
        ...defaultOptions.pointsOptions,
        ...(options.pointsOptions || {}),
      },
    };

    // 각 카드에 대해 상품이 있는지 확인하고, product 객체에 id가 없으면 추가
    const processedCards = cards.map(card => {
      // 상품 정보가 없으면 빈 배열로 초기화
      if (!card.products) {
        card.products = [];
        return card;
      }

      // 각 상품의 product 객체 확인 및 id 필드 추가
      card.products = card.products.map(product => {
        // product 객체가 없는 경우 새로 생성
        if (!product.product) {
          product.product = {
            id: product.id || product.productId,
            url: product.url,
            site: product.site,
            price: product.price,
            available: product.available,
            cardCode: product.cardCode,
            condition: product.condition,
            language: product.language,
            rarity: product.rarity,
          };
        }
        // product 객체가 있지만 id가 없는 경우 id 추가
        else if (product.product && !product.product.id) {
          product.product.id =
            product.id ||
            product.productId ||
            (product.product.url && product.product.url.match(/goodsIdx=(\d+)/)
              ? product.product.url.match(/goodsIdx=(\d+)/)[1]
              : null);
        }
        return product;
      });

      return card;
    });
    // 각 카드의 판매자 정보 (가격순 정렬, 최대 maxSellersPerCard명)
    const cardSellers = processedCards.map(card => {
      // 각 상품에 대해 quantity 필드가 없으면 1로 설정
      const products = (card.products || []).map(product => ({
        ...product,
        quantity: card.quantity || 1,
      }));

      // 가격순 정렬 후 상위 sellers만 유지
      return {
        cardName: card.cardName,
        image: card.image,
        sellers: products
          .filter(product => product.available !== false) // 품절 상품 제외
          .sort((a, b) => a.price - b.price) // 가격순 정렬
          .slice(0, finalOptions.maxSellersPerCard) // 상위 판매자만 선택
          .map(product => ({
            ...product,
            cardName: card.cardName,
            image: card.image, // 이미지 정보 추가
          })),
      };
    });
  } catch (error) {
    console.error('[ERROR] 최적 구매 조합 계산 중 오류 발생:', error);
    return null;
  }
};
