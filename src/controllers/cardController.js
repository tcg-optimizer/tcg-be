const { Card } = require('../models/Card');
const { Op } = require('sequelize');
const { searchAndSaveCardPrices } = require('../utils/crawler');
const { searchAndSaveCardPricesApi } = require('../utils/naverShopApi');
const { searchAndSaveTCGShopPrices } = require('../utils/tcgshopCrawler');
const { searchAndSaveCardDCPrices } = require('../utils/cardDCCrawler');
// const { searchAndSaveOnlyYugiohPrices } = require('../utils/onlyYugiohCrawler'); // 온리유희왕 일시적 영업중단으로 주석처리
const { findOptimalPurchaseCombination } = require('../utils/optimizedPurchase');
const { shouldSkipMarketplace } = require('../utils/shippingInfo');
const CardPriceCache = require('../models/CardPriceCache');
const rateLimit = require('express-rate-limit');
const { cardRequestLimiter } = require('../utils/rateLimiter');

// 카드 가격 검색 API에 대한 특별 제한 설정
const cardPriceRateLimiter = rateLimit({
  windowMs: 30 * 1000, // 30초
  max: 20, // 30초당 20개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 가격 검색 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
  keyGenerator: req => {
    // IP와 카드 이름을 조합하여 키 생성 (같은 카드 반복 요청 방지)
    return `${req.ip}:${req.query.cardName || 'unknown'}`;
  },
});

// 최적 구매 조합 API에 대한 제한 설정
const optimalPurchaseRateLimiter = rateLimit({
  windowMs: 30 * 1000, // 30초
  max: 15, // 30초당 15개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '최적 구매 조합 계산 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
});

// 카드 검색 API에 대한 제한 설정
const cardSearchRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10초
  max: 15, // 10초당 15개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
});

