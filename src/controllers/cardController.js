const { Card } = require('../models/Card');
const { Op } = require('sequelize');
const { searchAndSaveCardPricesApi } = require('../utils/naverShopApi');
const { searchAndSaveTCGShopPrices } = require('../utils/tcgshopCrawler');
const { searchAndSaveCardDCPrices } = require('../utils/cardDCCrawler');
const { findOptimalPurchaseCombination } = require('../utils/optimizedPurchase/index');
const { shouldSkipMarketplace } = require('../utils/shippingInfo');
const CardPriceCache = require('../models/CardPriceCache');
const rateLimit = require('express-rate-limit');
const { cardRequestLimiter } = require('../utils/rateLimiter');
const { parseCondition } = require('../utils/crawler');

async function searchCardPricesFromAllSources(cardName, gameType = 'yugioh') {
  let existingCard = await Card.findOne({
    where: {
      name: { [Op.like]: `%${cardName}%` },
      gameType: gameType,
      expiresAt: { [Op.gt]: new Date() }
    }
  });
  const cardId = existingCard ? existingCard.id : null;

  const [naverResult, tcgshopResult, cardDCResult] = await Promise.all([
    searchAndSaveCardPricesApi(cardName, { gameType }).catch(error => {
      console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
      return { count: 0, prices: [], rawResults: [] };
    }),

    searchAndSaveTCGShopPrices(cardName, cardId, gameType).catch(error => {
      console.error(`[ERROR] TCGShop 검색 오류: ${error.message}`);
      return { count: 0, prices: [] };
    }),

    searchAndSaveCardDCPrices(cardName, cardId, gameType).catch(error => {
      console.error(`[ERROR] CardDC 검색 오류: ${error.message}`);
      return { count: 0, prices: [] };
    }),
  ]);

  const hasResults =
    (naverResult && naverResult.count > 0) ||
    (tcgshopResult && tcgshopResult.count > 0) ||
    (cardDCResult && cardDCResult.count > 0);

  if (!hasResults) {
    return null;
  }

  const combinedPrices = [
    ...(naverResult.prices || []),
    ...(tcgshopResult.prices || []),
    ...(cardDCResult.prices || []),
  ];

  // 카드 대표 정보 설정 (네이버 API 결과 우선)
  let cardInfo = null;
  if (naverResult && naverResult.card) {
    cardInfo = naverResult.card;
  } else {
    cardInfo = { name: cardName };
  }

  return {
    card: cardInfo,
    prices: combinedPrices,
    naverResult,
  };
}

