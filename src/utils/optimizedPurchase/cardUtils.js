const { getShippingInfo } = require('../shippingInfo');

function getSellerId(seller) {
  if (typeof seller === 'string') {
    return seller;
  }

  // 판매처가 객체인 경우, name이나 id 속성 사용
  if (seller.normalizedSite) {
    return seller.normalizedSite;
  }
  return seller.name || seller.id || String(seller);
}

function filterTopSellers(cardsList, options) {
  let topN = 30;

  if (typeof options === 'number') {
    topN = options;
  } else if (typeof options === 'object' && options !== null) {
    topN = options.maxSellersPerCard || 30;
  }

  const excludedProductIds = (options && options.excludedProductIds) || [];
  const excludedStores = (options && options.excludedStores) || [];

  return cardsList
    .map(card => {
      if (!card.products) {
        return {
          ...card,
          products: [],
        };
      }

      let productsList = card.products;

      // products 객체가 배열이 아니고 prices 속성을 가지고 있는 경우 (캐시된 형식)
      if (!Array.isArray(productsList) && productsList.prices) {
        productsList = productsList.prices; // prices 배열을 사용
      }

      // 배열이 아닌 경우 빈 배열로 처리
      if (!Array.isArray(productsList)) {
        return {
          ...card,
          products: [],
        };
      }

      let filteredProducts = productsList;

      if (excludedStores.length > 0) {
        filteredProducts = filteredProducts.filter(product => {
          const site = product.site || (product.product && product.product.site);
          return !excludedStores.includes(site);
        });
      }

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
          return {
            ...card,
            products: [], // 빈 배열 반환
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

      // 판매처별로 상품 그룹화
      const productsBySeller = {};
      for (const product of sortedProducts) {
        const sellerId = getSellerId(product.site || product.product?.site);

        // 판매처별 최저가 상품만 유지
        if (!productsBySeller[sellerId] || product.price < productsBySeller[sellerId].price) {
          productsBySeller[sellerId] = product;
        }
      }

      // 판매처별 상품을 다시 배열로 변환하고 가격 순으로 정렬
      const groupedProducts = Object.values(productsBySeller).sort((a, b) => a.price - b.price);

      // 제외된 상품 ID로 인해 선택되지 않은 판매처가 있는지 확인하기 위한 리스트
      const includedSellers = new Set();
      const filteredBySellerProducts = [];

      // 먼저 상위 N개 판매처 선택
      for (const product of groupedProducts) {
        const sellerId = getSellerId(product.site || product.product?.site);
        const productId = product.id || (product.product && product.product.id);
        const productIdStr = productId ? String(productId) : '';

        // 제외된 상품 ID인지 확인
        let isExcluded = false;
        if (productIdStr && excludedProductIds.length > 0) {
          for (const excludedId of excludedProductIds) {
            if (String(excludedId) === productIdStr) {
              isExcluded = true;
              break;
            }
          }
        }

        // 제외된 상품이 아니고, 아직 포함되지 않은 판매처인 경우만 추가
        if (!isExcluded && !includedSellers.has(sellerId) && includedSellers.size < topN) {
          includedSellers.add(sellerId);
          filteredBySellerProducts.push(product);
        }
      }

      // 제외된 상품 ID로 인해 빠진 판매처가 있다면 다음 최저가 상품을 추가
      if (filteredBySellerProducts.length < Math.min(topN, groupedProducts.length)) {
        // 한 번 더 정렬된 모든 상품을 순회하며 아직 포함되지 않은 판매처의 상품 중 최저가 선택
        for (const product of sortedProducts) {
          const sellerId = getSellerId(product.site || product.product?.site);
          const productId = product.id || (product.product && product.product.id);
          const productIdStr = productId ? String(productId) : '';

          // 제외된 상품 ID인지 확인
          let isExcluded = false;
          if (productIdStr && excludedProductIds.length > 0) {
            for (const excludedId of excludedProductIds) {
              if (String(excludedId) === productIdStr) {
                isExcluded = true;
                break;
              }
            }
          }

          // 이미 포함된 판매처는 건너뛰기
          if (includedSellers.has(sellerId)) {
            continue;
          }

          // 제외되지 않은 상품이면 추가
          if (!isExcluded && includedSellers.size < topN) {
            includedSellers.add(sellerId);
            filteredBySellerProducts.push(product);

            // 최대 판매처 수에 도달하면 종료
            if (includedSellers.size >= topN) {
              break;
            }
          }
        }
      }

      return {
        ...card,
        products: filteredBySellerProducts,
      };
    })
    .filter(card => {
      const hasProducts = card.products && card.products.length > 0;
      return hasProducts;
    });
}

function isNaverStore(seller) {
  if (!seller) return false;

  // 판매처 이름이 Naver로 시작하거나 네이버로 시작하는 경우
  const sellerStr = String(seller).toLowerCase();
  return (
    sellerStr.startsWith('naver') || sellerStr.includes('네이버') || sellerStr.includes('naver')
  );
}

module.exports = {
  getSellerId,
  filterTopSellers,
  isNaverStore,
};