// 모든 카드 목록 가져오기
exports.getAllCards = async (req, res) => {
  try {
    const cards = await Card.findAll({
      attributes: ['id', 'name', 'koName', 'cardType', 'image', 'rarity', 'rarityCode'],
    });

    res.status(200).json({
      success: true,
      count: cards.length,
      data: cards,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// 레어도별 카드 가격 정보 가져오기
exports.getPricesByRarity = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    try {
      const { cardName } = req.query; // 쿼리 스트링에서 카드 이름 가져오기

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      // 센터 카드인지 확인 (ST19-KRFC1~4)
      if (/^ST19-KRFC[1-4]$/i.test(cardName)) {
        return res.status(404).json({
          success: false,
          error: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.',
        });
      }

      let card = null;
      let prices = [];
      let searchSource = 'api';

      // 1. 캐시에서 먼저 검색
      const cachedResult = await CardPriceCache.findOne({
        where: {
          cardName: cardName,
          expiresAt: { [Op.gt]: new Date() },
        },
      });

      if (cachedResult) {
        console.log(`[DEBUG] 캐시에서 "${cardName}" 레어도별 검색 결과 발견`);
        // 캐시 데이터의 구조 검사 (구 버전과 신 버전 호환성)
        let responseData = {
          success: true,
          source: 'cache',
          data: {
            cardName: cachedResult.cardName,
            image: cachedResult.image,
          },
        };

        // 캐시 데이터 구조 검증 및 정규화
        let normalizedRarityPrices = {};

        try {
          let rarityPrices;
          try {
            rarityPrices = JSON.parse(cachedResult.rarityPrices);
          } catch (error) {
            rarityPrices = cachedResult.rarityPrices;
          }

          // illustration -> language -> rarity -> {image, prices} 구조로 처리
          normalizedRarityPrices = rarityPrices;

          // 품절된 상품 필터링 (available 필드가 false인 아이템 제외)
          let totalProducts = 0;
          Object.keys(normalizedRarityPrices).forEach(illustration => {
            Object.keys(normalizedRarityPrices[illustration] || {}).forEach(language => {
              Object.keys(normalizedRarityPrices[illustration][language] || {}).forEach(rarity => {
                if (
                  normalizedRarityPrices[illustration][language][rarity] &&
                  normalizedRarityPrices[illustration][language][rarity].prices
                ) {
                  normalizedRarityPrices[illustration][language][rarity].prices =
                    normalizedRarityPrices[illustration][language][rarity].prices.filter(
                      price => price.available !== false
                    );
                  totalProducts +=
                    normalizedRarityPrices[illustration][language][rarity].prices.length;
                }
              });
            });
          });

          // 빈 레어도 그룹 제거 (필터링 후 상품이 없는 경우)
          Object.keys(normalizedRarityPrices).forEach(illustration => {
            Object.keys(normalizedRarityPrices[illustration] || {}).forEach(language => {
              Object.keys(normalizedRarityPrices[illustration][language] || {}).forEach(rarity => {
                if (
                  normalizedRarityPrices[illustration][language][rarity] &&
                  normalizedRarityPrices[illustration][language][rarity].prices &&
                  normalizedRarityPrices[illustration][language][rarity].prices.length === 0
                ) {
                  delete normalizedRarityPrices[illustration][language][rarity];
                }
              });

              // 빈 언어 그룹 제거
              if (Object.keys(normalizedRarityPrices[illustration][language] || {}).length === 0) {
                delete normalizedRarityPrices[illustration][language];
              }
            });

            // 빈 일러스트 그룹 제거
            if (Object.keys(normalizedRarityPrices[illustration] || {}).length === 0) {
              delete normalizedRarityPrices[illustration];
            }
          });

          responseData.rarityPrices = normalizedRarityPrices;
          responseData.data.totalProducts = totalProducts;

          if (Object.keys(normalizedRarityPrices).length === 0) {
            // 정규화 후 데이터가 없는 경우 캐시 무효화

            // 캐시 항목 만료 설정
            await cachedResult.update({
              expiresAt: new Date(Date.now() - 1000), // 현재 시간보다 이전으로 설정하여 만료 처리
            });

            // 캐시에서 데이터를 찾지 못한 것처럼 다음 단계로 진행
          }

          // 캐시 ID와 만료 시간을 응답에 추가
          responseData.cacheId = cachedResult.id;
          responseData.cacheExpiresAt = cachedResult.expiresAt;

          return res.status(200).json(responseData);
        } catch (error) {
          console.error(`[ERROR] 캐시 데이터 정규화 중 오류 발생: ${error.message}`);
          console.error(error.stack);

          // 캐시 항목 만료 설정
          await cachedResult.update({
            expiresAt: new Date(Date.now() - 1000), // 현재 시간보다 이전으로 설정하여 만료 처리
          });

          // 캐시에서 데이터를 찾지 못한 것처럼 다음 단계로 진행
        }
      }

      // 2. 캐시에 없으면 모든 소스에서 동시에 검색
      try {
        // 모든 소스에서 병렬로 검색 (Promise.all 사용)
        const [naverResult, tcgshopResult, cardDCResult /* , onlyYugiohResult */] =
          await Promise.all([
            // 네이버 쇼핑 API 검색
            searchAndSaveCardPricesApi(cardName).catch(error => {
              console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
              return { count: 0, prices: [], rawResults: [] };
            }),

            // TCGShop 검색
            searchAndSaveTCGShopPrices(cardName, null).catch(error => {
              console.error(`[ERROR] TCGShop 검색 오류: ${error.message}`);
              return { count: 0, prices: [] };
            }),

            // CardDC 검색
            searchAndSaveCardDCPrices(cardName, null).catch(error => {
              console.error(`[ERROR] CardDC 검색 오류: ${error.message}`);
              return { count: 0, prices: [] };
            }),

            // OnlyYugioh 검색 - 일시적 영업 중단으로 주석 처리
            /* searchAndSaveOnlyYugiohPrices(cardName, null).catch(error => {
          console.error(`[ERROR] OnlyYugioh 검색 오류: ${error.message}`);
          return { count: 0, prices: [] };
        }) */
          ]);

        // 결과가 하나라도 있는지 확인
        const hasResults =
          (naverResult && naverResult.count > 0) ||
          (tcgshopResult && tcgshopResult.count > 0) ||
          (cardDCResult && cardDCResult.count > 0); /* || 
        (onlyYugiohResult && onlyYugiohResult.count > 0) */

        if (!hasResults) {
          return res.status(404).json({
            success: false,
            error: '카드를 찾을 수 없습니다. 모든 소스에서 검색 결과가 없습니다.',
          });
        }

        // 모든 소스의 가격 정보 합치기
        const combinedPrices = [
          ...(naverResult.prices || []),
          ...(tcgshopResult.prices || []),
          ...(cardDCResult.prices || []) /* ,
        ...(onlyYugiohResult.prices || []) */,
        ];

        // 카드 정보 설정 (네이버 API 결과 우선)
        if (naverResult && naverResult.card) {
          card = naverResult.card;
        } else {
          card = { name: cardName };
        }

        // 카드 코드가 ST19-KRFC1~4인 경우 가격 정보를 보내지 않음
        if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
          return res.status(404).json({
            success: false,
            error: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.',
          });
        }

        // 검색 소스 설정
        searchSource = 'all_sources';

        // 모든 가격 정보를 합친 배열
        prices = combinedPrices;

        // 상품 제목에 "중고" 키워드가 포함된 제품도 추가 필터링
        const preFilteredPrices = prices.filter(price => {
          // 상품 제목이 있는 경우 "중고" 키워드 확인
          if (price.title && /중고|중고품|듀얼용|실듀용/i.test(price.title)) {
            return false; // 중고 상품 제외
          }
          return true;
        });

        // 번개장터 상품 필터링
        const bungaeFilteredPrices = preFilteredPrices.filter(
          price =>
            !(price.site && (price.site === 'Naver_번개장터' || price.site.includes('번개장터')))
        );

        // 중고 여부 필터링 (condition 필드 기반)
        const filteredPrices = bungaeFilteredPrices.filter(price => {
          // condition이 신품이 아닌 경우 필터링
          if (price.condition !== '신품') {
            return false;
          }
          return true;
        });

        // 판매 사이트가 "네이버"인 경우 제외
        const siteFilteredPrices = filteredPrices.filter(
          price => !price.site || price.site !== 'Naver_네이버'
        );

        // 품절 상품 제외 (available 필드가 false인 상품)
        const availableFilteredPrices = siteFilteredPrices.filter(price => {
          // available 필드가 없거나 true인 경우만 포함
          return price.available !== false;
        });

        // 카드가 아닌 상품 제외 (레어도나 언어가 '알 수 없음'인 카드의 경우에도 최저가 계산이 불가능하기 때문에 제외)
        const cardFilteredPrices = availableFilteredPrices.filter(
          price => !(price.rarity === '알 수 없음' || price.language === '알 수 없음')
        );

        if (!cardFilteredPrices || cardFilteredPrices.length === 0) {
          return res.status(404).json({
            success: false,
            error: '현재 구매 가능한 가격 정보가 없습니다.',
          });
        }

        // 모든 가격 정보에서 센터 카드 필터링
        const centerCardFilteredPrices = cardFilteredPrices.filter(
          price => !(price.cardCode && /^ST19-KRFC[1-4]$/i.test(price.cardCode))
        );

        if (!centerCardFilteredPrices || centerCardFilteredPrices.length === 0) {
          return res.status(404).json({
            success: false,
            error: '현재 구매 가능한 가격 정보가 없습니다.',
          });
        }

        // 일러스트별, 언어별, 레어도별로 가격 정보 그룹화
        const rarityPrices = {};

        // 가격들을 일러스트별, 언어별, 레어도별로 그룹화
        centerCardFilteredPrices.forEach(price => {
          const illustration = price.illustration || 'default';
          const language = price.language || '알 수 없음';
          const rarity = price.rarity || '알 수 없음';

          if (!rarityPrices[illustration]) {
            rarityPrices[illustration] = {};
          }

          if (!rarityPrices[illustration][language]) {
            rarityPrices[illustration][language] = {};
          }

          if (!rarityPrices[illustration][language][rarity]) {
            rarityPrices[illustration][language][rarity] = {
              image: null, // 레어도별 이미지 URL을 저장할 필드 추가
              prices: [],
            };
          }

          rarityPrices[illustration][language][rarity].prices.push({
            id: price.id,
            price: price.price,
            site: price.site,
            url: price.url,
            condition: price.condition,
            rarity: price.rarity,
            language: price.language,
            cardCode: price.cardCode,
            available: price.available,
            lastUpdated: price.lastUpdated,
            illustration: price.illustration || 'default',
          });
        });

        // 각 일러스트, 언어, 레어도 그룹 내에서 가격 오름차순 정렬
        Object.keys(rarityPrices).forEach(illustration => {
          Object.keys(rarityPrices[illustration]).forEach(language => {
            Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
              rarityPrices[illustration][language][rarity].prices.sort((a, b) => a.price - b.price);
            });
          });
        });

        // 이미지 URL을 레어도별로 설정
        // 1. 이미 가져온 네이버 API 결과에서 이미지 추출
        try {
          // 이미지가 필요한 레어도 확인 (null인 이미지만 업데이트)
          const needImage = Object.values(rarityPrices).some(lang =>
            Object.values(lang).some(rarity => Object.values(rarity).some(item => !item.image))
          );

          // 이미지가 필요한 경우 이미 가져온 네이버 결과에서 이미지 추출
          if (
            needImage &&
            naverResult &&
            naverResult.rawResults &&
            naverResult.rawResults.length > 0
          ) {
            // 객체로 변환하여 일러스트/언어/레어도별 이미지 찾기 최적화
            const imageMap = {};

            // 네이버 원본 검색 결과에서 이미지 데이터 추출
            naverResult.rawResults.forEach(item => {
              // 각 상품의 이미지를 일러스트/언어/레어도별로 매핑
              if (item.language && item.rarity) {
                const illustration = item.illustration || 'default';
                const key = `${illustration}:${item.language}:${item.rarity}`;

                // 상품별 이미지가 있으면 우선 사용
                if (item.image && item.image.trim() !== '') {
                  // 어나더 일러스트 상품인 경우, 더 구체적인 키워드가 포함된 이미지를 우선 사용
                  if (illustration === 'another') {
                    // 어나더 일러스트의 경우 기존 이미지를 덮어쓰기 (더 관련성 높은 이미지 찾기)
                    imageMap[key] = item.image;
                  } else if (!imageMap[key]) {
                    // 기본 일러스트는 첫 번째 이미지만 사용
                    imageMap[key] = item.image;
                  }
                }
                // 상품별 이미지가 없으면 카드 기본 이미지 사용
                else if (naverResult.card && naverResult.card.image) {
                  if (!imageMap[key]) {
                    imageMap[key] = naverResult.card.image;
                  }
                }
              }
            });

            // 레어도별 이미지 URL 설정
            Object.keys(rarityPrices).forEach(illustration => {
              Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                  // 이미 이미지가 있는 경우 건너뛰기
                  if (rarityPrices[illustration][language][rarity].image) return;

                  // 일러스트, 언어, 레어도에 맞는 이미지 찾기
                  const key = `${illustration}:${language}:${rarity}`;
                  if (imageMap[key]) {
                    rarityPrices[illustration][language][rarity].image = imageMap[key];
                  } else if (illustration === 'another') {
                    // 어나더 일러스트 전용 이미지가 없는 경우, 기본 이미지에 구별을 위한 파라미터 추가
                    if (card.image) {
                      // URL에 일러스트 타입을 구별할 수 있는 파라미터 추가
                      const urlWithParam =
                        card.image + (card.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                      rarityPrices[illustration][language][rarity].image = null;
                    }
                  } else if (card.image) {
                    // 레어도별 이미지가 없으면 카드의 기본 이미지 사용
                    rarityPrices[illustration][language][rarity].image = card.image;
                  }
                });
              });
            });
          } else {
            console.log('[DEBUG] 네이버 검색 결과가 없습니다. 기본 이미지를 사용합니다.');
          }

          // 네이버 검색 결과가 없거나 이미지가 필요하지 않은 경우 카드의 기본 이미지 사용
          if (card.image) {
            Object.keys(rarityPrices).forEach(illustration => {
              Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                  if (!rarityPrices[illustration][language][rarity].image) {
                    if (illustration === 'another') {
                      // 어나더 일러스트의 경우 URL에 파라미터 추가
                      const urlWithParam =
                        card.image + (card.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                      rarityPrices[illustration][language][rarity].image = card.image;
                    }
                  }
                });
              });
            });
          }
        } catch (imageError) {
          console.error(`[ERROR] 이미지 URL 설정 오류: ${imageError.message}`);
          // 오류가 발생해도 계속 진행하고 기본 이미지 사용
          if (card.image) {
            Object.keys(rarityPrices).forEach(illustration => {
              Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                  if (!rarityPrices[illustration][language][rarity].image) {
                    if (illustration === 'another') {
                      // 어나더 일러스트의 경우 URL에 파라미터 추가
                      const urlWithParam =
                        card.image + (card.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                      rarityPrices[illustration][language][rarity].image = card.image;
                    }
                  }
                });
              });
            });
          }
        }

        // 가격 정보를 캐시에 저장하고 ID 발급
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); //24시간 유효

        const cacheEntry = await CardPriceCache.create({
          cardName: card.name || cardName,
          image: card.image || null,
          rarityPrices,
          expiresAt,
        });

        // 이미지 URL을 레어도별로 설정 (새로 저장하는 경우)
        Object.keys(rarityPrices).forEach(illustration => {
          Object.keys(rarityPrices[illustration]).forEach(language => {
            Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
              if (!rarityPrices[illustration][language][rarity].image) {
                if (illustration === 'another') {
                  // 어나더 일러스트의 경우 URL에 파라미터 추가
                  const urlWithParam =
                    card.image + (card.image.includes('?') ? '&' : '?') + 'illust=another';
                  rarityPrices[illustration][language][rarity].image = urlWithParam;
                } else {
                  rarityPrices[illustration][language][rarity].image = card.image;
                }
              }
            });
          });
        });

        // 총 상품 개수 계산
        let productsCount = 0;
        Object.keys(rarityPrices).forEach(illustration => {
          Object.keys(rarityPrices[illustration]).forEach(language => {
            Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
              productsCount += rarityPrices[illustration][language][rarity].prices.length;
            });
          });
        });

        return res.status(200).json({
          success: true,
          source: searchSource,
          data: {
            cardId: card.id,
            cardName: card.name,
            image: card.image || null,
            totalProducts: productsCount,
          },
          rarityPrices: rarityPrices,
          cacheId: cacheEntry.id, // 캐시 ID 응답에 포함
          cacheExpiresAt: expiresAt, // 만료 시간 응답에 포함
        });
      } catch (error) {
        console.error('[ERROR] 레어도별 가격 검색 오류:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    } catch (error) {
      console.error('[ERROR] 레어도별 가격 검색 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

// 네이버 스토어에서 카드 가격 크롤링
exports.crawlNaverStorePrice = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    try {
      const { cardName } = req.query;

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      const result = await searchAndSaveCardPrices(cardName);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: '검색 결과가 없습니다.',
          card: result.card,
        });
      }

      res.status(200).json({
        success: true,
        message: `${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: result.card,
          prices: result.prices,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

// 네이버 쇼핑 API를 사용하여 카드 가격 검색
exports.searchNaverShopApi = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    try {
      const { cardName } = req.query;

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      const result = await searchAndSaveCardPricesApi(cardName);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: '검색 결과가 없습니다.',
          card: result.card,
        });
      }

      res.status(200).json({
        success: true,
        message: `${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: result.card,
          prices: result.prices,
        },
      });
    } catch (error) {
      console.error('[ERROR] 네이버 쇼핑 API 컨트롤러 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

// TCGShop에서 카드 가격 검색
exports.searchTCGShop = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    try {
      const { cardName } = req.query;

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      // 카드 ID 찾기 (이미 DB에 존재하는지 확인)
      let card = await Card.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%${cardName}%` } },
            { koName: { [Op.like]: `%${cardName}%` } },
          ],
        },
      });

      const cardId = card ? card.id : null;

      // TCGShop 크롤링 및 가격 정보 저장
      const result = await searchAndSaveTCGShopPrices(cardName, cardId);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: 'TCGShop에서 검색 결과가 없습니다.',
          card: card,
        });
      }

      res.status(200).json({
        success: true,
        message: `TCGShop에서 ${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: card,
          prices: result.prices,
        },
      });
    } catch (error) {
      console.error('[ERROR] TCGShop 검색 컨트롤러 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

// CardDC에서 카드 가격 검색
exports.searchCardDC = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    try {
      const { cardName } = req.query;

      if (!cardName) {
        return res.status(400).json({
          success: false,
          error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.',
        });
      }

      // 카드 ID 찾기 (이미 DB에 존재하는지 확인)
      let card = await Card.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%${cardName}%` } },
            { koName: { [Op.like]: `%${cardName}%` } },
          ],
        },
      });

      const cardId = card ? card.id : null;

      // CardDC 크롤링 및 가격 정보 저장
      const result = await searchAndSaveCardDCPrices(cardName, cardId);

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          message: 'CardDC에서 검색 결과가 없습니다.',
          card: card,
        });
      }

      res.status(200).json({
        success: true,
        message: `CardDC에서 ${result.count}개의 가격 정보를 찾았습니다.`,
        data: {
          card: card,
          prices: result.prices,
        },
      });
    } catch (error) {
      console.error('[ERROR] CardDC 검색 컨트롤러 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

// OnlyYugioh에서 카드 가격 검색
exports.searchOnlyYugioh = [
  cardPriceRateLimiter,
  cardRequestLimiter,
  async (req, res) => {
    /* 온리유희왕 쇼핑몰 일시적 영업 중단으로 주석 처리
  try {
    const { cardName } = req.query;

    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.' 
      });
    }
    
    // 카드 ID 찾기 (이미 DB에 존재하는지 확인)
    let card = await Card.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${cardName}%` } },
          { koName: { [Op.like]: `%${cardName}%` } }
        ]
      }
    });
    
    const cardId = card ? card.id : null;
    
    // OnlyYugioh 크롤링 및 가격 정보 저장
    const result = await searchAndSaveOnlyYugiohPrices(cardName, cardId);
    
    if (result.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'OnlyYugioh에서 검색 결과가 없습니다.', 
        card: card 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `OnlyYugioh에서 ${result.count}개의 가격 정보를 찾았습니다.`,
      data: {
        card: card,
        prices: result.prices
      }
    });
  } catch (error) {
    console.error('[ERROR] OnlyYugioh 검색 컨트롤러 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
  */

    // 온리유희왕 일시적 영업 중단으로 검색 불가 안내
    return res.status(503).json({
      success: false,
      message: '온리유희왕이 일시적으로 영업을 중단하여 검색할 수 없습니다.',
    });
  },
];