async function getOrCreateCardPriceData(cardName, cacheId = null, gameType = 'yugioh') {
      // 센터 카드인지 확인 (ST19-KRFC1~4)
      // 추후 센터 카드 추가 발매 시 예외 처리 해줘야함
      if (/^ST19-KRFC[1-4]$/i.test(cardName)) {
    throw new Error('센터 카드는 가격 정보를 제공하지 않습니다.');
  }

  let cachedResult = null;

  if (cacheId) {
    cachedResult = await CardPriceCache.findByPk(cacheId);
    if (cachedResult && cachedResult.gameType !== gameType) {
      console.log(`[WARN] "${cardName}" 카드의 캐시 데이터(${cacheId})의 게임 타입(${cachedResult.gameType})이 요청된 게임 타입(${gameType})과 일치하지 않습니다.`);
      cachedResult = null;
    } else if (cachedResult && new Date() > new Date(cachedResult.expiresAt)) {
      console.log(`[WARN] "${cardName}" 카드의 캐시 데이터(${cacheId})가 만료되었습니다.`);
      cachedResult = null;
    }
  } else {
    cachedResult = await CardPriceCache.findOne({
        where: {
          cardName: cardName,
          gameType: gameType,
          expiresAt: { [Op.gt]: new Date() },
        },
      });
  }

      if (cachedResult) {
    console.log(`[DEBUG] 캐시에서 "${cardName}" 검색 결과 발견`);

        try {
          let rarityPrices;
          try {
            rarityPrices = JSON.parse(cachedResult.rarityPrices);
          } catch (error) {
            rarityPrices = cachedResult.rarityPrices;
          }

          // 품절된 상품 필터링 (available 필드가 false인 아이템 제외)
          let totalProducts = 0;
      Object.keys(rarityPrices).forEach(illustration => {
        Object.keys(rarityPrices[illustration] || {}).forEach(language => {
          Object.keys(rarityPrices[illustration][language] || {}).forEach(rarity => {
            if (
              rarityPrices[illustration][language][rarity] &&
              rarityPrices[illustration][language][rarity].prices
            ) {
              rarityPrices[illustration][language][rarity].prices =
                rarityPrices[illustration][language][rarity].prices.filter(
                      price => price.available !== false
                    );
              totalProducts += rarityPrices[illustration][language][rarity].prices.length;
                }
              });
            });
          });

      Object.keys(rarityPrices).forEach(illustration => {
        Object.keys(rarityPrices[illustration] || {}).forEach(language => {
          Object.keys(rarityPrices[illustration][language] || {}).forEach(rarity => {
            if (
              rarityPrices[illustration][language][rarity] &&
              rarityPrices[illustration][language][rarity].prices &&
              rarityPrices[illustration][language][rarity].prices.length === 0
            ) {
              delete rarityPrices[illustration][language][rarity];
                }
              });

          if (Object.keys(rarityPrices[illustration][language] || {}).length === 0) {
            delete rarityPrices[illustration][language];
              }
            });

        if (Object.keys(rarityPrices[illustration] || {}).length === 0) {
          delete rarityPrices[illustration];
            }
          });

            // 정규화 후 데이터가 없는 경우 캐시 무효화
      if (Object.keys(rarityPrices).length === 0) {
            await cachedResult.update({
              expiresAt: new Date(Date.now() - 1000), // 현재 시간보다 이전으로 설정하여 만료 처리
            });
        cachedResult = null;
      } else {
        return {
          source: 'cache',
          card: {
            name: cachedResult.cardName,
            image: cachedResult.image,
          },
          rarityPrices,
          totalProducts,
          cacheId: cachedResult.id,
          cacheExpiresAt: cachedResult.expiresAt,
        };
      }
        } catch (error) {
          console.error(`[ERROR] 캐시 데이터 정규화 중 오류 발생: ${error.message}`);
          console.error(error.stack);

          await cachedResult.update({
        expiresAt: new Date(Date.now() - 1000),
          });
      cachedResult = null;
        }
      }

        const searchResult = await searchCardPricesFromAllSources(cardName, gameType);

        if (!searchResult) {
    throw new Error('카드를 찾을 수 없습니다. 모든 소스에서 검색 결과가 없습니다.');
        }

        const { card: searchCard, prices: combinedPrices, naverResult } = searchResult;

  if (searchCard.cardCode && /^ST19-KRFC[1-4]$/i.test(searchCard.cardCode)) {
    throw new Error('센터 카드는 가격 정보를 제공하지 않습니다.');
  }

  const filteredPrices = combinedPrices.filter(price => {
    if (price.title && parseCondition(price.title) === '중고') return false;
    
    if (price.site && (price.site === 'Naver_번개장터' || price.site.includes('번개장터'))) return false;
    
    if (price.condition && price.condition !== '신품') return false;
    
    if (price.site === 'Naver_네이버') return false;
    
    if (price.available === false) return false;
    
    if (!price.rarity || price.rarity === '알 수 없음' || !price.language || price.language === '알 수 없음') return false;
    
    if (price.cardCode && /^ST19-KRFC[1-4]$/i.test(price.cardCode)) return false;
    
    return true;
  });

  if (!filteredPrices || filteredPrices.length === 0) {
    throw new Error('현재 구매 가능한 가격 정보가 없습니다.');
  }

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
              rarityPrices[illustration][language][rarity].prices.sort((a, b) => a.price - b.price);
            });
          });
        });

        try {
          const needImage = Object.values(rarityPrices).some(lang =>
            Object.values(lang).some(rarity => Object.values(rarity).some(item => !item.image))
          );

    if (needImage && naverResult && naverResult.rawResults && naverResult.rawResults.length > 0) {
            const imageMap = {};

            naverResult.rawResults.forEach(item => {
              if (item.language && item.rarity) {
                const illustration = item.illustration || 'default';
                const key = `${illustration}:${item.language}:${item.rarity}`;

                if (item.image && item.image.trim() !== '') {
                  if (illustration === 'another') {
                    imageMap[key] = item.image;
                  } else if (!imageMap[key]) {
                    imageMap[key] = item.image;
                  }
          } else if (naverResult.card && naverResult.card.image) {
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
                  if (rarityPrices[illustration][language][rarity].image) return;

                  const key = `${illustration}:${language}:${rarity}`;
                  if (imageMap[key]) {
                    rarityPrices[illustration][language][rarity].image = imageMap[key];
                  } else if (illustration === 'another') {
              if (searchCard.image) {
                      const urlWithParam =
                  searchCard.image + (searchCard.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                      rarityPrices[illustration][language][rarity].image = null;
                    }
            } else if (searchCard.image) {
              rarityPrices[illustration][language][rarity].image = searchCard.image;
                  }
                });
              });
            });
          }

    if (searchCard.image) {
            Object.keys(rarityPrices).forEach(illustration => {
              Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                  if (!rarityPrices[illustration][language][rarity].image) {
                    if (illustration === 'another') {
                      const urlWithParam =
                  searchCard.image + (searchCard.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                rarityPrices[illustration][language][rarity].image = searchCard.image;
                    }
                  }
                });
              });
            });
          }
        } catch (imageError) {
          console.error(`[ERROR] 이미지 URL 설정 오류: ${imageError.message}`);
    if (searchCard.image) {
            Object.keys(rarityPrices).forEach(illustration => {
              Object.keys(rarityPrices[illustration]).forEach(language => {
                Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
                  if (!rarityPrices[illustration][language][rarity].image) {
                    if (illustration === 'another') {
                      const urlWithParam =
                  searchCard.image + (searchCard.image.includes('?') ? '&' : '?') + 'illust=another';
                      rarityPrices[illustration][language][rarity].image = urlWithParam;
                    } else {
                rarityPrices[illustration][language][rarity].image = searchCard.image;
                    }
                  }
                });
              });
            });
          }
        }

        const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 12); // 캐시는 12시간 유효

  let cacheEntry;
  if (cachedResult) {
    await cachedResult.update({
      cardName: searchCard.name || cardName,
      image: searchCard.image || null,
      gameType: gameType,
          rarityPrices,
          expiresAt,
        });
    cacheEntry = cachedResult;
  } else {
    cacheEntry = await CardPriceCache.create({
      cardName: searchCard.name || cardName,
      image: searchCard.image || null,
      gameType: gameType,
      rarityPrices,
      expiresAt,
    });
  }

  let totalProducts = 0;
        Object.keys(rarityPrices).forEach(illustration => {
          Object.keys(rarityPrices[illustration]).forEach(language => {
            Object.keys(rarityPrices[illustration][language]).forEach(rarity => {
        totalProducts += rarityPrices[illustration][language][rarity].prices.length;
      });
    });
  });

  return {
    source: 'all_sources',
    card: searchCard,
    rarityPrices,
    totalProducts,
    cacheId: cacheEntry.id,
    cacheExpiresAt: expiresAt,
  };
}

