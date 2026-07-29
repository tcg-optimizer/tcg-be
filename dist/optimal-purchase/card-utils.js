"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerId = getSellerId;
exports.filterTopSellers = filterTopSellers;
exports.isNaverStore = isNaverStore;
const shipping_info_1 = require("../common/utils/shipping-info");
function getSellerId(seller) {
    if (typeof seller === 'string') {
        return seller;
    }
    if (seller.normalizedSite) {
        return seller.normalizedSite;
    }
    return seller.name || seller.id || String(seller);
}
// options는 객체 외에 숫자(topN 직접 지정)도 받는 원본 시그니처
// 반환이 NormalizedCardSpec[]인 이유: 마지막 filter가 products 비어있는 카드를 제거하고,
// map이 항상 products 배열을 부착한다 (greedy 알고리즘이 이 보장을 전제)
function filterTopSellers(cardsList, options) {
    let topN = 30;
    if (typeof options === 'number') {
        topN = options;
    }
    else if (typeof options === 'object' && options !== null) {
        topN = options.maxSellersPerCard || 30;
    }
    // options가 숫자인 경우 프로퍼티 접근은 undefined → [] (원본 런타임 동작 그대로, 캐스트만)
    const excludedProductIds = (options && options.excludedProductIds) || [];
    const excludedStores = (options && options.excludedStores) || [];
    return (cardsList
        // 레거시 {prices: [...]} 객체형 products 방어 + 동적 필드(desiredRarity) 접근 — 콜백만 any 유지
        .map((card) => {
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
            const aInfo = (0, shipping_info_1.getShippingInfo)(getSellerId(a.site));
            const bInfo = (0, shipping_info_1.getShippingInfo)(getSellerId(b.site));
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
    }));
}
function isNaverStore(seller) {
    if (!seller)
        return false;
    const sellerStr = String(seller).toLowerCase();
    return (sellerStr.startsWith('naver') || sellerStr.includes('네이버') || sellerStr.includes('naver'));
}
//# sourceMappingURL=card-utils.js.map