/**
 * 캐시된 카드 가격 정보 조회
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @returns {Promise<void>}
 */
exports.getCachedPrices = [
  cardSearchRateLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;

      // UUID 유효성 검사
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 캐시 ID입니다.',
        });
      }

      // 캐시 정보 조회
      const priceCache = await CardPriceCache.findByPk(id);

      if (!priceCache) {
        return res.status(404).json({
          success: false,
          message: '해당 ID의 가격 정보를 찾을 수 없습니다.',
        });
      }

      // 캐시가 만료되었는지 확인
      if (new Date() > new Date(priceCache.expiresAt)) {
        return res.status(410).json({
          success: false,
          message: '가격 정보가 만료되었습니다. 새로운 정보를 조회해주세요.',
        });
      }

      // 센터 카드 체크
      if (/^ST19-KRFC[1-4]$/i.test(priceCache.cardName)) {
        return res.status(404).json({
          success: false,
          message: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.',
        });
      }

      // 응답 반환
      return res.json({
        success: true,
        data: {
          cardName: priceCache.cardName,
          image: priceCache.image,
          totalProducts: calculateTotalProducts(priceCache.rarityPrices),
        },
        rarityPrices: priceCache.rarityPrices,
        cacheId: priceCache.id,
        cacheExpiresAt: priceCache.expiresAt,
      });
    } catch (error) {
      console.error('캐시된 가격 정보 조회 중 오류 발생:', error);
      return res.status(500).json({
        success: false,
        message: '가격 정보 조회 중 오류가 발생했습니다.',
        error: error.message,
      });
    }
  },
];

