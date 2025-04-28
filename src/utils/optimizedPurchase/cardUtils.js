/**
 * 카드 관련 유틸리티 함수 모듈
 */

const { getShippingInfo } = require('../shippingInfo');

/**
 * 판매처 ID를 가져오는 함수
 * @param {string|Object} seller - 판매처 정보
 * @returns {string} - 판매처 ID
 */
function getSellerId(seller) {
  // 문자열인 경우 그대로 반환
  if (typeof seller === 'string') {
    return seller;
  }
  
  // 판매처가 객체인 경우, name이나 id 속성 사용
  return seller.name || seller.id || String(seller);
}

/**
 * 각 카드별로 상위 N개의 저렴한 판매처만 선택하여 탐색 공간 축소
 * 추가적으로 레어도 조건을 적용하여 필터링
 * @param {Array<Object>} cardsList - 카드 목록
 * @param {number} topN - 각 카드별로 선택할 최대 판매처 수
 * @returns {Array<Object>} - 축소된 카드 목록
 */
function filterTopSellers(cardsList, topN = 5) {
  return cardsList.map(card => {
    // 상품 목록이 없거나 비어있는 경우 처리
    if (!card.products) {
      console.log(`경고: '${card.cardName}' 카드의 상품 목록(products)이 없습니다.`);
      return {
        ...card,
        products: []
      };
    }
    
    // products가 배열이 아닌 경우 체크 (prices 필드가 있는 형태)
    let productsList = card.products;
    
    // products 객체가 배열이 아니고 prices 속성을 가지고 있는 경우 (캐시된 형식)
    if (!Array.isArray(productsList) && productsList.prices) {
      console.log(`정보: '${card.cardName}' 카드의 상품 목록이 {prices: [...]} 형태로 되어 있어 변환합니다.`);
      productsList = productsList.prices; // prices 배열을 사용
    }
    
    // 배열이 아닌 경우 빈 배열로 처리
    if (!Array.isArray(productsList)) {
      console.log(`경고: '${card.cardName}' 카드의 상품 목록이 유효한 형식이 아닙니다:`, productsList);
      return {
        ...card,
        products: []
      };
    }
    
    // 기본 상품 목록
    let filteredProducts = productsList;
    
    // 레어도 조건이 있는 경우 해당 조건에 맞는 상품만 필터링
    if (card.desiredRarity) {
      filteredProducts = productsList.filter(product => {
        // 레어도 일치 확인 (대소문자 무시)
        const productRarity = (product.rarity || '').toLowerCase();
        const desiredRarity = card.desiredRarity.toLowerCase();
        
        // 정확한 일치 확인
        return productRarity === desiredRarity;
      });
      
      // 레어도 조건에 맞는 상품이 없으면 빈 배열 반환
      // 해당 카드는 구매할 수 없는 것으로 처리됨
      if (filteredProducts.length === 0) {
        console.log(`경고: '${card.cardName}'의 레어도 '${card.desiredRarity}' 조건에 맞는 상품이 없습니다. 구매 불가능으로 처리됩니다.`);
        return {
          ...card,
          products: []  // 빈 배열 반환
        };
      }
    }
    
    // 각 카드의 상품을 가격순으로 정렬, 가격이 같을 경우 배송비가 저렴한 판매처 우선
    const sortedProducts = [...filteredProducts].sort((a, b) => {
      // 우선 가격으로 정렬
      if (a.price !== b.price) {
        return a.price - b.price;
      }
      
      // 가격이 같으면, 배송비로 정렬
      const aInfo = getShippingInfo(getSellerId(a.site));
      const bInfo = getShippingInfo(getSellerId(b.site));
      
      // 일반 배송비로 비교
      return aInfo.shippingFee - bInfo.shippingFee;
    });
    
    // 이미 포함된 판매처 추적
    const includedSellers = new Set();
    const filteredBySellerProducts = [];
    
    // 상위 N개의 서로 다른 판매처만 선택
    for (const product of sortedProducts) {
      const sellerId = getSellerId(product.site);
      if (!includedSellers.has(sellerId) && includedSellers.size < topN) {
        includedSellers.add(sellerId);
        filteredBySellerProducts.push(product);
      }
    }
    
    return {
      ...card,
      products: filteredBySellerProducts
    };
  });
}

/**
 * 판매처가 네이버 스토어인지 확인하는 함수
 * @param {string} seller - 판매처 이름
 * @returns {boolean} - 네이버 스토어 여부
 */
function isNaverStore(seller) {
  if (!seller) return false;
  
  // 판매처 이름이 Naver로 시작하거나 네이버로 시작하는 경우
  const sellerStr = String(seller).toLowerCase();
  return sellerStr.startsWith('naver') || 
         sellerStr.includes('네이버') || 
         sellerStr.includes('naver');
}

module.exports = {
  getSellerId,
  filterTopSellers,
  isNaverStore
}; 