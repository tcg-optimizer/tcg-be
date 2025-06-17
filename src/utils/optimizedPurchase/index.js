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
  tryComplexOptimization,
} = require('./optimizationStrategies');
const { getShippingInfo } = require('../shippingInfo');
const { calculatePointsAmount } = require('./pointsUtils');
const { getSellerId, isNaverStore } = require('./cardUtils');

/**
 * 카드 구매의 최적 조합을 찾는 함수
 * 그리디 알고리즘만 사용
 *
 * @param {Array<Object>} cardsList - 각 카드의 구매 가능한 상품 목록
 * @param {Object} options - 알고리즘 선택 및 성능 옵션
 * @returns {Object} - 최적 구매 조합 정보
 */
function findOptimalPurchaseCombination(cardsList, options = {}) {
  try {
    // 입력 데이터 검증
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
        version: 'v3.1.0',
        error: '유효한 카드 목록이 제공되지 않았습니다.',
      };
    }

    // 기본 옵션 설정
    const defaultOptions = {
      maxSellersPerCard: 50, // 고정값: 각 카드별 고려할 최대 판매처 수
      maxIterations: 50, // 고정값: 최적화 반복 횟수
      shippingRegion: 'default', // 배송 지역
      takeout: [], // 방문수령 옵션
      pointsOptions: {
        tcgshop: false, // TCGShop 적립금 고려 여부
        carddc: false, // CardDC 적립금 고려 여부

        // 네이버 관련 적립금 옵션
        naverBasic: false, // 네이버 기본 적립금 (2.5%, 리뷰 적립금 포함)
        naverBankbook: false, // 네이버 제휴통장 적립금 (0.5%)
        naverMembership: false, // 네이버 멤버십 적립금 (4%)
        naverHyundaiCard: false, // 네이버 현대카드 적립금 (7%)
      },
    };

    // 옵션 병합 (고정값은 병합하지 않음)
    const mergedOptions = {
      ...defaultOptions,
      shippingRegion: options.shippingRegion || defaultOptions.shippingRegion,
      takeout: options.takeout || defaultOptions.takeout,
      pointsOptions: { ...defaultOptions.pointsOptions },
    };

    // 사용자 지정 pointsOptions 병합
    if (options.pointsOptions) {
      Object.keys(options.pointsOptions).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(mergedOptions.pointsOptions, key)) {
          mergedOptions.pointsOptions[key] = options.pointsOptions[key];
        }
      });
    }

    // 제외할 상품 ID 목록과 상점 목록
    const excludedProductIds = options.excludedProductIds || [];
    const excludedStores = options.excludedStores || [];

    // 각 카드의 상품 목록에서 제외할 상품 ID와 상점 제외 처리
    const filteredCardsList = cardsList
      .map(card => {
        if (!card || !card.cardName) {
          return null;
        }

        if (!card.products) {
          return card;
        }

        if (!Array.isArray(card.products)) {
          // products가 객체이고 prices 속성이 있는 경우 (캐시된 형식)
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

        // 제외 조건에 맞는 상품 필터링
        const filteredProducts = card.products.filter(product => {
          if (!product) {
            return false;
          }

          // product.id 또는 product.product.id가 excludedProductIds에 포함되어 있는지 확인
          const productId = product.id || (product.product && product.product.id);

          // 모든 값을 문자열로 변환하여 비교 (타입 불일치 방지)
          const productIdStr = productId ? String(productId) : '';

          // 상품 ID가 제외 목록에 있는지 확인 (타입 안전한 비교)
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

          // 상점 제외 비교
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
        // null 또는 undefined 카드 제외
        if (!card) {
          return false;
        }

        // 상품이 없는 카드 제외
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
        version: 'v3.1.0',
        error: '모든 카드가 필터링되어 계산할 수 없습니다.',
        excludedFilters: {
          excludedProductIds,
          excludedStores,
        },
      };
    }

    // 각 카드에 대해 판매처별 상위 금액 필터링
    const processedCardsList = filterTopSellers(filteredCardsList, {
      ...mergedOptions,
      excludedProductIds, // 제외할 상품 ID 목록 전달
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
        version: 'v3.1.0',
        error: 'filterTopSellers 후 모든 카드가 필터링되어 계산할 수 없습니다.',
        excludedFilters: {
          excludedProductIds,
          excludedStores,
        },
      };
    }

    // 그리디 알고리즘으로 최적 조합 찾기
    const result = findGreedyOptimalPurchase(processedCardsList, {
      ...mergedOptions,
      excludedProductIds, // 명시적으로 제외 목록 전달
      excludedStores,
    });

    // 결과에 제외 필터 정보 추가
    result.excludedFilters = {
      excludedProductIds,
      excludedStores,
    };

    // 추가 필터링: 결과에서 제외 목록에 있는 상품 제거 (이중 안전장치)
    if (result.cardsOptimalPurchase) {
      let hasExcludedProducts = false;

      // 제외된 카드 이름 목록
      const excludedCardNames = new Set();

      Object.keys(result.cardsOptimalPurchase).forEach(seller => {
        const sellerData = result.cardsOptimalPurchase[seller];
        if (sellerData.cards && Array.isArray(sellerData.cards)) {
          // 제외된 상품 확인
          const excludedCards = sellerData.cards.filter(card => {
            if (card.product && card.product.id) {
              const productIdStr = String(card.product.id);

              // 상품 ID가 제외 목록에 있는지 정확히 확인
              let isExcluded = false;
              for (const excludedId of excludedProductIds) {
                const excludedIdStr = String(excludedId);
                if (productIdStr === excludedIdStr) {
                  console.log(
                    `[INFO] 최종 결과에서 제외된 상품 "${productIdStr}"가 발견되었습니다. (${card.cardName || '이름 없음'})`
                  );
                  console.log(
                    `  - 카드 정보: ${JSON.stringify(
                      {
                        cardName: card.cardName,
                        price: card.price,
                        site: card.product.site,
                      },
                      null,
                      2
                    )}`
                  );
                  hasExcludedProducts = true;
                  isExcluded = true;

                  // 제외된 카드 이름 추가
                  excludedCardNames.add(card.cardName);
                  break;
                }
              }

              return isExcluded;
            }
            return false;
          });

          // 제외된 상품이 있으면 실제로 해당 상품 제거
          if (excludedCards.length > 0) {
            console.log(
              `[INFO] ${seller}에서 ${excludedCards.length}개의 제외된 상품을 결과에서 제거합니다:`
            );
            excludedCards.forEach(card => {
              console.log(
                `  - ${card.cardName || '이름 없음'} (ID: ${card.product?.id || 'unknown'})`
              );
            });

            // 제외된 상품 제거 (정확한 비교 사용)
            const filteredCards = sellerData.cards.filter(card => {
              if (card.product && card.product.id) {
                const productIdStr = String(card.product.id);
                for (const excludedId of excludedProductIds) {
                  if (String(excludedId) === productIdStr) {
                    return false; // 제외된 ID와 일치하면 필터링 (제거)
                  }
                }
                return true; // 모든 제외 ID와 일치하지 않으면 유지
              }
              return true; // 상품 ID가 없으면 유지
            });

            // 판매처 카드 목록 업데이트
            result.cardsOptimalPurchase[seller].cards = filteredCards;

            // 판매처에 남은 카드가 없으면 판매처 자체를 제거
            if (filteredCards.length === 0) {
              console.log(`[INFO] ${seller}에 남은 카드가 없어 판매처를 결과에서 제거합니다.`);
              delete result.cardsOptimalPurchase[seller];

              // 모든 판매처가 제거됐는지 확인
              if (Object.keys(result.cardsOptimalPurchase).length === 0) {
                console.log('[INFO] 모든 판매처의 상품이 제외되어 결과가 없습니다.');
                result.success = false;
              }
            } else {
              // 비용 재계산
              const newProductCost = filteredCards.reduce((sum, card) => sum + card.totalPrice, 0);
              result.cardsOptimalPurchase[seller].productCost = newProductCost;

              // 무료 배송 기준 다시 확인
              const shippingInfo = getShippingInfo(seller);
              let newShippingCost;

              if (
                shippingInfo.freeShippingThreshold > 0 &&
                shippingInfo.freeShippingThreshold !== Infinity &&
                newProductCost >= shippingInfo.freeShippingThreshold
              ) {
                newShippingCost = 0;
              } else {
                // 무료배송 조건을 만족하지 못하면 정상 배송비 적용
                newShippingCost = shippingInfo.shippingFee;
              }

              result.cardsOptimalPurchase[seller].shippingCost = newShippingCost;

              // 적립금 재계산
              // 판매처에 따라 간단한 적립금 계산 적용
              let newPointsEarned = 0;
              if (seller.toLowerCase().includes('carddc') || seller.toLowerCase() === 'carddc') {
                newPointsEarned = Math.round(newProductCost * 0.1); // CardDC는 10% 적립
              } else if (
                seller.toLowerCase().includes('tcgshop') ||
                seller.toLowerCase() === 'tcgshop'
              ) {
                newPointsEarned = Math.round(newProductCost * 0.1); // TCGShop도 10% 적립
              } else if (isNaverStore(seller)) {
                // 네이버 스토어 적립금 계산
                const reviewedProducts = new Set(); // 리뷰 작성한 제품 목록
                // 각 카드별로 적립금 계산 후 합산
                let sellerPoints = 0;

                // 각 카드의 적립금을 개별적으로 계산
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

              // 최종 가격 재계산
              result.cardsOptimalPurchase[seller].finalPrice = newProductCost + newShippingCost;
            }
          }
        }
      });

      // 제외된 카드가 있는 경우, 다시 최적 구매 계산 시도
      if (excludedCardNames.size > 0) {
        console.log(
          `[INFO] 제외된 카드 ${excludedCardNames.size}개에 대해 대체 상품을 찾아 최적 조합 재계산을 시도합니다.`
        );

        // 제외된 카드 목록 중 가장 가격이 낮은 것부터 처리
        const excludedCardsList = [];

        // 제외된 카드의 원본 정보 찾기
        excludedCardNames.forEach(cardName => {
          const originalCard = filteredCardsList.find(c => c.cardName === cardName);
          if (originalCard) {
            excludedCardsList.push(originalCard);
          }
        });

        // 카드 가격 기준 정렬 (낮은 가격부터)
        excludedCardsList.sort((a, b) => {
          const aMinPrice = Math.min(...a.products.map(p => p.price));
          const bMinPrice = Math.min(...b.products.map(p => p.price));
          return aMinPrice - bMinPrice;
        });

        // 각 제외된 카드에 대해 대체 상품 찾기
        for (const excludedCard of excludedCardsList) {
          console.log(`[INFO] "${excludedCard.cardName}" 카드의 대체 상품 찾기 시도...`);

          // 해당 카드의 대체 상품 찾기 (제외된 상품 ID가 아닌 것들 중에서)
          const alternativeProducts = excludedCard.products.filter(product => {
            const productId = product.id || (product.product && product.product.id);
            const productIdStr = productId ? String(productId) : '';

            // 제외 목록에 없는 상품만 선택
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

          // 가격순 정렬
          alternativeProducts.sort((a, b) => a.price - b.price);

          const bestAlternative = alternativeProducts[0];
          const sellerId = getSellerId(bestAlternative.site || bestAlternative.product?.site);

          console.log(
            `[INFO] "${excludedCard.cardName}" 카드의 최저가 대체 상품 찾음: ${sellerId}의 ${bestAlternative.price}원 상품`
          );

          // 해당 판매처가 없으면 새로 생성
          if (!result.cardsOptimalPurchase[sellerId]) {
            result.cardsOptimalPurchase[sellerId] = {
              cards: [],
              finalPrice: 0,
              productCost: 0,
              shippingCost: 0,
              pointsEarned: 0,
            };
          }

          // 카드 정보 추가
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
            },
            image: excludedCard.image,
          };

          result.cardsOptimalPurchase[sellerId].cards.push(cardToAdd);

          // 해당 판매처의 비용 업데이트
          result.cardsOptimalPurchase[sellerId].productCost += cardToAdd.totalPrice;

          // 배송비 계산
          const shippingInfo = getShippingInfo(sellerId);
          result.cardsOptimalPurchase[sellerId].shippingCost =
            result.cardsOptimalPurchase[sellerId].productCost >=
              shippingInfo.freeShippingThreshold && shippingInfo.freeShippingThreshold !== Infinity
              ? 0
              : shippingInfo.shippingFee;

          // 적립금 계산
          let pointsEarned = 0;
          if (sellerId.toLowerCase().includes('carddc') || sellerId.toLowerCase() === 'carddc') {
            pointsEarned = Math.round(result.cardsOptimalPurchase[sellerId].productCost * 0.1);
          } else if (
            sellerId.toLowerCase().includes('tcgshop') ||
            sellerId.toLowerCase() === 'tcgshop'
          ) {
            pointsEarned = Math.round(result.cardsOptimalPurchase[sellerId].productCost * 0.1);
          } else if (isNaverStore(sellerId)) {
            // 네이버 스토어 적립금 계산
            const reviewedProducts = new Set(); // 리뷰 작성한 제품 목록

            // 각 카드별로 적립금 계산 후 합산
            let sellerPoints = 0;
            result.cardsOptimalPurchase[sellerId].cards.forEach(card => {
              // 카드 이름을 ID로 사용
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
            result.cardsOptimalPurchase[sellerId].pointsEarned = sellerPoints; // 판매처 데이터에도 적립금 설정
          }

          result.cardsOptimalPurchase[sellerId].pointsEarned = pointsEarned;

          // 최종 가격 계산
          result.cardsOptimalPurchase[sellerId].finalPrice =
            result.cardsOptimalPurchase[sellerId].productCost +
            result.cardsOptimalPurchase[sellerId].shippingCost;

          // 카드 이미지 정보 업데이트
          if (!result.cardImages) {
            result.cardImages = {};
          }

          if (excludedCard.image && !result.cardImages[excludedCard.cardName]) {
            result.cardImages[excludedCard.cardName] = excludedCard.image;
          }
        }

        // 대체 상품 계산 후 성공 상태 재설정 (대체 상품이 하나라도 있으면 성공으로 간주)
        if (Object.keys(result.cardsOptimalPurchase).length > 0) {
          result.success = true;

          // 이전에 설정된 오류 메시지가 있으면 제거
          if (result.error) {
            delete result.error;
          }
        }

        hasExcludedProducts = true; // 비용 재계산 필요
      }

      // 전체 비용 재계산
      if (hasExcludedProducts && Object.keys(result.cardsOptimalPurchase).length > 0) {
        console.log('[INFO] 비용 정보를 다시 계산합니다.');
        let totalProductCost = 0;
        let totalShippingCost = 0;
        let totalPointsEarned = 0;

        Object.entries(result.cardsOptimalPurchase).forEach(([seller, sellerData]) => {
          totalProductCost += sellerData.productCost || 0;
          totalShippingCost += sellerData.shippingCost || 0;

          // 적립금 계산 로직
          if (sellerData.pointsEarned) {
            totalPointsEarned += sellerData.pointsEarned;
          } else if (sellerData.productCost) {
            // 판매처에 따라 적립률 적용 (CardDC와 TCGShop은 10%, 나머지는 0%)
            if (seller.toLowerCase().includes('carddc') || seller.toLowerCase() === 'carddc') {
              const points = Math.round(sellerData.productCost * 0.1);
              totalPointsEarned += points;
              sellerData.pointsEarned = points; // 판매처 데이터에도 적립금 설정
            } else if (
              seller.toLowerCase().includes('tcgshop') ||
              seller.toLowerCase() === 'tcgshop'
            ) {
              const points = Math.round(sellerData.productCost * 0.1);
              totalPointsEarned += points;
              sellerData.pointsEarned = points; // 판매처 데이터에도 적립금 설정
            } else if (isNaverStore(seller)) {
              // 네이버 스토어 적립금 계산
              const reviewedProducts = new Set(); // 리뷰 작성한 제품 목록

              // 각 카드별로 적립금 계산 후 합산
              let sellerPoints = 0;
              sellerData.cards.forEach(card => {
                // 카드 이름을 ID로 사용
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

              totalPointsEarned += sellerPoints;
              sellerData.pointsEarned = sellerPoints; // 판매처 데이터에도 적립금 설정
            }
          }
        });

        result.totalProductCost = totalProductCost;
        result.totalShippingCost = totalShippingCost;
        result.totalPointsEarned = totalPointsEarned;
        result.totalCost = totalProductCost + totalShippingCost - totalPointsEarned;
      }
    }

    return {
      ...result,
      algorithm: 'improved_greedy',
      version: 'v3.1.0',
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
      version: 'v3.1.0',
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
  // 내부 유틸리티 함수도 내보내 테스트 가능하도록 함
  filterTopSellers,
  tryMoveCardsToReachThreshold,
  tryMultipleCardsMove,
  trySellersConsolidation,
  tryComplexOptimization,
};
