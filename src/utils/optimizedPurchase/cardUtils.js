const { getShippingInfo } = require('../shippingInfo');

function getSellerId(seller) {
  if (typeof seller === 'string') {
    return seller;
  }

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

      if (!Array.isArray(productsList) && productsList.prices) {
        productsList = productsList.prices;
      }

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

      if (card.desiredRarity) {
        filteredProducts = productsList.filter(product => {
          const productRarity = (product.rarity || '').toLowerCase();
          const desiredRarity = card.desiredRarity.toLowerCase();

          return productRarity === desiredRarity;
        });

        if (filteredProducts.length === 0) {
          return {
            ...card,
            products: [],
          };
        }
      }

      // 각 카드의 상품을 가격순으로 정렬, 가격이 같을 경우 배송비가 저렴한 판매처 우선
      const sortedProducts = [...filteredProducts].sort((a, b) => {
        // 우선 가격으로 정렬
        if (a.price !== b.price) {
          return a.price - b.price;
        }

        const aInfo = getShippingInfo(getSellerId(a.site));
        const bInfo = getShippingInfo(getSellerId(b.site));

        return aInfo.shippingFee - bInfo.shippingFee;
      });

      const productsBySeller = {};
      for (const product of sortedProducts) {
        const sellerId = getSellerId(product.site || product.product?.site);

        if (!productsBySeller[sellerId] || product.price < productsBySeller[sellerId].price) {
          productsBySeller[sellerId] = product;
        }
      }

      const groupedProducts = Object.values(productsBySeller).sort((a, b) => a.price - b.price);

      // 제외된 상품 ID로 인해 선택되지 않은 판매처가 있는지 확인하기 위한 리스트
      const includedSellers = new Set();
      const filteredBySellerProducts = [];

      for (const product of groupedProducts) {
        const sellerId = getSellerId(product.site || product.product?.site);
        const productId = product.id || (product.product && product.product.id);
        const productIdStr = productId ? String(productId) : '';

        let isExcluded = false;
        if (productIdStr && excludedProductIds.length > 0) {
          for (const excludedId of excludedProductIds) {
            if (String(excludedId) === productIdStr) {
              isExcluded = true;
              break;
            }
          }
        }

        if (!isExcluded && !includedSellers.has(sellerId) && includedSellers.size < topN) {
          includedSellers.add(sellerId);
          filteredBySellerProducts.push(product);
        }
      }

      if (filteredBySellerProducts.length < Math.min(topN, groupedProducts.length)) {
        for (const product of sortedProducts) {
          const sellerId = getSellerId(product.site || product.product?.site);
          const productId = product.id || (product.product && product.product.id);
          const productIdStr = productId ? String(productId) : '';

          let isExcluded = false;
          if (productIdStr && excludedProductIds.length > 0) {
            for (const excludedId of excludedProductIds) {
              if (String(excludedId) === productIdStr) {
                isExcluded = true;
                break;
              }
            }
          }

          if (includedSellers.has(sellerId)) {
            continue;
          }

          if (!isExcluded && includedSellers.size < topN) {
            includedSellers.add(sellerId);
            filteredBySellerProducts.push(product);

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