/**
 * 레어도별 가격 정보에서 총 상품 개수 계산
 * @param {Object} rarityPrices - 레어도별 가격 정보
 * @returns {number} 총 상품 개수
 */
function calculateTotalProducts(rarityPrices) {
  let productCount = 0;

  // rarityPrices가 문자열이면 JSON으로 파싱
  const prices = typeof rarityPrices === 'string' ? JSON.parse(rarityPrices) : rarityPrices;

  if (!prices || Object.keys(prices).length === 0) return 0;

  // illustration -> language -> rarity -> {image, prices} 구조로 처리
  Object.keys(prices).forEach(illustration => {
    Object.keys(prices[illustration] || {}).forEach(language => {
      Object.keys(prices[illustration][language] || {}).forEach(rarity => {
        if (
          prices[illustration][language][rarity] &&
          prices[illustration][language][rarity].prices
        ) {
          productCount += prices[illustration][language][rarity].prices.length;
        }
      });
    });
  });

  return productCount;
}

/**
 * 여러 카드의 최적 구매 조합 계산
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @returns {Promise<void>}
 */
exports.getOptimalPurchaseCombination = [
  optimalPurchaseRateLimiter,
  async (req, res) => {
    try {
      const {
        cards,
        excludedProductIds = [],
        excludedStores = [],
        takeout = [],
        ...purchaseOptions
      } = req.body;

      // 입력 데이터 유효성 검사
      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({
          error: 'Invalid input: cards array is required and must not be empty',
        });
      }

      // 센터 카드 필터링
      const filteredCards = cards.filter(card => {
        // cardCode 필드로 센터 카드 확인
        if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
          console.log(`[INFO] 센터 카드(${card.cardCode}) "${card.name || card.cardName}" 제외됨`);
          return false;
        }

        // 카드 이름으로 확인 (코드가 없는 경우)
        if (
          (card.name && /^ST19-KRFC[1-4]$/i.test(card.name)) ||
          (card.cardName && /^ST19-KRFC[1-4]$/i.test(card.cardName))
        ) {
          console.log(`[INFO] 센터 카드 "${card.name || card.cardName}" 제외됨`);
          return false;
        }

        return true;
      });

      if (filteredCards.length === 0) {
        return res.status(400).json({
          success: false,
          error: '유효한 카드 정보가 없습니다. 센터 카드가 아닌 카드를 선택해주세요.',
        });
      }

      // cacheId를 사용해 rarityPrices를 조회하고 카드 데이터 보강
      const enhancedCards = await Promise.all(
        filteredCards.map(async card => {
          // 이미 rarityPrices가 있으면 그대로 사용
          if (card.rarityPrices) {
            return card;
          }

          // cacheId가 있으면 캐시에서 데이터 조회
          if (card.cacheId) {
            try {
              const priceCache = await CardPriceCache.findByPk(card.cacheId);

              if (priceCache && new Date() <= new Date(priceCache.expiresAt)) {
                // 캐시된 데이터 설정
                return {
                  ...card,
                  cardName: card.cardName || card.name || priceCache.cardName,
                  rarityPrices: priceCache.rarityPrices,
                  image: card.image || priceCache.image,
                };
              } else if (priceCache) {
                console.log(
                  `[WARN] "${card.name || card.cardName}" 카드의 캐시 데이터가 만료되었습니다. 새로 조회합니다.`
                );

                // 캐시가 만료된 경우 새로 조회
                const cardName = card.cardName || card.name || priceCache.cardName;
                try {
                  // 모든 소스에서 병렬로 검색 (Promise.all 사용)
                  const [naverResult, tcgshopResult, cardDCResult /* , onlyYugiohResult */] =
                    await Promise.all([
                      // 네이버 쇼핑 API 검색
                      searchAndSaveCardPricesApi(cardName).catch(error => {
                        console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
                        return { count: 0, prices: [], rawResults: [] };
                      }),

                      // TCGShop 검색
                      searchAndSaveTCGShopPrices(cardName, null).catch(error => {
                        console.error(`[ERROR] TCGShop 검색 오류: ${error.message}`);
                        return { count: 0, prices: [] };
                      }),

                      // CardDC 검색
                      searchAndSaveCardDCPrices(cardName, null).catch(error => {
                        console.error(`[ERROR] CardDC 검색 오류: ${error.message}`);
                        return { count: 0, prices: [] };
                      }),

                      // OnlyYugioh 검색 - 일시적 영업 중단으로 주석 처리
                      /* searchAndSaveOnlyYugiohPrices(cardName, null).catch(error => {
                  console.error(`[ERROR] OnlyYugioh 검색 오류: ${error.message}`);
                  return { count: 0, prices: [] };
                }) */
                    ]);
                  // 결과가 하나라도 있는지 확인
                  const hasResults =
                    (naverResult && naverResult.count > 0) ||
                    (tcgshopResult && tcgshopResult.count > 0) ||
                    (cardDCResult && cardDCResult.count > 0); /* || 
                (onlyYugiohResult && onlyYugiohResult.count > 0) */

                  if (!hasResults) {
                    console.log(`[WARN] "${cardName}" 카드 검색 결과가 없습니다.`);
                    return card;
                  }

                  // 모든 소스의 가격 정보 합치기
                  const combinedPrices = [
                    ...(naverResult.prices || []),
                    ...(tcgshopResult.prices || []),
                    ...(cardDCResult.prices || []) /* ,
                ...(onlyYugiohResult.prices || []) */,
                  ];

                  // 카드 정보 설정 (네이버 API 결과 우선)
                  let newCard = null;
                  if (naverResult && naverResult.card) {
                    newCard = naverResult.card;
                  } else {
                    newCard = { name: cardName };
                  }

                  // 현재 이미지 보존
                  if (card.image) {
                    newCard.image = card.image;
                  }

                  // 필터링 및 분류 로직 (getPricesByRarity 함수에서 가져옴)
                  const filteredPrices = combinedPrices.filter(
                    price =>
                      // 중고 상품 제외
                      !(price.title && /중고|중고품|듀얼용|실듀용/i.test(price.title)) &&
                      // 번개장터 상품 제외
                      !(
                        price.site &&
                        (price.site === 'Naver_번개장터' || price.site.includes('번개장터'))
                      ) &&
                      // 신품만 포함
                      price.condition === '신품' &&
                      // 네이버 제외
                      !(!price.site || price.site === 'Naver_네이버') &&
                      // 품절 상품 제외
                      price.available !== false &&
                      // 카드가 아닌 상품 제외
                      !(price.rarity === '알 수 없음' || price.language === '알 수 없음') &&
                      // 센터 카드 제외
                      !(price.cardCode && /^ST19-KRFC[1-4]$/i.test(price.cardCode))
                  );

                  if (!filteredPrices || filteredPrices.length === 0) {
                    console.log(
                      `[WARN] "${cardName}" 카드의 필터링 후 구매 가능한 가격 정보가 없습니다.`
                    );
                    return card;
                  }

                  // 일러스트별, 언어별, 레어도별로 가격 정보 그룹화
                  const rarityPrices = {};

                  filteredPrices.forEach(price => {
                    const illustration = price.illustration || 'default';
                    const language = price.language || '알 수 없음';
                    const rarity = price.rarity || '알 수 없음';

                    if (!rarityPrices[illustration]) {
                      rarityPrices[illustration] = {};
                    }

                    if (!rarityPrices[illustration][language]) {
                      rarityPrices[illustration][language] = {};
                    }

                    if (!rarityPrices[illustration][language][rarity]) {
                      rarityPrices[illustration][language][rarity] = {
                        image: null,
                        prices: [],
                      };
                    }

                    rarityPrices[illustration][language][rarity].prices.push({
                      id: price.id,
                      price: price.price,
                      site: price.site,
                      url: price.url,
                      condition: price.condition,
                      rarity: price.rarity,
                      language: price.language,
                      cardCode: price.cardCode,
                      available: price.available,
                      lastUpdated: price.lastUpdated,
                      illustration: price.illustration || 'default',
                    });
                  });

                  // 각 일러스트, 언어, 레어도 그룹 내에서 가격 오름차순 정렬
                  Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration]).forEach(language => {
                      Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                        rarityPrices[illustration][language][rarity].prices.sort(
                          (a, b) => a.price - b.price
                        );
                      });
                    });
                  });

                  // 이미지 설정 (어나더 일러스트의 경우 URL 파라미터 추가)
                  Object.keys(rarityPrices).forEach(illustration => {
                    Object.keys(rarityPrices[illustration]).forEach(language => {
                      Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                        if (!rarityPrices[illustration][language][rarity].image && newCard.image) {
                          if (illustration === 'another') {
                            // 어나더 일러스트의 경우 URL에 파라미터 추가
                            const urlWithParam =
                              newCard.image +
                              (newCard.image.includes('?') ? '&' : '?') +
                              'illust=another';
                            rarityPrices[illustration][language][rarity].image = urlWithParam;
                          } else {
                            rarityPrices[illustration][language][rarity].image = newCard.image;
                          }
                        }
                      });
                    });
                  });

                  // 새 캐시 항목 생성 및 저장
                  const expiresAt = new Date();
                  expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 유효

                  try {
                    // 기존의 만료된 캐시 항목이 있으면 업데이트
                    if (priceCache) {
                      await priceCache.update({
                        cardName: newCard.name || cardName,
                        image: newCard.image || null,
                        rarityPrices,
                        expiresAt,
                      });
                      console.log(
                        `[INFO] "${cardName}" 카드의 기존 캐시(${priceCache.id})를 새 데이터로 업데이트했습니다.`
                      );

                      // 새 데이터 반환 (기존 캐시 ID 유지)
                      return {
                        ...card,
                        cardName: newCard.name || cardName,
                        rarityPrices,
                        image: newCard.image || null,
                        cacheId: priceCache.id,
                      };
                    } else {
                      // 새 캐시 항목 생성
                      const cacheEntry = await CardPriceCache.create({
                        cardName: newCard.name || cardName,
                        image: newCard.image || null,
                        rarityPrices,
                        expiresAt,
                      });

                      console.log(
                        `[INFO] "${cardName}" 카드의 가격 정보를 새로 조회하여 캐시에 저장했습니다. cacheId: ${cacheEntry.id}`
                      );

                      // 새 데이터 반환
                      return {
                        ...card,
                        cardName: newCard.name || cardName,
                        rarityPrices,
                        image: newCard.image || null,
                        cacheId: cacheEntry.id,
                      };
                    }
                  } catch (cacheError) {
                    console.error(
                      `[ERROR] "${cardName}" 카드의 캐시 업데이트 중 오류 발생: ${cacheError.message}`
                    );
                    // 캐시 저장 실패시에도 데이터는 반환
                    return {
                      ...card,
                      cardName: newCard.name || cardName,
                      rarityPrices,
                      image: newCard.image || null,
                    };
                  }
                } catch (error) {
                  console.error(
                    `[ERROR] "${cardName}" 카드의 가격 정보 새로 조회 중 오류 발생: ${error.message}`
                  );
                  // 오류 발생 시 기존 카드 정보 반환
                  return card;
                }
              }
            } catch (error) {
              console.error(`[ERROR] 캐시 데이터 조회 중 오류 발생: ${error.message}`);
            }
          }

          return card;
        })
      );

      // 카드 데이터 구조 검증 및 변환
      const processedCards = enhancedCards
        .map(card => {
          // 핵심 필드 누락 여부 확인
          if (!card.cardName && !card.name) {
            console.log('[WARN] 카드 이름이 없는 카드 항목이 발견되었습니다:', card);
            return null;
          }

          // cardName 필드 보장 (name을 cardName으로 변환)
          if (!card.cardName && card.name) {
            card.cardName = card.name;
          }

          // 일러스트 타입을 포함한 고유 식별자 생성
          const illustrationType = card.illustrationType || 'default';
          const uniqueCardKey = `${card.cardName}_${illustrationType}_${card.language || 'any'}_${card.rarity || 'any'}`;
          card.uniqueCardKey = uniqueCardKey;

          // products 필드 처리 (캐시 형식 변환)
          if (!card.products && card.rarityPrices) {
            // rarityPrices가 문자열인 경우 파싱
            const prices =
              typeof card.rarityPrices === 'string'
                ? JSON.parse(card.rarityPrices)
                : card.rarityPrices;

            // 이미지 정보 확인 및 설정
            if (!card.image) {
              // 지정된 일러스트, 언어, 레어도에 맞는 이미지 찾기
              const illustrationType = card.illustrationType || 'default';
              if (
                card.language &&
                card.rarity &&
                prices[illustrationType] &&
                prices[illustrationType][card.language] &&
                prices[illustrationType][card.language][card.rarity] &&
                prices[illustrationType][card.language][card.rarity].image
              ) {
                card.image = prices[illustrationType][card.language][card.rarity].image;
              }
              // 지정된 일러스트, 언어, 레어도 조합이 정확히 없으면 대안 이미지 찾기
              else if (card.language && card.rarity) {
                // 해당 언어와 레어도가 있는 다른 일러스트에서 이미지 찾기
                let foundImage = false;
                for (const illustration of Object.keys(prices)) {
                  if (foundImage) break;
                  if (
                    prices[illustration] &&
                    prices[illustration][card.language] &&
                    prices[illustration][card.language][card.rarity] &&
                    prices[illustration][card.language][card.rarity].image
                  ) {
                    card.image = prices[illustration][card.language][card.rarity].image;
                    foundImage = true;
                    break;
                  }
                }

                // 여전히 이미지가 없으면 같은 레어도의 다른 언어 이미지 찾기
                if (!foundImage) {
                  for (const illustration of Object.keys(prices)) {
                    if (foundImage) break;
                    for (const language of Object.keys(prices[illustration] || {})) {
                      if (foundImage) break;
                      if (
                        prices[illustration][language] &&
                        prices[illustration][language][card.rarity] &&
                        prices[illustration][language][card.rarity].image
                      ) {
                        card.image = prices[illustration][language][card.rarity].image;
                        foundImage = true;
                        break;
                      }
                    }
                  }
                }

                // 그래도 이미지가 없으면 임의의 이미지 사용
                if (!foundImage) {
                  for (const illustration of Object.keys(prices)) {
                    if (foundImage) break;
                    for (const language of Object.keys(prices[illustration] || {})) {
                      if (foundImage) break;
                      for (const rarity of Object.keys(prices[illustration][language] || {})) {
                        if (prices[illustration][language][rarity].image) {
                          card.image = prices[illustration][language][rarity].image;
                          foundImage = true;
                          break;
                        }
                      }
                    }
                  }
                }
              }
              // 부분적으로만 지정된 경우 해당 조건에 맞는 첫 번째 이미지 사용
              else {
                // 첫 번째 일러스트, 언어, 레어도 조합에서 이미지 찾기
                let foundImage = false;
                for (const illustration of Object.keys(prices)) {
                  if (foundImage) break;
                  for (const language of Object.keys(prices[illustration] || {})) {
                    if (foundImage) break;
                    for (const rarity of Object.keys(prices[illustration][language] || {})) {
                      if (prices[illustration][language][rarity].image) {
                        card.image = prices[illustration][language][rarity].image;
                        foundImage = true;
                        break;
                      }
                    }
                  }
                }
              }
            }

            // 지정된 일러스트, 언어, 레어도가 있는 경우
            if (
              card.language &&
              card.rarity &&
              prices[illustrationType] &&
              prices[illustrationType][card.language] &&
              prices[illustrationType][card.language][card.rarity]
            ) {
              card.products = prices[illustrationType][card.language][card.rarity].prices;
              console.log(
                `[DEBUG] "${card.cardName}" 카드 상품 설정: 일러스트=${illustrationType}, 언어=${card.language}, 레어도=${card.rarity}, 상품수=${card.products.length}`
              );
            }
            // 지정된 일러스트, 언어, 레어도 조합이 없는 경우 빈 배열 반환
            else if (card.language && card.rarity) {
              console.log(
                `[WARN] "${card.cardName}" 카드의 일러스트: ${illustrationType}, 언어: ${card.language}, 레어도: ${card.rarity} 조합을 찾을 수 없습니다.`
              );
              card.products = [];
            }
            // 지정된 레어도만 있는 경우 (언어는 지정되지 않음)
            else if (card.rarity) {
              // 지정된 일러스트에서만 해당 레어도 상품 통합
              card.products = [];
              if (prices[illustrationType]) {
                Object.keys(prices[illustrationType] || {}).forEach(language => {
                  if (
                    prices[illustrationType][language] &&
                    prices[illustrationType][language][card.rarity]
                  ) {
                    card.products = [
                      ...card.products,
                      ...prices[illustrationType][language][card.rarity].prices,
                    ];
                  }
                });
              }
            }
            // 지정된 언어만 있는 경우 (레어도는 지정되지 않음)
            else if (card.language) {
              // 지정된 일러스트에서만 해당 언어의 모든 레어도 상품 통합
              card.products = [];
              if (prices[illustrationType] && prices[illustrationType][card.language]) {
                Object.keys(prices[illustrationType][card.language]).forEach(rarity => {
                  card.products = [
                    ...card.products,
                    ...prices[illustrationType][card.language][rarity].prices,
                  ];
                });
              }
            }
            // 모든 상품 통합 (일러스트, 언어, 레어도 모두 지정되지 않음)
            else {
              card.products = [];
              Object.keys(prices).forEach(illustration => {
                Object.keys(prices[illustration] || {}).forEach(language => {
                  Object.keys(prices[illustration][language] || {}).forEach(rarity => {
                    card.products = [
                      ...card.products,
                      ...prices[illustration][language][rarity].prices,
                    ];
                  });
                });
              });
            }
          } else if (!card.products) {
            console.log(
              `[ERROR] "${card.cardName}" 카드에 product 정보가 없으며 rarityPrices도 없습니다. 레어도와 언어를 선택했는지 확인이 필요합니다.`
            );
            return null;
          }

          // 각 상품에 대해 product 객체에 id 필드가 있는지 확인하고 없으면 추가
          if (card.products && card.products.length > 0) {
            card.products = card.products.map(product => {
              // product 객체가 없는 경우 새로 생성
              if (!product.product) {
                // URL에서 TCGShop의 goodsIdx 추출 시도
                let productId = null;
                if (
                  product.url &&
                  product.url.includes('tcgshop.co.kr') &&
                  product.url.includes('goodsIdx=')
                ) {
                  const match = product.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                product.product = {
                  id: (
                    product.id ||
                    product.productId ||
                    productId ||
                    `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                  ).toString(),
                  url: product.url,
                  site: product.site,
                  price: product.price,
                  available: product.available,
                  cardCode: product.cardCode,
                  condition: product.condition,
                  language: product.language,
                  rarity: product.rarity,
                  illustration: product.illustration || 'default',
                };
              }
              // product 객체가 있지만 id가 없는 경우
              else if (product.product && !product.product.id) {
                // URL에서 TCGShop의 goodsIdx 추출 시도
                let productId = null;
                if (
                  product.product.url &&
                  product.product.url.includes('tcgshop.co.kr') &&
                  product.product.url.includes('goodsIdx=')
                ) {
                  const match = product.product.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                product.product.id = (
                  product.id ||
                  product.productId ||
                  productId ||
                  `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                ).toString();
              }
              // id가 숫자인 경우 문자열로 변환
              else if (
                product.product &&
                product.product.id &&
                typeof product.product.id === 'number'
              ) {
                product.product.id = product.product.id.toString();
              }
              return product;
            });
          }

          return card;
        })
        .filter(card => card !== null && card.products && card.products.length > 0);

      // 디버깅: 처리된 카드 정보 확인
      processedCards.forEach(card => {
        console.log(
          `[DEBUG] 처리된 카드: ${card.cardName}, uniqueKey=${card.uniqueCardKey}, 레어도=${card.rarity}, 언어=${card.language}, 일러스트=${card.illustrationType || 'default'}, 상품수=${card.products.length}`
        );
        // 첫 번째 상품의 레어도 확인
        if (card.products.length > 0) {
          const firstProduct = card.products[0];
          console.log(
            `  첫 번째 상품: 레어도=${firstProduct.rarity}, 가격=${firstProduct.price}, 사이트=${firstProduct.site}`
          );
        }
      });

      // 유효한 카드가 없는 경우
      if (processedCards.length === 0) {
        return res.status(400).json({
          success: false,
          error: '유효한 카드 정보가 없습니다. 레어도와 언어를 선택했는지 확인해주세요.',
        });
      }

      // 제외할 상품 ID와 상점 기반으로 필터링 적용
      const filteredCardsData = processedCards
        .map(card => {
          // 제외 목록을 기반으로 상품 필터링
          const beforeFilterCount = card.products.length;

          const filteredProducts = card.products.filter(product => {
            // 상품 ID 확인 (product.product.id 또는 product.id)
            const productId =
              product.product && product.product.id
                ? String(product.product.id)
                : product.id
                  ? String(product.id)
                  : null;

            // 제외할 상품인지 확인
            let isExcluded = false;

            if (productId) {
              for (const excludedId of excludedProductIds) {
                if (String(excludedId) === productId) {
                  isExcluded = true;
                  break;
                }
              }
            }

            // 사이트 제외 확인
            const siteToCheck = product.site || (product.product && product.product.site);
            const isSiteExcluded = siteToCheck && excludedStores.includes(siteToCheck);

            // 마켓플레이스 제외 확인 (쿠팡, G마켓 등)
            let isMarketplaceExcluded = false;
            if (siteToCheck) {
              // 'Naver_' 접두사가 있는 경우 제거하여 판매자 이름만 추출
              let sellerName = siteToCheck;
              if (sellerName.startsWith('Naver_')) {
                sellerName = sellerName.substring(6);
              }
              isMarketplaceExcluded = shouldSkipMarketplace(sellerName);
            }

            // 제외되지 않은 상품만 통과
            return !isExcluded && !isSiteExcluded && !isMarketplaceExcluded;
          });

          const afterFilterCount = filteredProducts.length;
          if (beforeFilterCount !== afterFilterCount) {
            console.log(
              `[INFO] "${card.cardName}" 카드: ${beforeFilterCount - afterFilterCount}개 상품이 제외 목록에 따라 필터링됨`
            );
          }

          return {
            ...card,
            products: filteredProducts,
          };
        })
        .filter(card => card.products.length > 0);

      // 필터링 후 유효한 카드가 없는 경우
      if (filteredCardsData.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            '모든 카드의 상품이 제외 목록에 의해 필터링되었습니다. 제외 목록을 다시 확인해주세요.',
        });
      }

      // 필터링으로 제외된 카드가 있는 경우 로그
      if (filteredCardsData.length < processedCards.length) {
        console.log(
          `[WARN] 제외 목록에 의해 ${processedCards.length - filteredCardsData.length}개 카드가 완전히 제외됨`
        );
      }

      // 기본 옵션 설정 - 고정값 사용
      const options = {
        maxSellersPerCard: 30,
        maxIterations: 50,
        shippingRegion: purchaseOptions.shippingRegion,
        takeout: takeout, // 방문수령 옵션 추가
        pointsOptions: {
          tcgshop: purchaseOptions.tcgshopPoints || false, // 티씨지샵 기본 적립금 (10%)
          carddc: purchaseOptions.carddcPoints || false, // 카드디씨 기본 적립금 (10%)
          naverBasic: purchaseOptions.naverBasicPoints || false, // 네이버 기본 적립금 (2.5%, 리뷰 적립금 포함)
          naverBankbook: purchaseOptions.naverBankbookPoints || false, // 네이버 제휴통장 적립금 (0.5%)
          naverMembership: purchaseOptions.naverMembershipPoints || false, // 네이버 멤버십 적립금 (4%)
          naverHyundaiCard: purchaseOptions.naverHyundaiCardPoints || false, // 네이버 현대카드 적립금 (7%)
        },
      };

      console.log('계산 옵션:', {
        maxSellersPerCard: options.maxSellersPerCard,
        maxIterations: options.maxIterations,
        shippingRegion: options.shippingRegion,
        pointsOptions: options.pointsOptions,
      });

      // 최적 구매 조합 찾기 - 필터링된 카드 배열 사용
      const result = findOptimalPurchaseCombination(filteredCardsData, {
        ...options,
        excludedProductIds, // 옵션에 excludedProductIds 추가
        excludedStores, // 옵션에 excludedStores 추가
      });

      // 제외 필터 정보가 이미 optimizedPurchase 모듈에서 추가되지만,
      // 여기서도 명시적으로 설정 (호환성 유지)
      if (!result.excludedFilters) {
        result.excludedFilters = {
          excludedProductIds,
          excludedStores,
        };
      }

      // 모든 판매처에 product.id가 있는지 확인하고 없으면 추가
      const processSellerDetails = sellerDetails => {
        if (!sellerDetails) return sellerDetails;

        Object.entries(sellerDetails).forEach(([, details]) => {
          if (details && details.cards && Array.isArray(details.cards)) {
            details.cards = details.cards.map(card => {
              // product 객체가 없으면 새로 생성
              if (!card.product) {
                // URL에서 TCGShop의 goodsIdx 추출 시도
                let productId = null;
                if (
                  card.url &&
                  card.url.includes('tcgshop.co.kr') &&
                  card.url.includes('goodsIdx=')
                ) {
                  const match = card.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                card.product = {
                  id: (
                    card.id ||
                    card.productId ||
                    productId ||
                    `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                  ).toString(),
                  url: card.url,
                  site: card.site,
                  price: card.price,
                  available: card.available,
                  cardCode: card.cardCode,
                  condition: card.condition,
                  language: card.language,
                  rarity: card.rarity,
                  illustration: card.illustration || 'default',
                };
              }
              // product 객체가 있지만 id가 없는 경우
              else if (card.product && !card.product.id) {
                // URL에서 TCGShop의 goodsIdx 추출 시도
                let productId = null;
                if (
                  card.product.url &&
                  card.product.url.includes('tcgshop.co.kr') &&
                  card.product.url.includes('goodsIdx=')
                ) {
                  const match = card.product.url.match(/goodsIdx=(\d+)/);
                  if (match && match[1]) {
                    productId = match[1];
                  }
                }

                card.product.id = (
                  card.id ||
                  card.productId ||
                  productId ||
                  `generated-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                ).toString();
              }
              // id가 숫자인 경우 문자열로 변환
              else if (card.product && card.product.id && typeof card.product.id === 'number') {
                card.product.id = card.product.id.toString();
              }
              return card;
            });
          }
        });
        return sellerDetails;
      };

      // 결과의 최적 판매처 정보에서 product.id 확인 및 추가
      if (result.optimalSellers) {
        result.optimalSellers = processSellerDetails(result.optimalSellers);
      }

      // 결과의 대안 판매처 정보에서 product.id 확인 및 추가
      if (result.alternativeSellers) {
        result.alternativeSellers = processSellerDetails(result.alternativeSellers);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('최적 구매 조합 찾기 오류:', error);
      return res.status(500).json({ error: '최적 구매 조합을 계산하는 중 오류가 발생했습니다.' });
    }
  },
];

module.exports = {
  getAllCards: exports.getAllCards,
  getPricesByRarity: exports.getPricesByRarity,
  crawlNaverStorePrice: exports.crawlNaverStorePrice,
  searchNaverShopApi: exports.searchNaverShopApi,
  searchTCGShop: exports.searchTCGShop,
  searchCardDC: exports.searchCardDC,
  // searchOnlyYugioh: exports.searchOnlyYugioh, // 온리유희왕 일시적 영업 중단으로 주석 처리
  getOptimalPurchaseCombination: exports.getOptimalPurchaseCombination,
  getCachedPrices: exports.getCachedPrices,
};
