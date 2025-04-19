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

// 특정 카드 가격 정보 가져오기
exports.getCardByName = async (req, res) => {
  try {
    const { cardName } = req.query;
    
    if (!cardName) {
      return res.status(400).json({
        success: false,
        error: '카드 이름은 필수 파라미터입니다. ?cardName=카드이름 형식으로 요청해주세요.'
      });
    }
    
    console.log(`[DEBUG] 카드 검색 요청: "${cardName}"`);
    
    // 1. 캐시에서 먼저 검색
    const cachedResult = await CardPriceCache.findOne({
      where: {
        cardName: cardName,
        expiresAt: { [Op.gt]: new Date() }
      }
    });
    
    if (cachedResult) {
      console.log(`[DEBUG] 캐시에서 "${cardName}" 검색 결과 발견`);
      // 캐시 데이터의 구조 검사 (구 버전과 신 버전 호환성)
      let responseData = {
        success: true,
        source: 'cache',
        data: {
          name: cachedResult.cardName,
          image: cachedResult.image
        }
      };
      
      // 캐시 데이터가 새 형식인지 확인 (레어도별 이미지 URL 포함)
      const isNewFormat = Object.values(cachedResult.rarityPrices).some(lang => 
        Object.values(lang).some(rarity => 
          rarity.hasOwnProperty('image') && rarity.hasOwnProperty('prices')
        )
      );
      
      if (isNewFormat) {
        // 새 형식의 데이터
        responseData.rarityPrices = cachedResult.rarityPrices;
      } else {
        // 구 형식의 데이터 - 새 형식으로 변환
        const convertedRarityPrices = {};
        
        // 구 형식 데이터를 새 형식으로 변환
        Object.keys(cachedResult.rarityPrices).forEach(language => {
          convertedRarityPrices[language] = {};
          
          Object.keys(cachedResult.rarityPrices[language]).forEach(rarity => {
            convertedRarityPrices[language][rarity] = {
              image: cachedResult.image, // 기존 이미지를 사용
              prices: cachedResult.rarityPrices[language][rarity]
            };
          });
        });
        
        responseData.rarityPrices = convertedRarityPrices;
      }
      
      return res.status(200).json(responseData);
    }
    
    // 2. 캐시에 없으면 네이버 쇼핑 API로 실시간 검색 시도
    try {
      console.log(`[DEBUG] 네이버 API로 "${cardName}" 검색 시도`);
      const naverResult = await searchAndSaveCardPricesApi(cardName);
      
      // 3. TCGShop 검색 시도
      console.log(`[DEBUG] TCGShop으로 "${cardName}" 검색 시도`);
      const tcgshopResult = await searchAndSaveTCGShopPrices(cardName, null);
      
      // 4. CardDC 검색 시도
      console.log(`[DEBUG] CardDC로 "${cardName}" 검색 시도`);
      const cardDCResult = await searchAndSaveCardDCPrices(cardName, null);
      
      // 5. OnlyYugioh 검색 시도
      console.log(`[DEBUG] OnlyYugioh로 "${cardName}" 검색 시도`);
      const onlyYugiohResult = await searchAndSaveOnlyYugiohPrices(cardName, null);
      
      if (naverResult && naverResult.count > 0) {
        console.log(`[DEBUG] 네이버 API 검색 성공: ${naverResult.count}개 상품 발견`);
        console.log(`[DEBUG] TCGShop 검색 결과: ${tcgshopResult.count}개 상품 발견`);
        console.log(`[DEBUG] CardDC 검색 결과: ${cardDCResult.count}개 상품 발견`);
        console.log(`[DEBUG] OnlyYugioh 검색 결과: ${onlyYugiohResult.count}개 상품 발견`);
        
        // 모든 소스의 가격 정보 합치기
        const combinedPrices = [
          ...(naverResult.prices || []), 
          ...(tcgshopResult.prices || []),
          ...(cardDCResult.prices || []),
          ...(onlyYugiohResult.prices || [])
        ];
        
        // 검색 결과를 캐시에 저장
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 캐시
        
        // 언어별, 레어도별로 가격 정보 그룹화
        const rarityPrices = {};
        
        // 가격들을 언어별, 레어도별로 그룹화
        combinedPrices.forEach(price => {
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
            
            // 레어도별 이미지 URL 설정 (네이버 API 결과에서 가져옴)
            const rarityItems = naverResult.prices.filter(item => 
              item.rarity === rarity && 
              item.language === language && 
              item.image && 
              item.image.trim() !== ''
            );
            
            if (rarityItems.length > 0 && rarityItems[0].image) {
              rarityPrices[language][rarity].image = rarityItems[0].image;
            } else if (naverResult.card && naverResult.card.image) {
              rarityPrices[language][rarity].image = naverResult.card.image;
            }
          });
        });
        
        await CardPriceCache.create({
          cardName: cardName,
          image: naverResult.card?.image || null,
          rarityPrices: rarityPrices,
          expiresAt: expiresAt
        });
        
        return res.status(200).json({ 
          success: true, 
          source: 'naver_api_tcgshop_carddc_onlyyugioh',
          data: naverResult.card,
          rarityPrices: rarityPrices,
          summary: {
            naver: naverResult.count,
            tcgshop: tcgshopResult.count,
            carddc: cardDCResult.count,
            onlyyugioh: onlyYugiohResult.count
          }
        });
      }
      
      // 6. 네이버 API 없지만 TCGShop에서라도 결과가 있는지 확인
      if (tcgshopResult && tcgshopResult.count > 0) {
        console.log(`[DEBUG] TCGShop에서만 ${tcgshopResult.count}개 상품 발견`);
        
        // 언어별, 레어도별로 가격 정보 그룹화
        const rarityPrices = {};
        
        // 가격들을 언어별, 레어도별로 그룹화
        tcgshopResult.prices.forEach(price => {
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
        
        // 검색 결과를 캐시에 저장
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 캐시
        
        await CardPriceCache.create({
          cardName: cardName,
          image: null,
          rarityPrices: rarityPrices,
          expiresAt: expiresAt
        });
        
        return res.status(200).json({
          success: true,
          source: 'tcgshop_only',
          data: {
            name: cardName
          },
          rarityPrices: rarityPrices
        });
      }
      
      return res.status(404).json({ 
        success: false, 
        error: '카드를 찾을 수 없습니다. 네이버 API 검색 및 TCGShop 검색 모두 실패했습니다.' 
      });
    } catch (error) {
      console.error(`[ERROR] 카드 검색 실패: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  } catch (error) {
    console.error('[ERROR] 카드 검색 오류:', error);
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
          name: cachedResult.cardName,
          image: cachedResult.image
        }
      };
      
      // 캐시 데이터가 새 형식인지 확인 (레어도별 이미지 URL 포함)
      const isNewFormat = Object.values(cachedResult.rarityPrices).some(lang => 
        Object.values(lang).some(rarity => 
          rarity.hasOwnProperty('image') && rarity.hasOwnProperty('prices')
        )
      );
      
      if (isNewFormat) {
        // 새 형식의 데이터
        responseData.rarityPrices = cachedResult.rarityPrices;
      } else {
        // 구 형식의 데이터 - 새 형식으로 변환
        const convertedRarityPrices = {};
        
        // 구 형식 데이터를 새 형식으로 변환
        Object.keys(cachedResult.rarityPrices).forEach(language => {
          convertedRarityPrices[language] = {};
          
          Object.keys(cachedResult.rarityPrices[language]).forEach(rarity => {
            convertedRarityPrices[language][rarity] = {
              image: cachedResult.image, // 기존 이미지를 사용
              prices: cachedResult.rarityPrices[language][rarity]
            };
          });
        });
        
        responseData.rarityPrices = convertedRarityPrices;
      }
      
      return res.status(200).json(responseData);
    }
    
    // 2. 캐시에 없으면 네이버 쇼핑 API로 실시간 검색 시도
    try {
      console.log(`[DEBUG] 네이버 API로 "${cardName}" 레어도별 검색 시도`);
      const naverResult = await searchAndSaveCardPricesApi(cardName);
      
      if (naverResult && naverResult.count > 0) {
        console.log(`[DEBUG] 네이버 API 검색 성공: ${naverResult.count}개 상품 발견`);
        card = naverResult.card;
        prices = naverResult.prices;
        searchSource = 'naver_api';
        
        // 캐시에 저장
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 캐시
        
        await CardPriceCache.create({
          cardName: cardName,
          image: card?.image || null,
          rarityPrices: prices,
          expiresAt: expiresAt
        });
      } else {
        console.log(`[DEBUG] 네이버 API 검색 결과 없음`);
      }
    } catch (naverError) {
      console.error(`[ERROR] 네이버 API 검색 실패: ${naverError.message}`);
    }
    
    // 3. 네이버 API 검색 실패시 TCGShop 검색
    if (!card) {
      try {
        console.log(`[DEBUG] TCGShop으로 "${cardName}" 레어도별 검색 시도`);
        const tcgshopResult = await searchAndSaveTCGShopPrices(cardName, null);
        
        if (tcgshopResult && tcgshopResult.count > 0) {
          console.log(`[DEBUG] TCGShop 검색 성공: ${tcgshopResult.count}개 상품 발견`);
          card = { name: cardName };
          prices = tcgshopResult.prices;
          searchSource = 'tcgshop';
          
          // 캐시에 저장
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 캐시
          
          await CardPriceCache.create({
            cardName: cardName,
            image: null,
            rarityPrices: prices,
            expiresAt: expiresAt
          });
        }
      } catch (tcgError) {
        console.error(`[ERROR] TCGShop 검색 실패: ${tcgError.message}`);
      }
    }
    
    if (!card) {
      return res.status(404).json({
        success: false,
        error: '카드를 찾을 수 없습니다. 네이버 API 검색 및 TCGShop 검색 모두 실패했습니다.'
      });
    }

    // 중고 여부 필터링
    const filteredPrices = includeUsed === 'true' 
      ? prices 
      : prices.filter(price => price.condition === '신품');
    
    // 판매 사이트가 "네이버"인 경우 제외
    const siteFilteredPrices = filteredPrices.filter(price => 
      !price.site || price.site !== "Naver_네이버"
    );
    
    // 카드가 아닌 상품 제외 (레어도와 언어가 모두 '알 수 없음'이고 cardCode가 null인 경우)
    const cardFilteredPrices = siteFilteredPrices.filter(price => 
      !((price.rarity === '알 수 없음' && price.language === '알 수 없음' && price.cardCode === null) ||
        (price.rarity === '알 수 없음' && price.cardCode === null))
    );
    
    if (!cardFilteredPrices || cardFilteredPrices.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '현재 구매 가능한 가격 정보가 없습니다.' 
      });
    }
    
    // 모든 가격 정보를 가격 오름차순으로 정렬
    const allPricesSorted = [...cardFilteredPrices].sort((a, b) => a.price - b.price);
    
    // 언어별, 레어도별로 가격 정보 그룹화
    const rarityPrices = {};
    
    // 가격들을 언어별, 레어도별로 그룹화
    cardFilteredPrices.forEach(price => {
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
      // 네이버 쇼핑 API 검색
      console.log(`[DEBUG] 이미지 URL 추출을 위한 네이버 API 검색: "${cardName}"`);
      const { searchNaverShop } = require('../utils/naverShopApi');
      const apiResults = await searchNaverShop(cardName);
      
      // 레어도별로 이미지 URL 설정
      if (apiResults && apiResults.length > 0) {
        // 레어도별로 이미지가 있는 상품 찾기
        Object.keys(rarityPrices).forEach(language => {
          Object.keys(rarityPrices[language]).forEach(rarity => {
            // 현재 레어도에 해당하는 API 검색 결과 필터링
            const rarityItems = apiResults.filter(item => 
              item.rarity === rarity && 
              item.language === language && 
              item.image && 
              item.image.trim() !== ''
            );
            
            if (rarityItems.length > 0) {
              // 이미지가 있는 첫 번째 상품의 이미지 URL 사용
              rarityPrices[language][rarity].image = rarityItems[0].image;
              console.log(`[DEBUG] "${language}" / "${rarity}" 레어도 이미지 URL 설정: ${rarityItems[0].image}`);
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
            rarityPrices[language][rarity].image = card.image;
          });
        });
      }
    } catch (imageError) {
      console.error(`[ERROR] 이미지 URL 설정 오류: ${imageError.message}`);
      // 오류가 발생해도 계속 진행하고 기본 이미지 사용
      if (card.image) {
        Object.keys(rarityPrices).forEach(language => {
          Object.keys(rarityPrices[language]).forEach(rarity => {
            rarityPrices[language][rarity].image = card.image;
          });
        });
      }
    }

    // 가격 정보를 캐시에 저장하고 ID 발급
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 유효
    
    const cacheEntry = await CardPriceCache.create({
      cardName: card.name || cardName,
      rarityPrices,
      expiresAt
    });

    res.status(200).json({ 
      success: true,
      source: searchSource,
      data: {
        cardId: card.id,
        cardName: card.name,
        image: card.image || null,
        allPrices: allPricesSorted.map(price => ({
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
        }))
      },
      rarityPrices: rarityPrices,
      cacheId: cacheEntry.id, // 캐시 ID 응답에 포함
      cacheExpiresAt: expiresAt // 만료 시간 응답에 포함
    });
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
    
    // 응답 반환
    return res.json({
      success: true,
      data: {
        cardName: priceCache.cardName,
        rarityPrices: priceCache.rarityPrices
      },
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
 * 여러 카드의 최적 구매 조합 계산
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @returns {Promise<void>}
 */
exports.getOptimalPurchaseCombination = async (req, res) => {
  try {
    // 요청 데이터 확인
    const { 
      cards, 
      shippingRegion = 'default'
    } = req.body;
    
    console.log('요청 데이터:', JSON.stringify({
      cardsCount: cards?.length,
      shippingRegion,
      sampleCard: cards && cards.length > 0 ? {
        name: cards[0].name,
        rarity: cards[0].rarity,
        language: cards[0].language, // 언어 정보 로깅 추가
        quantity: cards[0].quantity,
        hasCacheId: cards[0].cacheId ? '있음' : '없음'
      } : null
    }));
    
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: '카드 목록은 필수이며, 비어있지 않은 배열이어야 합니다.'
      });
    }

    // 지역 유효성 검사
    if (!['default', 'jeju', 'island'].includes(shippingRegion)) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 배송 지역입니다. default, jeju, island 중 하나여야 합니다.'
      });
    }
    
    // 필수 필드 검증
    const missingFields = cards.filter(card => !card.cacheId || !card.rarity);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: '모든 카드는 cacheId와 rarity 필드가 필수입니다.',
        invalidCards: missingFields.map(card => ({
          name: card.name,
          missingFields: [
            !card.cacheId ? 'cacheId' : null,
            !card.rarity ? 'rarity' : null
          ].filter(Boolean)
        }))
      });
    }
    
    console.log(`${cards.length}개 유형의 카드에 대한 최적 구매 조합 계산 요청 (배송지역: ${shippingRegion})`);
    
    // 캐시 ID를 통해 가격 정보 가져오기
    console.log('캐시된 가격 정보 사용');
    
    const cardPromises = cards.map(card => {
      return (async () => {
        try {
          // 캐시된 가격 정보 조회
          const priceCache = await CardPriceCache.findByPk(card.cacheId);
          
          if (!priceCache || new Date() > new Date(priceCache.expiresAt)) {
            console.log(`'${card.name}' 캐시 만료 또는 없음`);
            return res.status(410).json({
              success: false,
              message: `'${card.name}' 카드의 가격 정보가 만료되었거나 존재하지 않습니다. 다시 /api/cards/rarity-prices?cardName=${encodeURIComponent(card.name)} API를 호출하여 새로운 캐시 ID를 얻어주세요.`,
              invalidCacheId: card.cacheId
            });
          }
          
          // 캐시된 레어도별 가격 정보가 있는 경우
          console.log(`'${card.name}' 캐시된 가격 정보 사용 (ID: ${card.cacheId})`);
          
          // products 배열로 변환
          let products = [];
          const rarityPrices = priceCache.rarityPrices;
          
          if (card.rarity) {
            // 언어 선택이 있는 경우
            if (card.language && rarityPrices[card.language] && rarityPrices[card.language][card.rarity]) {
              // 선택된 언어와 레어도에 해당하는 상품 가져오기
              products = rarityPrices[card.language][card.rarity];
            } 
            // 언어 선택이 없는 경우
            else if (!card.language) {
              // 모든 언어에서 해당 레어도 상품 찾기
              products = [];
              Object.keys(rarityPrices).forEach(language => {
                if (rarityPrices[language][card.rarity]) {
                  products = products.concat(rarityPrices[language][card.rarity]);
                }
              });
            }
            // 선택한 언어에 해당 레어도가 없는 경우
            else if (card.language && rarityPrices[card.language] && !rarityPrices[card.language][card.rarity]) {
              console.log(`'${card.name}' 카드의 '${card.language}' 언어에서 '${card.rarity}' 레어도 상품을 찾을 수 없습니다.`);
              
              // 선택한 언어에서 가능한 레어도 목록 제공
              const availableRarities = Object.keys(rarityPrices[card.language]);
              
              return {
                cardName: card.name,
                desiredRarity: card.rarity,
                desiredLanguage: card.language,
                quantity: card.quantity || 1,
                products: [],
                availableRarities
              };
            }
            // 선택한 언어가 없는 경우
            else if (card.language && !rarityPrices[card.language]) {
              console.log(`'${card.name}' 카드에 '${card.language}' 언어 상품이 없습니다.`);
              
              // 가능한 언어 목록 제공
              const availableLanguages = Object.keys(rarityPrices);
              
              return {
                cardName: card.name,
                desiredRarity: card.rarity,
                desiredLanguage: card.language,
                quantity: card.quantity || 1,
                products: [],
                availableLanguages
              };
            }
          } else {
            console.log(`'${card.name}' 카드에 대한 레어도 정보가 없습니다.`);
            
            // 가능한 언어와 레어도 목록 제공
            const availableLanguages = Object.keys(rarityPrices);
            const availableRarities = new Set();
            
            availableLanguages.forEach(language => {
              Object.keys(rarityPrices[language]).forEach(rarity => {
                availableRarities.add(rarity);
              });
            });
            
            return {
              cardName: card.name,
              desiredRarity: card.rarity,
              desiredLanguage: card.language,
              quantity: card.quantity || 1,
              products: [],
              availableLanguages,
              availableRarities: [...availableRarities]
            };
          }
          
          return {
            cardName: card.name,
            desiredRarity: card.rarity,
            desiredLanguage: card.language,
            quantity: card.quantity || 1,
            products
          };
        } catch (error) {
          console.error(`카드 '${card.name}' 캐시된 가격 정보 조회 중 오류:`, error.message);
          return {
            cardName: card.name,
            desiredRarity: card.rarity,
            desiredLanguage: card.language,
            quantity: card.quantity || 1,
            products: []
          };
        }
      })();
    });
    
    const cardsSearchResults = await Promise.all(cardPromises);
    
    // 상품 정보가 있는 카드만 필터링
    const validCardsResults = cardsSearchResults.filter(card => card.products && card.products.length > 0);
    
    // 유효하지 않은 레어도/언어 조합이 있는지 확인
    const invalidCombinations = cardsSearchResults.filter(card => 
      card.products && card.products.length === 0 && (card.availableRarities || card.availableLanguages)
    );
    
    if (invalidCombinations.length > 0) {
      return res.status(400).json({
        success: false,
        message: '일부 카드에 대해 선택한 레어도와 언어 조합의 상품을 찾을 수 없습니다.',
        invalidCombinations: invalidCombinations.map(card => ({
          name: card.cardName,
          requestedRarity: card.desiredRarity,
          requestedLanguage: card.desiredLanguage,
          availableRarities: card.availableRarities,
          availableLanguages: card.availableLanguages
        }))
      });
    }
    
    if (validCardsResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '유효한 카드 정보를 찾지 못했습니다.'
      });
    }
    
    if (validCardsResults.length < cards.length) {
      console.log(`주의: ${cards.length - validCardsResults.length}개 카드에 대한 정보를 찾지 못했습니다.`);
    }
    
    // 최적 구매 조합 계산 (배송 지역 정보 전달)
    console.log('최적 구매 조합 계산 중...');
    const optimalCombination = findOptimalPurchaseCombination(validCardsResults, { 
      shippingRegion 
    });
    
    // 레어도/언어 조건으로 구매 불가능한 카드들 식별
    const invalidRarityCards = validCardsResults
      .filter(card => card.products.length === 0)
      .map(card => ({
        name: card.cardName,
        rarity: card.desiredRarity,
        language: card.desiredLanguage
      }));

    if (invalidRarityCards.length > 0) {
      console.log(`레어도/언어 조건으로 인해 구매할 수 없는 카드: ${invalidRarityCards.length}개`);
    }
    
    if (!optimalCombination.success) {
      // 실패한 경우 관련 정보 반환
      return res.status(404).json({
        success: false,
        message: '최적 구매 조합을 찾지 못했습니다.',
        error: optimalCombination.message,
        notFoundCards: cards
          .filter(card => !validCardsResults.some(vc => vc.cardName === card.name))
          .map(card => card.name),
        invalidRarityLanguageCards: invalidRarityCards.length > 0 ? invalidRarityCards : undefined
      });
    }
    
    // 결과에 카드 이미지 정보 추가
    const cardImages = {};
    await Promise.all(cards.map(async (card) => {
      try {
        // 캐시에서 이미지 정보 조회
        const priceCache = await CardPriceCache.findByPk(card.cacheId);
        if (priceCache && priceCache.image) {
          cardImages[card.name] = priceCache.image;
          return;
        }
        
        // 캐시에 이미지가 없는 경우, 상품 데이터에서 이미지 검색
        const cardResult = validCardsResults.find(c => c.cardName === card.name);
        if (cardResult && cardResult.products) {
          const productWithImage = cardResult.products.find(p => p.image);
          if (productWithImage) {
            cardImages[card.name] = productWithImage.image;
          }
        }
      } catch (error) {
        console.error(`카드 이미지 검색 중 오류 발생: ${error.message}`);
      }
    }));
    
    // 판매자별 카드 정보 재구성
    const sellerCardsMap = {};
    
    // 레어도별 이미지 URL을 저장할 객체
    const rarityImages = {};
    
    // 먼저 모든 카드의 레어도별 이미지를 캐시에서 가져오기
    await Promise.all(cards.map(async (card) => {
      try {
        if (!card.cacheId) return;
        
        const priceCache = await CardPriceCache.findByPk(card.cacheId);
        if (!priceCache || !priceCache.rarityPrices) return;
        
        // 캐시 데이터가 새 형식인지 확인 (레어도별 이미지 URL 포함)
        const rarityPrices = priceCache.rarityPrices;
        const isNewFormat = Object.values(rarityPrices).some(lang => 
          Object.values(lang).some(rarity => 
            rarity.hasOwnProperty('image') && rarity.hasOwnProperty('prices')
          )
        );
        
        if (isNewFormat) {
          // cardName을 키로 저장 (카드이름-언어-레어도)
          const cardKey = card.name; // 여기서 API 요청 객체의 name 필드 사용
          
          // 카드 이름, 언어, 레어도를 키로 사용하여 이미지 URL 저장
          Object.keys(rarityPrices).forEach(language => {
            Object.keys(rarityPrices[language]).forEach(rarity => {
              const key = `${cardKey}:${language}:${rarity}`;
              if (rarityPrices[language][rarity].image) {
                rarityImages[key] = rarityPrices[language][rarity].image;
              }
            });
          });
        }
      } catch (error) {
        console.error(`레어도별 이미지 URL 캐싱 중 오류: ${error.message}`);
      }
    }));
    
    // 카드별 최적 구매 정보 처리
    optimalCombination.cardsOptimalPurchase.forEach(card => {
      const seller = card.seller;
      const product = card.product ? {
        price: card.product.price,
        rarity: card.product.rarity,
        language: card.product.language,
        site: card.product.site,
        url: card.product.url,
        cardCode: card.product.cardCode
      } : null;
      
      if (!sellerCardsMap[seller]) {
        sellerCardsMap[seller] = {
          cards: [],
          subtotal: 0,
          shippingCost: 0
        };
      }
      
      // 레어도별 이미지 찾기
      let rarityImage = null;
      if (product && product.rarity && product.language) {
        // 구매 최적화 결과에서는 cardName 필드 사용
        // cards 배열에서 동일한 이름을 찾아 매핑
        const originalCard = cards.find(c => c.name === card.cardName);
        if (originalCard) {
          // 원래 요청 카드 이름으로 키 생성
          const key = `${originalCard.name}:${product.language}:${product.rarity}`;
          rarityImage = rarityImages[key] || null;
        }
      }
      
      // 레어도별 이미지가 없으면 기본 이미지 사용
      if (!rarityImage) {
        // cards 배열에서 동일한 이름을 찾기
        const originalCard = cards.find(c => c.name === card.cardName);
        if (originalCard && cardImages[originalCard.name]) {
          rarityImage = cardImages[originalCard.name];
        } else {
          rarityImage = cardImages[card.cardName] || null;
        }
      }
      
      const processedCard = {
        cardName: card.cardName,
        price: card.price,
        quantity: card.quantity || 1,
        totalPrice: card.totalPrice || (card.price * (card.quantity || 1)),
        product: product,
        image: rarityImage // 레어도별 이미지 또는 기본 이미지
      };
      
      sellerCardsMap[seller].cards.push(processedCard);
      sellerCardsMap[seller].subtotal += processedCard.totalPrice;
    });
    
    // 배송비 정보 추가
    if (optimalCombination.sellers) {
      optimalCombination.sellers.forEach(seller => {
        if (sellerCardsMap[seller.name]) {
          sellerCardsMap[seller.name].shippingCost = seller.shippingCost || 0;
        }
      });
    }
    
    // 응답 구성
    const response = {
      success: true,
      totalPrice: optimalCombination.totalProductCost || 0,
      totalShippingCost: optimalCombination.totalShippingCost || 0,
      finalPrice: optimalCombination.totalCost || 0,
      shippingRegion: optimalCombination.shippingRegion || shippingRegion,
      cardsOptimalPurchase: sellerCardsMap,
      cardImages,
      notFoundCards: cards
        .filter(card => !validCardsResults.some(vc => vc.cardName === card.name))
        .map(card => card.name)
    };

    // invalidRarityCards가 있으면 응답에 추가
    if (invalidRarityCards.length > 0) {
      response.invalidRarityLanguageCards = invalidRarityCards;
    }

    // 응답 반환
    return res.json(response);
    
  } catch (error) {
    console.error('최적 구매 조합 계산 중 오류 발생:', error);
    return res.status(500).json({
      success: false,
      message: '최적 구매 조합 계산 중 오류가 발생했습니다.',
      error: error.message
    });
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