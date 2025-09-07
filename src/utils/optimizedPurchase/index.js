const { findGreedyOptimalPurchase } = require('./greedyAlgorithm');
const { calculatePointsAmount } = require('./pointsUtils');
const { getSellerId, filterTopSellers, isNaverStore } = require('./cardUtils');
const {
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
} = require('./optimizationStrategies');
const { calculateShippingFee, REGION_TYPES } = require('../shippingInfo');

function findOptimalPurchaseCombination(cardsList, options = {}) {
  try {
    if (!cardsList || !Array.isArray(cardsList) || cardsList.length === 0) {
      return {
        success: false,
        totalCost: 0,
        totalProductCost: 0,
        totalShippingCost: 0,
        totalPointsEarned: 0,
        pointsOptions: options.pointsOptions || {},
        shippingRegion: options.shippingRegion || 'default',
        cardsOptimalPurchase: {},
        cardImages: {},
        algorithm: 'improved_greedy',
        error: '유효한 카드 목록이 제공되지 않았습니다.',
      };
    }

 
    const defaultOptions = {
      maxSellersPerCard: 50,
      maxIterations: 50,
      shippingRegion: 'default',
      takeout: [],
      pointsOptions: {
        tcgshop: false, // TCGShop 적립금 고려 여부
        carddc: false, // CardDC 적립금 고려 여부
        naverBasic: false, // 네이버 기본 적립금 (2.5%, 리뷰 적립금 150원)
        naverBankbook: false, // 네이버 제휴통장 적립금 (0.5%)
        naverMembership: false, // 네이버 멤버십 적립금 (4%)
        naverHyundaiCard: false, // 네이버 현대카드 적립금 (7%)
      },
    };

    const mergedOptions = {
      ...defaultOptions,
      shippingRegion: options.shippingRegion || defaultOptions.shippingRegion,
      takeout: options.takeout || defaultOptions.takeout,
      pointsOptions: { ...defaultOptions.pointsOptions },
    };

    if (options.pointsOptions) {
      Object.keys(options.pointsOptions).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(mergedOptions.pointsOptions, key)) {
          mergedOptions.pointsOptions[key] = options.pointsOptions[key];
        }
      });
    }

    const excludedProductIds = options.excludedProductIds || [];
    const excludedStores = options.excludedStores || [];

    const filteredCardsList = cardsList
      .map(card => {
        if (!card || !card.cardName) {
          return null;
        }

        if (!card.products) {
          return card;
        }

        if (!Array.isArray(card.products)) {
          if (typeof card.products === 'object' && card.products !== null && card.products.prices) {
            if (Array.isArray(card.products.prices)) {
              return {
                ...card,
                products: card.products.prices,
              };
            }
          }

          return {
            ...card,
            products: [],
          };
        }

        const filteredProducts = card.products.filter(product => {
          if (!product) {
            return false;
          }

          const productId = product.id || (product.product && product.product.id);

          const productIdStr = productId ? String(productId) : '';

          let shouldExcludeById = false;

          if (productIdStr) {
            for (const excludedId of excludedProductIds) {
              const excludedIdStr = String(excludedId);
              if (productIdStr === excludedIdStr) {
                shouldExcludeById = true;
                break;
              }
            }
          }

          // 제외된 상품 로깅
          if (shouldExcludeById && productIdStr) {
            console.error(
              `[DEBUG] optimizedPurchase: 상품 ID "${productIdStr}" 제외됨 (${card.cardName || 'Unknown'})`
            );
          }

          const site = product.site || (product.product && product.product.site);
          const shouldExcludeBySite = site && excludedStores.includes(site);

          return !shouldExcludeById && !shouldExcludeBySite;
        });

        return {
          ...card,
          products: filteredProducts,
        };
      })
      .filter(card => {
        if (!card) {
          return false;
        }

        const hasProducts = card.products && card.products.length > 0;
        return hasProducts;
      });

    if (filteredCardsList.length === 0) {
      return {
        success: false,
        totalCost: 0,
        totalProductCost: 0,
        totalShippingCost: 0,
        totalPointsEarned: 0,
        pointsOptions: mergedOptions.pointsOptions,
        shippingRegion: mergedOptions.shippingRegion,
        cardsOptimalPurchase: {},
        cardImages: {},
        algorithm: 'improved_greedy',
        error: '모든 카드가 필터링되어 계산할 수 없습니다.',
        excludedFilters: {
          excludedProductIds,
          excludedStores,
        },
      };
    }

    const processedCardsList = filterTopSellers(filteredCardsList, {
      ...mergedOptions,
      excludedProductIds,
    });

    if (processedCardsList.length === 0) {
      return {
        success: false,
        totalCost: 0,
        totalProductCost: 0,
        totalShippingCost: 0,
        totalPointsEarned: 0,
        pointsOptions: mergedOptions.pointsOptions,
        shippingRegion: mergedOptions.shippingRegion,
        cardsOptimalPurchase: {},
        cardImages: {},
        algorithm: 'improved_greedy',
        error: 'filterTopSellers 후 모든 카드가 필터링되어 계산할 수 없습니다.',
        excludedFilters: {
          excludedProductIds,
          excludedStores,
        },
      };
    }

    // 그리디 알고리즘으로 최적 조합 찾기
    let result = findGreedyOptimalPurchase(processedCardsList, {
      ...mergedOptions,
      excludedProductIds,
      excludedStores,
    });
    let bestExcludedStores = [...excludedStores];


    // 추가 최적화 - 특정 상점을 제외했을 때 더 저렴해지는지 탐색
    // 배송비 구조 변화로 더 저렴해지는 케이스가 있기 때문에 로직 추가함

    try {
      let candidateSellers = [];

      if (result.cardsOptimalPurchase && Object.keys(result.cardsOptimalPurchase).length > 0) {
        candidateSellers = Object.keys(result.cardsOptimalPurchase)
          .filter(seller => {
            if (excludedStores.includes(seller)) return false;
            const info = result.cardsOptimalPurchase[seller];
            if (!info) return false;
            const { shippingCost = 0, productCost = 0, cards = [] } = info;
            return shippingCost > 0 && (cards.length <= 2 || productCost < shippingCost * 2);
          })
          .sort((a, b) => {
            const shipA = result.cardsOptimalPurchase[a].shippingCost || 0;
            const shipB = result.cardsOptimalPurchase[b].shippingCost || 0;
            return shipB - shipA;
          })
          .slice(0, 20);
      }

      for (const sellerToExclude of candidateSellers) {
        const altResult = findGreedyOptimalPurchase(processedCardsList, {
          ...mergedOptions,
          excludedProductIds,
          excludedStores: [...excludedStores, sellerToExclude],
        });

        if (altResult.success && altResult.totalCost < result.totalCost) {
          result = altResult;
          bestExcludedStores = [...excludedStores, sellerToExclude];
        }
      }
    } catch (altErr) {
      console.error('[WARN] 상점 제외 탐색 중 오류 발생:', altErr.message);
    }

    result.excludedFilters = {
      excludedProductIds,
      excludedStores: bestExcludedStores,
    };

    if (result.cardsOptimalPurchase) {
      let hasExcludedProducts = false;

      const excludedCardNames = new Set();

      Object.keys(result.cardsOptimalPurchase).forEach(seller => {
        const sellerData = result.cardsOptimalPurchase[seller];
        if (sellerData.cards && Array.isArray(sellerData.cards)) {
          const originalCardCount = sellerData.cards.length;
          
          const filteredCards = sellerData.cards.filter(card => {
            if (card.product && card.product.id) {
              const productIdStr = String(card.product.id);
              for (const excludedId of excludedProductIds) {
                if (String(excludedId) === productIdStr) {
                  console.log(
                    `[INFO] 최종 결과에서 제외된 상품 "${productIdStr}"가 발견되었습니다. (${card.cardName || '이름 없음'})`
                  );
                  hasExcludedProducts = true;
                  excludedCardNames.add(card.cardName);
                  return false;
                }
              }
              return true;
            }
            return true;
          });

          if (filteredCards.length !== originalCardCount) {
            console.log(
              `[INFO] ${seller}에서 ${originalCardCount - filteredCards.length}개의 제외된 상품을 결과에서 제거합니다.`
            );

            result.cardsOptimalPurchase[seller].cards = filteredCards;

            if (filteredCards.length === 0) {
              console.log(`[INFO] ${seller}에 남은 카드가 없어 판매처를 결과에서 제거합니다.`);
              delete result.cardsOptimalPurchase[seller];

              if (Object.keys(result.cardsOptimalPurchase).length === 0) {
                console.log('[INFO] 모든 판매처의 상품이 제외되어 결과가 없습니다.');
                result.success = false;
              }
            } else if (filteredCards.length !== sellerData.cards.length) {
              console.log(`[INFO] ${seller}에서 카드가 제거되었으므로 비용을 재계산합니다.`);
              
              const newProductCost = filteredCards.reduce((sum, card) => {
                const price = card.price || 0;
                const quantity = card.quantity || 1;
                return sum + (price * quantity);
              }, 0);
              result.cardsOptimalPurchase[seller].productCost = newProductCost;

              const shippingRegionType =
                mergedOptions.shippingRegion === 'jeju'
                  ? REGION_TYPES.JEJU
                  : mergedOptions.shippingRegion === 'island'
                    ? REGION_TYPES.ISLAND
                    : REGION_TYPES.DEFAULT;
              const takeoutOptions = mergedOptions.takeout || [];

              const newShippingCost = calculateShippingFee(
                seller,
                shippingRegionType,
                newProductCost,
                takeoutOptions
              );

              result.cardsOptimalPurchase[seller].shippingCost = newShippingCost;

              let newPointsEarned = 0;
              if (seller.toLowerCase().includes('carddc') || seller.toLowerCase() === 'carddc') {
                newPointsEarned = Math.round(newProductCost * 0.1);
              } else if (
                seller.toLowerCase().includes('tcgshop') ||
                seller.toLowerCase() === 'tcgshop'
              ) {
                newPointsEarned = Math.round(newProductCost * 0.1);
              } else if (isNaverStore(seller)) {
                const reviewedProducts = new Set();
                let sellerPoints = 0;

                result.cardsOptimalPurchase[seller].cards.forEach(card => {
                  const productId = card.cardName;
                  const cardPoints = calculatePointsAmount(
                    seller,
                    card.price,
                    card.quantity,
                    productId,
                    reviewedProducts,
                    options.pointsOptions || {}
                  );
                  sellerPoints += cardPoints;
                });

                newPointsEarned = sellerPoints;
              }

              result.cardsOptimalPurchase[seller].pointsEarned = newPointsEarned;

              result.cardsOptimalPurchase[seller].finalPrice = newProductCost + newShippingCost - newPointsEarned;
            }
          }
        }
      });

      if (excludedCardNames.size > 0) {
        console.log(
          `[INFO] 제외된 카드 ${excludedCardNames.size}개에 대해 대체 상품을 찾아 최적 조합 재계산을 시도합니다.`
        );

        const excludedCardsList = [];

        excludedCardNames.forEach(cardName => {
          const originalCard = filteredCardsList.find(c => c.cardName === cardName);
          if (originalCard) {
            excludedCardsList.push(originalCard);
          }
        });

        excludedCardsList.sort((a, b) => {
          const aMinPrice = Math.min(...a.products.map(p => p.price));
          const bMinPrice = Math.min(...b.products.map(p => p.price));
          return aMinPrice - bMinPrice;
        });

        for (const excludedCard of excludedCardsList) {
          console.log(`[INFO] "${excludedCard.cardName}" 카드의 대체 상품 찾기 시도...`);

          const alternativeProducts = excludedCard.products.filter(product => {
            const productId = product.id || (product.product && product.product.id);
            const productIdStr = productId ? String(productId) : '';

            if (productIdStr && excludedProductIds.length > 0) {
              for (const excludedId of excludedProductIds) {
                if (String(excludedId) === productIdStr) {
                  return false;
                }
              }
            }
            return true;
          });

          if (alternativeProducts.length === 0) {
            console.log(`[INFO] "${excludedCard.cardName}" 카드의 대체 상품을 찾을 수 없습니다.`);
            continue;
          }

          alternativeProducts.sort((a, b) => a.price - b.price);

          const bestAlternative = alternativeProducts[0];
          const sellerId = getSellerId(bestAlternative.site || bestAlternative.product?.site);

          console.log(
            `[INFO] "${excludedCard.cardName}" 카드의 최저가 대체 상품 찾음: ${sellerId}의 ${bestAlternative.price}원 상품`
          );

          if (!result.cardsOptimalPurchase[sellerId]) {
            result.cardsOptimalPurchase[sellerId] = {
              cards: [],
              finalPrice: 0,
              productCost: 0,
              shippingCost: 0,
              pointsEarned: 0,
            };
          }

          const cardToAdd = {
            cardName: excludedCard.cardName,
            price: bestAlternative.price,
            quantity: excludedCard.quantity || 1,
            totalPrice: bestAlternative.price * (excludedCard.quantity || 1),
            product: bestAlternative.product || {
              id: bestAlternative.id,
              url: bestAlternative.url,
              site: bestAlternative.site,
              price: bestAlternative.price,
              available: bestAlternative.available,
              cardCode: bestAlternative.cardCode,
              condition: bestAlternative.condition,
              language: bestAlternative.language,
              rarity: bestAlternative.rarity,
              illustration: bestAlternative.illustration || 'default',
            },
            image: excludedCard.image,
          };

          result.cardsOptimalPurchase[sellerId].cards.push(cardToAdd);

          result.cardsOptimalPurchase[sellerId].productCost += cardToAdd.totalPrice;

          const altRegionType =
            mergedOptions.shippingRegion === 'jeju'
              ? REGION_TYPES.JEJU
              : mergedOptions.shippingRegion === 'island'
                ? REGION_TYPES.ISLAND
                : REGION_TYPES.DEFAULT;
          const altTakeoutOptions = mergedOptions.takeout || [];

          result.cardsOptimalPurchase[sellerId].shippingCost = calculateShippingFee(
            sellerId,
            altRegionType,
            result.cardsOptimalPurchase[sellerId].productCost,
            altTakeoutOptions
          );

          let pointsEarned = 0;
          if (sellerId.toLowerCase().includes('carddc') || sellerId.toLowerCase() === 'carddc') {
            pointsEarned = Math.round(result.cardsOptimalPurchase[sellerId].productCost * 0.1);
          } else if (
            sellerId.toLowerCase().includes('tcgshop') ||
            sellerId.toLowerCase() === 'tcgshop'
          ) {
            pointsEarned = Math.round(result.cardsOptimalPurchase[sellerId].productCost * 0.1);
          } else if (isNaverStore(sellerId)) {
            const reviewedProducts = new Set();

            let sellerPoints = 0;
            result.cardsOptimalPurchase[sellerId].cards.forEach(card => {
              const productId = card.cardName;

              const cardPoints = calculatePointsAmount(
                sellerId,
                card.price,
                card.quantity,
                productId,
                reviewedProducts,
                options.pointsOptions || {}
              );

              sellerPoints += cardPoints;
            });

            pointsEarned = sellerPoints;
            result.cardsOptimalPurchase[sellerId].pointsEarned = sellerPoints;
          }

          result.cardsOptimalPurchase[sellerId].pointsEarned = pointsEarned;

          result.cardsOptimalPurchase[sellerId].finalPrice =
            result.cardsOptimalPurchase[sellerId].productCost +
            result.cardsOptimalPurchase[sellerId].shippingCost -
            result.cardsOptimalPurchase[sellerId].pointsEarned;

          if (!result.cardImages) {
            result.cardImages = {};
          }

          if (excludedCard.image && !result.cardImages[excludedCard.cardName]) {
            result.cardImages[excludedCard.cardName] = excludedCard.image;
          }
        }

        if (Object.keys(result.cardsOptimalPurchase).length > 0) {
          result.success = true;

          if (result.error) {
            delete result.error;
          }
        }

        hasExcludedProducts = true;
      }

      if (hasExcludedProducts && Object.keys(result.cardsOptimalPurchase).length > 0) {
        console.log('[INFO] 비용 정보를 다시 계산합니다.');
        let totalProductCost = 0;
        let totalShippingCost = 0;
        let totalPointsEarned = 0;

        Object.entries(result.cardsOptimalPurchase).forEach(([_, sellerData]) => {
          totalProductCost += sellerData.productCost || 0;
          totalShippingCost += sellerData.shippingCost || 0;
          totalPointsEarned += sellerData.pointsEarned || 0;

        });

        result.totalProductCost = totalProductCost;
        result.totalShippingCost = totalShippingCost;
        result.totalPointsEarned = totalPointsEarned;
        result.totalCost = Object.values(result.cardsOptimalPurchase).reduce(
          (sum, sellerData) => sum + (sellerData.finalPrice || 0),
          0
        );
      }
    }

    return {
      ...result,
      algorithm: 'improved_greedy',
    };
  } catch (error) {
    console.log('[INFO] 최적 구매 조합 계산 중 예외 발생:', error);
    return {
      success: false,
      totalCost: 0,
      totalProductCost: 0,
      totalShippingCost: 0,
      totalPointsEarned: 0,
      pointsOptions: options.pointsOptions || {},
      shippingRegion: options.shippingRegion || 'default',
      cardsOptimalPurchase: {},
      cardImages: {},
      algorithm: 'improved_greedy',
      error: `계산 중 오류 발생: ${error.message}`,
      excludedFilters: {
        excludedProductIds: options.excludedProductIds || [],
        excludedStores: options.excludedStores || [],
      },
    };
  }
}

module.exports = {
  findOptimalPurchaseCombination,
  findGreedyOptimalPurchase,
  filterTopSellers,
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
};
