const { Card, CardPrice } = require('../models/Card');
const { Op } = require('sequelize');
const { searchAndSaveCardPrices } = require('../utils/crawler');
const { searchAndSaveCardPricesApi } = require('../utils/naverShopApi');
const { searchAndSaveTCGShopPrices } = require('../utils/tcgshopCrawler');
const { searchAndSaveCardDCPrices } = require('../utils/cardDCCrawler');
const { searchAndSaveOnlyYugiohPrices } = require('../utils/onlyYugiohCrawler');
const axios = require('axios');
const sequelize = require('sequelize');
const { findOptimalPurchaseCombination } = require('../utils/optimizedPurchase');
const CardPriceCache = require('../models/CardPriceCache');

// 모든 카드 목록 가져오기
exports.getAllCards = async (req, res) => {
  try {
    const cards = await Card.findAll({
      attributes: ['id', 'name', 'koName', 'cardType', 'image', 'rarity', 'rarityCode']
    });
    
    res.status(200).json({ 
      success: true, 
      count: cards.length, 
      data: cards 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// 특정 카드의 최저가 정보 가져오기
exports.getLowestPrice = async (req, res) => {
  // GET /api/cards/:cardName가 제거되었으므로 레어도별 가격 정보 API로 리다이렉트
  const { cardName } = req.query;
  
  if (!cardName) {
    return res.status(400).json({
      success: false,
      error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.'
    });
  }
  
  return res.redirect(`/api/cards/rarity-prices?cardName=${encodeURIComponent(cardName)}&${new URLSearchParams(req.query).toString().replace(`cardName=${encodeURIComponent(cardName)}&`, '')}`);
};

// 레어도별 카드 가격 정보 가져오기
exports.getPricesByRarity = async (req, res) => {
  try {
    const { cardName, includeUsed = 'true' } = req.query; // 쿼리 스트링에서 카드 이름과 중고 상품 포함 여부 가져오기
    
    if (!cardName) {
      return res.status(400).json({
        success: false,
        error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.'
      });
    }
    
    // 센터 카드인지 확인 (ST19-KRFC1~4)
    if (/^ST19-KRFC[1-4]$/i.test(cardName)) {
      return res.status(404).json({
        success: false,
        error: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.'
      });
    }
    
    console.log(`[DEBUG] 레어도별 가격 정보 검색: "${cardName}", 중고포함=${includeUsed}`);
    
    let card = null;
    let prices = [];
    let searchSource = 'api';
    
    // 1. 캐시에서 먼저 검색
    const cachedResult = await CardPriceCache.findOne({
      where: {
        cardName: cardName,
        expiresAt: { [Op.gt]: new Date() }
      }
    });
    
    if (cachedResult) {
      console.log(`[DEBUG] 캐시에서 "${cardName}" 레어도별 검색 결과 발견`);
      // 캐시 데이터의 구조 검사 (구 버전과 신 버전 호환성)
      let responseData = {
        success: true,
        source: 'cache',
        data: {
          cardName: cachedResult.cardName,
          image: cachedResult.image
        }
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
        
        // 1. 정규화된 데이터 구조인지 확인 (언어 -> 레어도 -> {image, prices} 형태)
        const isNormalizedFormat = Object.values(rarityPrices).some(lang => 
          typeof lang === 'object' && 
          Object.values(lang).some(rarity => 
            rarity && 
            rarity.hasOwnProperty('image') && 
            rarity.hasOwnProperty('prices') && 
            Array.isArray(rarity.prices)
          )
        );
        
        if (isNormalizedFormat) {
          // 이미 정규화된 형식임
          console.log('[DEBUG] 캐시 데이터가 정규화된 형식입니다.');
          normalizedRarityPrices = rarityPrices;
        } 
        // 2. 배열로 저장된 데이터인지 확인 (인덱스 -> 가격정보 형태)
        else if (Array.isArray(rarityPrices) || Object.keys(rarityPrices).every(key => !isNaN(parseInt(key)))) {
          console.log('[DEBUG] 캐시 데이터가 배열/인덱스 형식입니다. 정규화를 시도합니다.');
          
          // 배열 또는 인덱스 키를 사용하는 객체를 정규화된 형태로 변환
          const prices = Array.isArray(rarityPrices) ? rarityPrices : Object.values(rarityPrices);
          
          // 언어별, 레어도별로 가격 정보 그룹화
          prices.forEach(price => {
            // price 객체에서 필요한 필드 추출
            let language, rarity, priceValue, site, url, condition, cardCode, available, lastUpdated, id;
            
            // price가 {image, prices} 형태인 경우 처리
            if (price.language && price.language.prices) {
              language = price.language.prices;
              rarity = price.rarity.prices;
              priceValue = price.price.prices;
              site = price.site.prices;
              url = price.url.prices;
              condition = price.condition.prices;
              cardCode = price.cardCode?.prices;
              available = price.available.prices;
              lastUpdated = price.lastUpdated.prices;
              id = price.id.prices;
            } else {
              // 일반적인 가격 정보 객체인 경우
              language = price.language || '알 수 없음';
              rarity = price.rarity || '알 수 없음';
              priceValue = price.price;
              site = price.site;
              url = price.url;
              condition = price.condition;
              cardCode = price.cardCode;
              available = price.available;
              lastUpdated = price.lastUpdated;
              id = price.id;
            }
            
            // 언어가 '알 수 없음'이거나 레어도가 '알 수 없음'인 경우 제외
            if (language === '알 수 없음' || rarity === '알 수 없음') {
              return;
            }
            
            if (!normalizedRarityPrices[language]) {
              normalizedRarityPrices[language] = {};
            }
            
            if (!normalizedRarityPrices[language][rarity]) {
              normalizedRarityPrices[language][rarity] = {
                image: cachedResult.image, // 기본 이미지 사용
                prices: []
              };
            }
            
            normalizedRarityPrices[language][rarity].prices.push({
              id,
              price: priceValue,
              site,
              url,
              condition,
              rarity,
              language,
              cardCode,
              available,
              lastUpdated
            });
          });
          
          // 각 레어도별 가격을 오름차순으로 정렬
          Object.keys(normalizedRarityPrices).forEach(language => {
            Object.keys(normalizedRarityPrices[language]).forEach(rarity => {
              normalizedRarityPrices[language][rarity].prices.sort((a, b) => a.price - b.price);
            });
          });
        }
        // 3. 구 형식 데이터 (language -> rarity -> prices[] 형태)
        else {
          console.log('[DEBUG] 캐시 데이터가 구 형식입니다. 변환을 시도합니다.');
          // 구 형식 데이터를 새 형식으로 변환
          Object.keys(rarityPrices).forEach(language => {
            normalizedRarityPrices[language] = {};
            
            Object.keys(rarityPrices[language]).forEach(rarity => {
              const prices = rarityPrices[language][rarity];
              
              normalizedRarityPrices[language][rarity] = {
                image: cachedResult.image, // 기존 이미지를 사용
                prices: Array.isArray(prices) ? prices : [prices] // 배열이 아닌 경우 배열로 변환
              };
            });
          });
        }
        
        // 품절된 상품 필터링 (available 필드가 false인 아이템 제외)
        let totalProducts = 0;
        Object.keys(normalizedRarityPrices).forEach(language => {
          Object.keys(normalizedRarityPrices[language]).forEach(rarity => {
            const beforeFilterCount = normalizedRarityPrices[language][rarity].prices.length;
            normalizedRarityPrices[language][rarity].prices = normalizedRarityPrices[language][rarity].prices.filter(
              price => price.available !== false
            );
            const afterFilterCount = normalizedRarityPrices[language][rarity].prices.length;
            
            if (beforeFilterCount !== afterFilterCount) {
              console.log(`[DEBUG] 캐시에서 "${language}" / "${rarity}" 품절 상품 제외: ${beforeFilterCount - afterFilterCount}개`);
            }
            
            totalProducts += normalizedRarityPrices[language][rarity].prices.length;
          });
        });
        
        // 빈 레어도 그룹 제거 (필터링 후 상품이 없는 경우)
        Object.keys(normalizedRarityPrices).forEach(language => {
          Object.keys(normalizedRarityPrices[language]).forEach(rarity => {
            if (normalizedRarityPrices[language][rarity].prices.length === 0) {
              delete normalizedRarityPrices[language][rarity];
            }
          });
          
          // 빈 언어 그룹 제거
          if (Object.keys(normalizedRarityPrices[language]).length === 0) {
            delete normalizedRarityPrices[language];
          }
        });
        
        responseData.rarityPrices = normalizedRarityPrices;
        responseData.data.totalProducts = totalProducts;
        
        if (Object.keys(normalizedRarityPrices).length === 0) {
          // 정규화 후 데이터가 없는 경우 캐시 무효화
          console.log('[WARN] 캐시 데이터 정규화 후 유효한 데이터가 없습니다. 캐시를 무효화합니다.');
          
          // 캐시 항목 만료 설정
          await cachedResult.update({
            expiresAt: new Date(Date.now() - 1000) // 현재 시간보다 이전으로 설정하여 만료 처리
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
          expiresAt: new Date(Date.now() - 1000) // 현재 시간보다 이전으로 설정하여 만료 처리
        });
        
        // 캐시에서 데이터를 찾지 못한 것처럼 다음 단계로 진행
      }
    }
    
    // 2. 캐시에 없으면 모든 소스에서 동시에 검색
    try {
      console.log(`[DEBUG] "${cardName}" 검색 시작 - 모든 소스에서 병렬 검색`);
      
      // 모든 소스에서 병렬로 검색 (Promise.all 사용)
      const [naverResult, tcgshopResult, cardDCResult, onlyYugiohResult] = await Promise.all([
        // 네이버 쇼핑 API 검색
        searchAndSaveCardPricesApi(cardName).catch(error => {
          console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
          return { count: 0, prices: [] };
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
        
        // OnlyYugioh 검색
        searchAndSaveOnlyYugiohPrices(cardName, null).catch(error => {
          console.error(`[ERROR] OnlyYugioh 검색 오류: ${error.message}`);
          return { count: 0, prices: [] };
        })
      ]);
      
      console.log(`[DEBUG] 네이버 API 검색 결과: ${naverResult ? naverResult.count : 0}개 상품 발견`);
      console.log(`[DEBUG] TCGShop 검색 결과: ${tcgshopResult ? tcgshopResult.count : 0}개 상품 발견`);
      console.log(`[DEBUG] CardDC 검색 결과: ${cardDCResult ? cardDCResult.count : 0}개 상품 발견`);
      console.log(`[DEBUG] OnlyYugioh 검색 결과: ${onlyYugiohResult ? onlyYugiohResult.count : 0}개 상품 발견`);
      
      // 결과가 하나라도 있는지 확인
      const hasResults = 
        (naverResult && naverResult.count > 0) || 
        (tcgshopResult && tcgshopResult.count > 0) || 
        (cardDCResult && cardDCResult.count > 0) || 
        (onlyYugiohResult && onlyYugiohResult.count > 0);
      
      if (!hasResults) {
        return res.status(404).json({
          success: false,
          error: '카드를 찾을 수 없습니다. 모든 소스에서 검색 결과가 없습니다.'
        });
      }
      
      // 모든 소스의 가격 정보 합치기
      const combinedPrices = [
        ...(naverResult.prices || []), 
        ...(tcgshopResult.prices || []),
        ...(cardDCResult.prices || []),
        ...(onlyYugiohResult.prices || [])
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
          error: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.'
        });
      }
      
      // 검색 소스 설정
      searchSource = 'all_sources';
      
      // 모든 가격 정보를 합친 배열
      prices = combinedPrices;
      
      // 상품 제목에 "중고" 키워드가 포함된 제품도 추가 필터링
      const preFilteredPrices = prices.filter(price => {
        // 상품 제목이 있는 경우 "중고" 키워드 확인
        if (price.title && /\[중고\]|\(중고\)|중고|중고품|used|듀얼용|실듀용/i.test(price.title)) {
          console.log(`[DEBUG] 상품명에 '중고' 또는 '듀얼용' 키워드가 포함되어 필터링됨: ${price.title}`);
          return false; // 중고 상품 제외
        }
        return true;
      });
      
      // 번개장터 상품 필터링
      const bungaeFilteredPrices = preFilteredPrices.filter(price => 
        !(price.site && (price.site === 'Naver_번개장터' || price.site.includes('번개장터')))
      );
      
      // 중고 여부 필터링 (condition 필드 기반)
      const filteredPrices = bungaeFilteredPrices.filter(price => {
        // condition이 신품이 아닌 경우 필터링
        if (price.condition !== '신품') {
          console.log(`[DEBUG] condition이 '신품'이 아니어서 필터링됨: ${price.condition}, 상품명: ${price.title || '제목 없음'}`);
          return false;
        }
        return true;
      });
      
      console.log(`[DEBUG] 중고 상품 필터링: ${prices.length}개 중 ${preFilteredPrices.length}개(1차), ${filteredPrices.length}개(2차) 남음`);
      
      // 판매 사이트가 "네이버"인 경우 제외
      const siteFilteredPrices = filteredPrices.filter(price => 
        !price.site || price.site !== "Naver_네이버"
      );
      
      // 품절 상품 제외 (available 필드가 false인 상품)
      const availableFilteredPrices = siteFilteredPrices.filter(price => {
        // available 필드가 없거나 true인 경우만 포함
        return price.available !== false;
      });
      
      console.log(`[DEBUG] 품절 상품 필터링: ${siteFilteredPrices.length}개 중 ${availableFilteredPrices.length}개 상품 사용 가능`);
      console.log(`[DEBUG] 사이트별 품절 상품 제외: TCGShop ${tcgshopResult?.prices?.filter(p => p.available === false).length || 0}개, CardDC ${cardDCResult?.prices?.filter(p => p.available === false).length || 0}개, OnlyYugioh ${onlyYugiohResult?.prices?.filter(p => p.available === false).length || 0}개`);
      
      // 카드가 아닌 상품 제외 (레어도나 언어가 '알 수 없음'인 카드의 경우에도 최저가 계산이 불가능하기 때문에 제외)
      const cardFilteredPrices = availableFilteredPrices.filter(price => 
        !(price.rarity === '알 수 없음' || price.language === '알 수 없음')
      );
      
      if (!cardFilteredPrices || cardFilteredPrices.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: '현재 구매 가능한 가격 정보가 없습니다.' 
        });
      }
      
      // 모든 가격 정보에서 센터 카드 필터링
      const centerCardFilteredPrices = cardFilteredPrices.filter(price => 
        !(price.cardCode && /^ST19-KRFC[1-4]$/i.test(price.cardCode))
      );
      
      if (centerCardFilteredPrices.length !== cardFilteredPrices.length) {
        console.log(`[DEBUG] 센터 카드 필터링: ${cardFilteredPrices.length - centerCardFilteredPrices.length}개 제외됨`);
      }
      
      if (!centerCardFilteredPrices || centerCardFilteredPrices.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: '현재 구매 가능한 가격 정보가 없습니다.' 
        });
      }
      
      // 모든 가격 정보를 가격 오름차순으로 정렬
      const allPricesSorted = [...centerCardFilteredPrices].sort((a, b) => a.price - b.price);
      
      // 언어별, 레어도별로 가격 정보 그룹화
      const rarityPrices = {};
      
      // 가격들을 언어별, 레어도별로 그룹화
      centerCardFilteredPrices.forEach(price => {
        const language = price.language || '알 수 없음';
        const rarity = price.rarity || '알 수 없음';
        
        if (!rarityPrices[language]) {
          rarityPrices[language] = {};
        }
        
        if (!rarityPrices[language][rarity]) {
          rarityPrices[language][rarity] = {
            image: null, // 레어도별 이미지 URL을 저장할 필드 추가
            prices: []
          };
        }
        
        rarityPrices[language][rarity].prices.push({
          id: price.id,
          price: price.price,
          site: price.site,
          url: price.url,
          condition: price.condition,
          rarity: price.rarity,
          language: price.language,
          cardCode: price.cardCode,
          available: price.available,
          lastUpdated: price.lastUpdated
        });
      });
      
      // 각 언어와 레어도 그룹 내에서 가격 오름차순 정렬
      Object.keys(rarityPrices).forEach(language => {
        Object.keys(rarityPrices[language]).forEach(rarity => {
          rarityPrices[language][rarity].prices.sort((a, b) => a.price - b.price);
        });
      });

      // 이미지 URL을 레어도별로 설정
      // 1. 네이버 API 검색 결과에서 이미지 URL을 가져옵니다
      try {
        // 이미지가 필요한 레어도 확인 (null인 이미지만 업데이트)
        const needImage = Object.values(rarityPrices).some(lang => 
          Object.values(lang).some(rarity => !rarity.image)
        );
        
        // 이미지가 필요한 경우에만 추가 API 호출
        if (needImage) {
          console.log(`[DEBUG] 이미지 URL 추출을 위한 네이버 API 검색: "${cardName}"`);
          const { searchNaverShop } = require('../utils/naverShopApi');
          
          // 이미지만을 위한 API 호출은 결과 수를 제한하여 빠르게 반환
          const apiResults = await searchNaverShop(cardName);
          
          // 결과에서 이미지 URL 데이터 추출
          if (apiResults && apiResults.length > 0) {
            // 객체로 변환하여 레어도/언어별 이미지 찾기 최적화
            const imageMap = {};
            
            apiResults.forEach(item => {
              if (item.image && item.image.trim() !== '') {
                const key = `${item.language}:${item.rarity}`;
                if (!imageMap[key]) {
                  imageMap[key] = item.image;
                }
              }
            });
            
            // 레어도별 이미지 URL 설정
            Object.keys(rarityPrices).forEach(language => {
              Object.keys(rarityPrices[language]).forEach(rarity => {
                // 이미 이미지가 있는 경우 건너뛰기
                if (rarityPrices[language][rarity].image) return;
                
                // 언어와 레어도에 맞는 이미지 찾기
                const key = `${language}:${rarity}`;
                if (imageMap[key]) {
                  rarityPrices[language][rarity].image = imageMap[key];
                  console.log(`[DEBUG] "${language}" / "${rarity}" 레어도 이미지 URL 설정`);
                } else if (card.image) {
                  // 레어도별 이미지가 없으면 카드의 기본 이미지 사용
                  rarityPrices[language][rarity].image = card.image;
                }
              });
            });
          } else if (card.image) {
            // API 검색 결과가 없으면 카드의 기본 이미지 사용
            Object.keys(rarityPrices).forEach(language => {
              Object.keys(rarityPrices[language]).forEach(rarity => {
                if (!rarityPrices[language][rarity].image) {
                  rarityPrices[language][rarity].image = card.image;
                }
              });
            });
          }
        } else {
          console.log('[DEBUG] 모든 레어도에 이미지가 이미 있습니다. 추가 API 호출 건너뜀');
        }
      } catch (imageError) {
        console.error(`[ERROR] 이미지 URL 설정 오류: ${imageError.message}`);
        // 오류가 발생해도 계속 진행하고 기본 이미지 사용
        if (card.image) {
          Object.keys(rarityPrices).forEach(language => {
            Object.keys(rarityPrices[language]).forEach(rarity => {
              if (!rarityPrices[language][rarity].image) {
                rarityPrices[language][rarity].image = card.image;
              }
            });
          });
        }
      }

      // 가격 정보를 캐시에 저장하고 ID 발급
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12); // 최적화: 12시간 유효 (24시간에서 단축)
      
      const cacheEntry = await CardPriceCache.create({
        cardName: card.name || cardName,
        image: card.image || null,
        rarityPrices,
        expiresAt
      });

      // 총 상품 개수 계산
      let totalProducts = 0;
      Object.keys(rarityPrices).forEach(language => {
        Object.keys(rarityPrices[language]).forEach(rarity => {
          totalProducts += rarityPrices[language][rarity].prices.length;
        });
      });

      // 각 소스별 상품 개수
      const summary = {
        naver: naverResult ? naverResult.count : 0,
        tcgshop: tcgshopResult ? tcgshopResult.count : 0,
        carddc: cardDCResult ? cardDCResult.count : 0,
        onlyyugioh: onlyYugiohResult ? onlyYugiohResult.count : 0
      };

      return res.status(200).json({ 
        success: true,
        source: searchSource,
        data: {
          cardId: card.id,
          cardName: card.name,
          image: card.image || null,
          totalProducts: totalProducts
        },
        rarityPrices: rarityPrices,
        cacheId: cacheEntry.id, // 캐시 ID 응답에 포함
        cacheExpiresAt: expiresAt, // 만료 시간 응답에 포함
      });
      
    } catch (error) {
      console.error('[ERROR] 레어도별 가격 검색 오류:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  } catch (error) {
    console.error('[ERROR] 레어도별 가격 검색 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// 네이버 스토어에서 카드 가격 크롤링
exports.crawlNaverStorePrice = async (req, res) => {
  try {
    const { cardName } = req.query;
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.' 
      });
    }
    
    const result = await searchAndSaveCardPrices(cardName);
    
    if (result.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '검색 결과가 없습니다.', 
        card: result.card 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `${result.count}개의 가격 정보를 찾았습니다.`,
      data: {
        card: result.card,
        prices: result.prices
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// 네이버 쇼핑 API를 사용하여 카드 가격 검색
exports.searchNaverShopApi = async (req, res) => {
  try {
    const { cardName } = req.query;
    console.log(`[DEBUG] 네이버 쇼핑 API 요청: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.' 
      });
    }
    
    console.log('[DEBUG] searchAndSaveCardPricesApi 함수 호출 시작');
    const result = await searchAndSaveCardPricesApi(cardName);
    console.log(`[DEBUG] searchAndSaveCardPricesApi 함수 결과: ${result.count}`);
    
    if (result.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '검색 결과가 없습니다.', 
        card: result.card 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `${result.count}개의 가격 정보를 찾았습니다.`,
      data: {
        card: result.card,
        prices: result.prices
      }
    });
  } catch (error) {
    console.error('[ERROR] 네이버 쇼핑 API 컨트롤러 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// TCGShop에서 카드 가격 검색
exports.searchTCGShop = async (req, res) => {
  try {
    const { cardName } = req.query;
    console.log(`[DEBUG] TCGShop 검색 요청: ${cardName}`);
    
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
    
    // TCGShop 크롤링 및 가격 정보 저장
    console.log('[DEBUG] searchAndSaveTCGShopPrices 함수 호출 시작');
    const result = await searchAndSaveTCGShopPrices(cardName, cardId);
    console.log(`[DEBUG] searchAndSaveTCGShopPrices 함수 결과: ${result.count}`);
    
    if (result.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'TCGShop에서 검색 결과가 없습니다.', 
        card: card 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `TCGShop에서 ${result.count}개의 가격 정보를 찾았습니다.`,
      data: {
        card: card,
        prices: result.prices
      }
    });
  } catch (error) {
    console.error('[ERROR] TCGShop 검색 컨트롤러 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// CardDC에서 카드 가격 검색
exports.searchCardDC = async (req, res) => {
  try {
    const { cardName } = req.query;
    console.log(`[DEBUG] CardDC 검색 요청: ${cardName}`);
    
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
    
    // CardDC 크롤링 및 가격 정보 저장
    console.log('[DEBUG] searchAndSaveCardDCPrices 함수 호출 시작');
    const result = await searchAndSaveCardDCPrices(cardName, cardId);
    console.log(`[DEBUG] searchAndSaveCardDCPrices 함수 결과: ${result.count}`);
    
    if (result.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'CardDC에서 검색 결과가 없습니다.', 
        card: card 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `CardDC에서 ${result.count}개의 가격 정보를 찾았습니다.`,
      data: {
        card: card,
        prices: result.prices
      }
    });
  } catch (error) {
    console.error('[ERROR] CardDC 검색 컨트롤러 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// OnlyYugioh에서 카드 가격 검색
exports.searchOnlyYugioh = async (req, res) => {
  try {
    const { cardName } = req.query;
    console.log(`[DEBUG] OnlyYugioh 검색 요청: ${cardName}`);
    
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
    console.log('[DEBUG] searchAndSaveOnlyYugiohPrices 함수 호출 시작');
    const result = await searchAndSaveOnlyYugiohPrices(cardName, cardId);
    console.log(`[DEBUG] searchAndSaveOnlyYugiohPrices 함수 결과: ${result.count}`);
    
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
};

/**
 * 캐시된 카드 가격 정보 조회
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @returns {Promise<void>}
 */
exports.getCachedPrices = async (req, res) => {
  try {
    const { id } = req.params;
    
    // UUID 유효성 검사
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 캐시 ID입니다.'
      });
    }
    
    // 캐시 정보 조회
    const priceCache = await CardPriceCache.findByPk(id);
    
    if (!priceCache) {
      return res.status(404).json({
        success: false,
        message: '해당 ID의 가격 정보를 찾을 수 없습니다.'
      });
    }
    
    // 캐시가 만료되었는지 확인
    if (new Date() > new Date(priceCache.expiresAt)) {
      return res.status(410).json({
        success: false,
        message: '가격 정보가 만료되었습니다. 새로운 정보를 조회해주세요.'
      });
    }
    
    // 센터 카드 체크
    if (/^ST19-KRFC[1-4]$/i.test(priceCache.cardName)) {
      return res.status(404).json({
        success: false,
        message: '센터 카드는 실제 유희왕 카드가 아니므로 가격 정보를 제공하지 않습니다.'
      });
    }
    
    // 응답 반환
    return res.json({
      success: true,
      data: {
        cardName: priceCache.cardName,
        image: priceCache.image,
        totalProducts: calculateTotalProducts(priceCache.rarityPrices)
      },
      rarityPrices: priceCache.rarityPrices,
      cacheId: priceCache.id,
      cacheExpiresAt: priceCache.expiresAt
    });
    
  } catch (error) {
    console.error('캐시된 가격 정보 조회 중 오류 발생:', error);
    return res.status(500).json({
      success: false,
      message: '가격 정보 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 레어도별 가격 정보에서 총 상품 개수 계산
 * @param {Object} rarityPrices - 레어도별 가격 정보
 * @returns {number} 총 상품 개수
 */
function calculateTotalProducts(rarityPrices) {
  let totalProducts = 0;
  
  // rarityPrices가 문자열이면 JSON으로 파싱
  const prices = typeof rarityPrices === 'string' ? JSON.parse(rarityPrices) : rarityPrices;
  
  // 언어별, 레어도별 상품 개수 합산
  Object.keys(prices).forEach(language => {
    Object.keys(prices[language]).forEach(rarity => {
      if (prices[language][rarity] && prices[language][rarity].prices) {
        totalProducts += prices[language][rarity].prices.length;
      }
    });
  });
  
  return totalProducts;
}

/**
 * 여러 카드의 최적 구매 조합 계산
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @returns {Promise<void>}
 */
exports.getOptimalPurchaseCombination = async (req, res) => {
  try {
    const { cards, excludedProductIds = [], excludedStores = [], ...purchaseOptions } = req.body;

    // 입력 데이터 유효성 검사
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        error: 'Invalid input: cards array is required and must not be empty'
      });
    }

    console.log(`최적 구매 조합 찾기 요청 - ${cards.length}개 카드`);
    if (excludedProductIds.length > 0) {
      console.log(`[INFO] ${excludedProductIds.length}개의 상품 ID가 제외 목록에 추가됨`);
    }
    if (excludedStores.length > 0) {
      console.log(`[INFO] ${excludedStores.length}개의 상점이 제외 목록에 추가됨: ${excludedStores.join(', ')}`);
    }
    
    // 센터 카드 필터링
    const filteredCards = cards.filter(card => {
      // cardCode 필드로 센터 카드 확인
      if (card.cardCode && /^ST19-KRFC[1-4]$/i.test(card.cardCode)) {
        console.log(`[INFO] 센터 카드(${card.cardCode}) "${card.name || card.cardName}" 제외됨`);
        return false;
      }
      
      // 카드 이름으로 확인 (코드가 없는 경우)
      if ((card.name && /^ST19-KRFC[1-4]$/i.test(card.name)) || 
          (card.cardName && /^ST19-KRFC[1-4]$/i.test(card.cardName))) {
        console.log(`[INFO] 센터 카드 "${card.name || card.cardName}" 제외됨`);
        return false;
      }
      
      return true;
    });
    
    if (filteredCards.length === 0) {
      return res.status(400).json({
        success: false,
        error: '유효한 카드 정보가 없습니다. 센터 카드가 아닌 카드를 선택해주세요.'
      });
    }
    
    // cacheId를 사용해 rarityPrices를 조회하고 카드 데이터 보강
    const enhancedCards = await Promise.all(filteredCards.map(async (card) => {
      // 이미 rarityPrices가 있으면 그대로 사용
      if (card.rarityPrices) {
        return card;
      }
      
      // cacheId가 있으면 캐시에서 데이터 조회
      if (card.cacheId) {
        try {
          console.log(`[INFO] cacheId(${card.cacheId})로 "${card.name || card.cardName}" 카드의 캐시된 가격 정보 조회`);
          const priceCache = await CardPriceCache.findByPk(card.cacheId);
          
          if (priceCache && new Date() <= new Date(priceCache.expiresAt)) {
            // 캐시된 데이터 설정
            return {
              ...card,
              cardName: card.cardName || card.name || priceCache.cardName,
              rarityPrices: priceCache.rarityPrices,
              image: card.image || priceCache.image
            };
          } else if (priceCache) {
            console.log(`[WARN] "${card.name || card.cardName}" 카드의 캐시 데이터가 만료되었습니다.`);
          } else {
            console.log(`[WARN] "${card.name || card.cardName}" 카드의 cacheId(${card.cacheId})에 해당하는 캐시 데이터를 찾을 수 없습니다.`);
          }
        } catch (error) {
          console.error(`[ERROR] 캐시 데이터 조회 중 오류 발생: ${error.message}`);
        }
      }
      
      return card;
    }));

    // 카드 데이터 구조 검증 및 변환
    const processedCards = enhancedCards.map(card => {
      // 핵심 필드 누락 여부 확인
      if (!card.cardName && !card.name) {
        console.log('[WARN] 카드 이름이 없는 카드 항목이 발견되었습니다:', card);
        return null;
      }

      // cardName 필드 보장 (name을 cardName으로 변환)
      if (!card.cardName && card.name) {
        card.cardName = card.name;
      }
      
      // 카드에 이미지 정보가 있는지 로그로 확인
      if (card.image) {
        console.log(`[INFO] "${card.cardName}" 카드의 이미지 정보가 존재합니다: ${card.image.substring(0, 50)}...`);
      }

      // products 필드 처리 (캐시 형식 변환)
      if (!card.products && card.rarityPrices) {
        // rarityPrices가 문자열인 경우 파싱
        const prices = typeof card.rarityPrices === 'string' 
          ? JSON.parse(card.rarityPrices) 
          : card.rarityPrices;
        
        // 이미지 정보 확인 및 설정
        if (!card.image) {
          // 지정된 레어도와 언어에 맞는 이미지 찾기
          if (card.language && card.rarity && 
              prices[card.language] && 
              prices[card.language][card.rarity] &&
              prices[card.language][card.rarity].image) {
            
            card.image = prices[card.language][card.rarity].image;
            console.log(`[INFO] "${card.cardName}" 카드 이미지를 rarityPrices에서 찾았습니다: ${card.language}/${card.rarity}`);
          } 
          // 첫 번째 이미지 사용
          else {
            // 첫 번째 언어와 레어도 조합에서 이미지 찾기
            let foundImage = false;
            for (const language of Object.keys(prices)) {
              if (foundImage) break;
              for (const rarity of Object.keys(prices[language])) {
                if (prices[language][rarity].image) {
                  card.image = prices[language][rarity].image;
                  console.log(`[INFO] "${card.cardName}" 카드 이미지를 rarityPrices에서 찾았습니다: ${language}/${rarity}`);
                  foundImage = true;
                  break;
                }
              }
            }
          }
        }
        
        // 지정된 레어도와 언어가 있는 경우
        if (card.language && card.rarity && 
            prices[card.language] && 
            prices[card.language][card.rarity]) {
          
          card.products = prices[card.language][card.rarity].prices;
          console.log(`[INFO] "${card.cardName}" 카드의 ${card.language}/${card.rarity} 상품 ${card.products.length}개 변환됨`);
        } 
        // 지정된 레어도만 있는 경우
        else if (card.rarity) {
          // 모든 언어에서 해당 레어도 상품 통합
          card.products = [];
          Object.keys(prices).forEach(language => {
            if (prices[language][card.rarity]) {
              card.products = [...card.products, ...prices[language][card.rarity].prices];
            }
          });
          console.log(`[INFO] "${card.cardName}" 카드의 ${card.rarity} 레어도 상품 ${card.products.length}개 변환됨`);
        }
        // 지정된 언어만 있는 경우
        else if (card.language && prices[card.language]) {
          // 해당 언어의 모든 레어도 상품 통합
          card.products = [];
          Object.keys(prices[card.language]).forEach(rarity => {
            card.products = [...card.products, ...prices[card.language][rarity].prices];
          });
          console.log(`[INFO] "${card.cardName}" 카드의 ${card.language} 언어 상품 ${card.products.length}개 변환됨`);
        }
        // 모든 상품 통합
        else {
          card.products = [];
          Object.keys(prices).forEach(language => {
            Object.keys(prices[language]).forEach(rarity => {
              card.products = [...card.products, ...prices[language][rarity].prices];
            });
          });
          console.log(`[INFO] "${card.cardName}" 카드의 모든 상품 ${card.products.length}개 변환됨`);
        }
      } else if (!card.products) {
        console.log(`[ERROR] "${card.cardName}" 카드에 product 정보가 없으며 rarityPrices도 없습니다. 레어도와 언어를 선택했는지 확인이 필요합니다.`);
        return null;
      }
      
      return card;
    }).filter(card => card !== null && card.products && card.products.length > 0);
    
    // 유효한 카드가 없는 경우
    if (processedCards.length === 0) {
      return res.status(400).json({
        success: false, 
        error: '유효한 카드 정보가 없습니다. 레어도와 언어를 선택했는지 확인해주세요.'
      });
    }
    
    // 제외할 상품 ID와 상점 기반으로 필터링 적용
    const filteredCardsData = processedCards.map(card => {
      // 제외 목록을 기반으로 상품 필터링
      const beforeFilterCount = card.products.length;
      const filteredProducts = card.products.filter(product => 
        !excludedProductIds.includes(product.id) && 
        !excludedStores.includes(product.site)
      );
      
      const afterFilterCount = filteredProducts.length;
      if (beforeFilterCount !== afterFilterCount) {
        console.log(`[INFO] "${card.cardName}" 카드: ${beforeFilterCount - afterFilterCount}개 상품이 제외 목록에 따라 필터링됨`);
      }
      
      return {
        ...card,
        products: filteredProducts
      };
    }).filter(card => card.products.length > 0);
    
    // 필터링 후 유효한 카드가 없는 경우
    if (filteredCardsData.length === 0) {
      return res.status(400).json({
        success: false, 
        error: '모든 카드의 상품이 제외 목록에 의해 필터링되었습니다. 제외 목록을 다시 확인해주세요.'
      });
    }
    
    // 필터링으로 제외된 카드가 있는 경우 로그
    if (filteredCardsData.length < processedCards.length) {
      console.log(`[WARN] 제외 목록에 의해 ${processedCards.length - filteredCardsData.length}개 카드가 완전히 제외됨`);
    }

    // 기본 옵션 설정 - 고정값 사용
    const options = {
      maxSellersPerCard: 30,
      maxIterations: 50,
      shippingRegion: purchaseOptions.shippingRegion,
      pointsOptions: {
        tcgshop: purchaseOptions.tcgshopPoints || false, // 티씨지샵 기본 적립금 (10%)
        carddc: purchaseOptions.carddcPoints || false, // 카드디씨 기본 적립금 (10%)
        naverBasic: purchaseOptions.naverBasicPoints || false, // 네이버 기본 적립금 (2.5%, 리뷰 적립금 포함)
        naverBankbook: purchaseOptions.naverBankbookPoints || false, // 네이버 제휴통장 적립금 (0.5%)
        naverMembership: purchaseOptions.naverMembershipPoints || false, // 네이버 멤버십 적립금 (4%)
        naverHyundaiCard: purchaseOptions.naverHyundaiCardPoints || false // 네이버 현대카드 적립금 (7%)
      }
    };

    console.log('계산 옵션:', {
      maxSellersPerCard: options.maxSellersPerCard,
      maxIterations: options.maxIterations,
      shippingRegion: options.shippingRegion,
      pointsOptions: options.pointsOptions
    });

    // 최적 구매 조합 찾기 - 필터링된 카드 배열 사용
    const result = findOptimalPurchaseCombination(filteredCardsData, options);
    
    // 제외 필터 정보 추가
    result.excludedFilters = {
      excludedProductIds,
      excludedStores
    };
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('최적 구매 조합 찾기 오류:', error);
    return res.status(500).json({ error: '최적 구매 조합을 계산하는 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  getAllCards: exports.getAllCards,
  getLowestPrice: exports.getLowestPrice,
  getPricesByRarity: exports.getPricesByRarity,
  crawlNaverStorePrice: exports.crawlNaverStorePrice,
  searchNaverShopApi: exports.searchNaverShopApi,
  searchTCGShop: exports.searchTCGShop,
  searchCardDC: exports.searchCardDC,
  searchOnlyYugioh: exports.searchOnlyYugioh,
  getOptimalPurchaseCombination: exports.getOptimalPurchaseCombination,
  getCachedPrices: exports.getCachedPrices
}; 