async function enhanceCardsWithCacheData(cards) {
  return await Promise.all(
    cards.map(async card => {
      if (card.rarityPrices) {
        return card;
      }

      if (card.cacheId) {
        try {
          const priceCache = await CardPriceCache.findByPk(card.cacheId);

          if (priceCache && new Date() <= new Date(priceCache.expiresAt)) {
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

            const cardName = card.cardName || card.name || priceCache.cardName;
            try {
              const freshResult = await getOrCreateCardPriceData(cardName, null, priceCache.gameType);

              if (!freshResult) {
                console.log(`[WARN] "${cardName}" 카드 검색 결과가 없습니다.`);
                return card;
              }

              const { card: searchCard, rarityPrices: freshRarityPrices } = freshResult;
              let newCard = searchCard;

              if (card.image) {
                newCard.image = card.image;
              }

              return {
                ...card,
                cardName: newCard.name || cardName,
                rarityPrices: freshRarityPrices,
                image: newCard.image || null,
                cacheId: freshResult.cacheId,
              };
            } catch (error) {
              console.error(
                `[ERROR] "${cardName}" 카드의 가격 정보 새로 조회 중 오류 발생: ${error.message}`
              );
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
}

function processCardDataStructure(cards) {
  return cards
    .map(card => {
      if (!card.cardName && !card.name) {
        console.log('[WARN] 카드 이름이 없는 카드 항목이 발견되었습니다:', card);
        return null;
      }

      if (!card.cardName && card.name) {
        card.cardName = card.name;
      }

      const illustrationType = card.illustrationType || 'default';
      const uniqueCardKey = `${card.cardName}_${illustrationType}_${card.language || 'any'}_${card.rarity || 'any'}`;
      card.uniqueCardKey = uniqueCardKey;

      if (!card.products && card.rarityPrices) {
        const prices =
          typeof card.rarityPrices === 'string'
            ? JSON.parse(card.rarityPrices)
            : card.rarityPrices;

        if (!card.image) {
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
          else if (card.language && card.rarity) {
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
          else {
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

        if (
          card.language &&
          card.rarity &&
          prices[illustrationType] &&
          prices[illustrationType][card.language] &&
          prices[illustrationType][card.language][card.rarity]
        ) {
          card.products = prices[illustrationType][card.language][card.rarity].prices;
        }
        else if (card.language && card.rarity) {
          console.log(
            `[WARN] "${card.cardName}" 카드의 일러스트: ${illustrationType}, 언어: ${card.language}, 레어도: ${card.rarity} 조합을 찾을 수 없습니다.`
          );
          card.products = [];
        }
        else if (card.rarity) {
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
        else if (card.language) {
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

      if (card.products && card.products.length > 0) {
        card.products = card.products.map(product => {
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
          else if (product.product && !product.product.id) {
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
}

// 카드 가격 검색 API에 대한 IP당 제한 설정
const cardPriceRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 20, // 30초당 20개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 가격 검색 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
  keyGenerator: req => {
    return `${req.ip}:${req.query.cardName || 'unknown'}`;
  },
});

// 최적 구매 조합 API에 대한 IP당 제한 설정
const optimalPurchaseRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 15, // 30초당 15개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '최적 구매 조합 계산 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
});

// 카드 검색 API에 대한 IP당 제한 설정
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

exports.getYugiohPricesByRarity = [
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

      try {
        const result = await getOrCreateCardPriceData(cardName, null, 'yugioh');

        return res.status(200).json({
          success: true,
          source: result.source,
          gameType: 'yugioh',
          data: {
            cardId: result.card.id,
            cardName: result.card.name,
            image: result.card.image || null,
            totalProducts: result.totalProducts,
          },
          rarityPrices: result.rarityPrices,
          cacheId: result.cacheId,
          cacheExpiresAt: result.cacheExpiresAt,
        });
      } catch (error) {
        if (error.message.includes('센터 카드')) {
          return res.status(404).json({
          success: false,
          error: error.message,
        });
        }
        if (error.message.includes('구매 가능한 가격 정보가 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        if (error.message.includes('카드를 찾을 수 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('[ERROR] 유희왕 레어도별 가격 검색 오류:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

exports.getVanguardPricesByRarity = [
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

      try {
        const result = await getOrCreateCardPriceData(cardName, null, 'vanguard');

        return res.status(200).json({
          success: true,
          source: result.source,
          gameType: 'vanguard',
          data: {
            cardId: result.card.id,
            cardName: result.card.name,
            image: result.card.image || null,
            totalProducts: result.totalProducts,
          },
          rarityPrices: result.rarityPrices,
          cacheId: result.cacheId,
          cacheExpiresAt: result.cacheExpiresAt,
        });
      } catch (error) {
        if (error.message.includes('센터 카드')) {
          return res.status(404).json({
          success: false,
          error: error.message,
        });
        }
        if (error.message.includes('구매 가능한 가격 정보가 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        if (error.message.includes('카드를 찾을 수 없습니다')) {
          return res.status(404).json({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('[ERROR] 뱅가드 레어도별 가격 검색 오류:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

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
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

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

      let card = await Card.findOne({
        where: {
          name: { [Op.like]: `%${cardName}%` },
          expiresAt: { [Op.gt]: new Date() }
        },
      });

      const cardId = card ? card.id : null;

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
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

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

      let card = await Card.findOne({
        where: {
          name: { [Op.like]: `%${cardName}%` },
          expiresAt: { [Op.gt]: new Date() }
        },
      });

      const cardId = card ? card.id : null;

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
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
];

exports.getCachedPrices = [
  cardSearchRateLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 캐시 ID입니다.',
        });
      }

      const priceCache = await CardPriceCache.findByPk(id);

      if (!priceCache) {
        return res.status(404).json({
          success: false,
          message: '해당 ID의 가격 정보를 찾을 수 없습니다.',
        });
      }

      if (new Date() > new Date(priceCache.expiresAt)) {
        return res.status(410).json({
          success: false,
          message: '가격 정보가 만료되었습니다. 새로운 정보를 조회해주세요.',
        });
      }

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

function calculateTotalProducts(rarityPrices) {
  let productCount = 0;

  const prices = typeof rarityPrices === 'string' ? JSON.parse(rarityPrices) : rarityPrices;

  if (!prices || Object.keys(prices).length === 0) return 0;

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

      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({
          error: 'Invalid input: cards array is required and must not be empty',
        });
      }

      const filteredCards = cards.filter(card => {
        if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
          console.log(`[INFO] 센터 카드(${card.cardCode}) "${card.name || card.cardName}" 제외됨`);
          return false;
        }

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

      const enhancedCards = await enhanceCardsWithCacheData(filteredCards);

      const processedCards = processCardDataStructure(enhancedCards);

      if (processedCards.length === 0) {
        return res.status(400).json({
          success: false,
          error: '유효한 카드 정보가 없습니다. 레어도와 언어를 선택했는지 확인해주세요.',
        });
      }

      // 제외할 상품 ID와 상점 기반으로 필터링 적용
      const filteredCardsData = processedCards
        .map(card => {
          const beforeFilterCount = card.products.length;

          const filteredProducts = card.products.filter(product => {
            const productId =
              product.product && product.product.id
                ? String(product.product.id)
                : product.id
                  ? String(product.id)
                  : null;

            let isExcluded = false;

            if (productId) {
              for (const excludedId of excludedProductIds) {
                if (String(excludedId) === productId) {
                  isExcluded = true;
                  break;
                }
              }
            }

            const siteToCheck = product.site || (product.product && product.product.site);
            const isSiteExcluded = siteToCheck && excludedStores.includes(siteToCheck);

            // 마켓플레이스 제외 확인 (쿠팡, G마켓 등)
            let isMarketplaceExcluded = false;
            if (siteToCheck) {
              let sellerName = siteToCheck;
              if (sellerName.startsWith('Naver_')) {
                sellerName = sellerName.substring(6);
              }
              isMarketplaceExcluded = shouldSkipMarketplace(sellerName);
            }

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

      if (filteredCardsData.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            '모든 카드의 상품이 제외 목록에 의해 필터링되었습니다. 제외 목록을 다시 확인해주세요.',
        });
      }

      if (filteredCardsData.length < processedCards.length) {
        console.log(
          `[WARN] 제외 목록에 의해 ${processedCards.length - filteredCardsData.length}개 카드가 완전히 제외됨`
        );
      }

      const options = {
        maxSellersPerCard: 30,
        maxIterations: 50,
        shippingRegion: purchaseOptions.shippingRegion,
        takeout: takeout,
        pointsOptions: {
          tcgshop: purchaseOptions.tcgshopPoints || false,
          carddc: purchaseOptions.carddcPoints || false,
          naverBasic: purchaseOptions.naverBasicPoints || false,
          naverBankbook: purchaseOptions.naverBankbookPoints || false,
          naverMembership: purchaseOptions.naverMembershipPoints || false,
          naverHyundaiCard: purchaseOptions.naverHyundaiCardPoints || false,
        },
      };

      console.log('계산 옵션:', {
        maxSellersPerCard: options.maxSellersPerCard,
        maxIterations: options.maxIterations,
        shippingRegion: options.shippingRegion,
        pointsOptions: options.pointsOptions,
      });

      const result = findOptimalPurchaseCombination(filteredCardsData, {
        ...options,
        excludedProductIds,
        excludedStores,
      });

      if (!result.excludedFilters) {
        result.excludedFilters = {
          excludedProductIds,
          excludedStores,
        };
      }

      const processSellerDetails = sellerDetails => {
        if (!sellerDetails) return sellerDetails;

        Object.entries(sellerDetails).forEach(([, details]) => {
          if (details && details.cards && Array.isArray(details.cards)) {
            details.cards = details.cards.map(card => {
              if (!card.product) {
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
              else if (card.product && !card.product.id) {
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
              else if (card.product && card.product.id && typeof card.product.id === 'number') {
                card.product.id = card.product.id.toString();
              }
              return card;
            });
          }
        });
        return sellerDetails;
      };

      if (result.optimalSellers) {
        result.optimalSellers = processSellerDetails(result.optimalSellers);
      }

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
  getYugiohPricesByRarity: exports.getYugiohPricesByRarity,
  getVanguardPricesByRarity: exports.getVanguardPricesByRarity,
  searchNaverShopApi: exports.searchNaverShopApi,
  searchTCGShop: exports.searchTCGShop,
  searchCardDC: exports.searchCardDC,
  getOptimalPurchaseCombination: exports.getOptimalPurchaseCombination,
  getCachedPrices: exports.getCachedPrices,
};