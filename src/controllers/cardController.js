const { Card, CardPrice } = require('../models/Card');
const { Op } = require('sequelize');
const { searchAndSaveCardPrices, testRarityParsing } = require('../utils/naverCrawler');
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
    const cardName = req.params.cardName;
    console.log(`[DEBUG] 카드 검색 요청: "${cardName}"`);
    
    // 1. 먼저 네이버 쇼핑 API로 실시간 검색 시도
    try {
      console.log(`[DEBUG] 네이버 API로 "${cardName}" 검색 시도`);
      // searchAndSaveCardPricesApi 함수를 사용하여 네이버 API 검색
      const naverResult = await searchAndSaveCardPricesApi(cardName);
      
      // 2. TCGShop 검색 시도
      console.log(`[DEBUG] TCGShop으로 "${cardName}" 검색 시도`);
      const tcgshopResult = await searchAndSaveTCGShopPrices(cardName, naverResult.card?.id);
      
      // 3. CardDC 검색 시도
      console.log(`[DEBUG] CardDC로 "${cardName}" 검색 시도`);
      const cardDCResult = await searchAndSaveCardDCPrices(cardName, naverResult.card?.id);
      
      // 4. OnlyYugioh 검색 시도
      console.log(`[DEBUG] OnlyYugioh로 "${cardName}" 검색 시도`);
      const onlyYugiohResult = await searchAndSaveOnlyYugiohPrices(cardName, naverResult.card?.id);
      
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
        
        return res.status(200).json({ 
          success: true, 
          source: 'naver_api_tcgshop_carddc_onlyyugioh',
          data: naverResult.card,
          prices: combinedPrices,
          summary: {
            naver: naverResult.count,
            tcgshop: tcgshopResult.count,
            carddc: cardDCResult.count,
            onlyyugioh: onlyYugiohResult.count
          }
        });
      }
      console.log(`[DEBUG] 네이버 API 검색 결과 없음, DB 검색으로 대체`);
    } catch (naverError) {
      console.error(`[ERROR] 네이버 API 검색 실패: ${naverError.message}`);
      console.log(`[DEBUG] DB 검색으로 대체`);
    }
    
    // 3. 네이버 API 검색 실패 또는 결과 없음 시 DB에서 검색
    const normalizedCardName = cardName.replace(/\s+/g, '');
    
    const card = await Card.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${cardName}%` } },
          { koName: { [Op.like]: `%${cardName}%` } },
          sequelize.where(
            sequelize.fn('REPLACE', sequelize.col('name'), ' ', ''),
            { [Op.like]: `%${normalizedCardName}%` }
          ),
          sequelize.where(
            sequelize.fn('REPLACE', sequelize.col('koName'), ' ', ''),
            { [Op.like]: `%${normalizedCardName}%` }
          )
        ]
      },
      include: [
        { 
          model: CardPrice, 
          as: 'prices',
          required: false 
        }
      ]
    });

    if (!card) {
      console.log(`[DEBUG] DB에서도 '${cardName}' 검색 결과 없음`);
      
      // 4. DB에도 없지만 TCGShop에서라도 결과가 있는지 확인
      try {
        const tcgshopOnlyResult = await searchAndSaveTCGShopPrices(cardName, null);
        if (tcgshopOnlyResult && tcgshopOnlyResult.count > 0) {
          console.log(`[DEBUG] TCGShop에서만 ${tcgshopOnlyResult.count}개 상품 발견`);
          
          return res.status(200).json({
            success: true,
            source: 'tcgshop_only',
            data: {
              name: cardName,
              prices: tcgshopOnlyResult.prices
            }
          });
        }
      } catch (tcgError) {
        console.error(`[ERROR] TCGShop 전용 검색 실패: ${tcgError.message}`);
      }
      
      return res.status(404).json({ 
        success: false, 
        error: '카드를 찾을 수 없습니다. 네이버 API 검색, TCGShop 검색 및 DB 검색 모두 실패했습니다.' 
      });
    }

    console.log(`[DEBUG] DB 검색 성공: "${card.name}" / "${card.koName}"`);
    
    // 5. 카드를 찾았지만 최신 가격 정보가 없으면 TCGShop, CardDC, OnlyYugioh 추가 검색
    if (!card.prices || card.prices.length === 0 || 
        !card.prices.some(p => p.lastUpdated && new Date(p.lastUpdated) > new Date(Date.now() - 24*60*60*1000))) {
      try {
        console.log(`[DEBUG] DB 가격 정보 없거나 오래됨, TCGShop, CardDC, OnlyYugioh 추가 검색`);
        const tcgshopResult = await searchAndSaveTCGShopPrices(cardName, card.id);
        const cardDCResult = await searchAndSaveCardDCPrices(cardName, card.id);
        const onlyYugiohResult = await searchAndSaveOnlyYugiohPrices(cardName, card.id);
        
        if ((tcgshopResult && tcgshopResult.count > 0) || 
            (cardDCResult && cardDCResult.count > 0) || 
            (onlyYugiohResult && onlyYugiohResult.count > 0)) {
          // DB에서 다시 조회하여 최신 가격 정보 포함
          const updatedCard = await Card.findOne({
            where: { id: card.id },
            include: [{ model: CardPrice, as: 'prices', required: false }]
          });
          
          if (updatedCard) {
            card = updatedCard;
          }
        }
      } catch (error) {
        console.error(`[ERROR] 추가 크롤링 검색 실패: ${error.message}`);
      }
    }
    
    res.status(200).json({ 
      success: true,
      source: 'database',
      data: card 
    });
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
  return res.redirect(`/api/cards/rarity-prices/${req.params.cardName}?${new URLSearchParams(req.query)}`);
};

// 레어도별 카드 가격 정보 가져오기
exports.getPricesByRarity = async (req, res) => {
  try {
    const cardName = req.params.cardName;
    const { includeUsed = 'true' } = req.query; // 중고 상품 포함 여부 (기본값: true)
    
    console.log(`[DEBUG] 레어도별 가격 정보 검색: "${cardName}", 중고포함=${includeUsed}`);
    
    let card = null;
    let prices = [];
    let searchSource = 'database';
    
    // 1. 먼저 네이버 쇼핑 API로 실시간 검색 시도
    try {
      console.log(`[DEBUG] 네이버 API로 "${cardName}" 레어도별 검색 시도`);
      const naverResult = await searchAndSaveCardPricesApi(cardName);
      
      if (naverResult && naverResult.count > 0) {
        console.log(`[DEBUG] 네이버 API 검색 성공: ${naverResult.count}개 상품 발견`);
        card = naverResult.card;
        prices = naverResult.prices;
        searchSource = 'naver_api';
      } else {
        console.log(`[DEBUG] 네이버 API 검색 결과 없음, DB 검색으로 대체`);
      }
    } catch (naverError) {
      console.error(`[ERROR] 네이버 API 검색 실패: ${naverError.message}`);
      console.log(`[DEBUG] DB 검색으로 대체`);
    }
    
    // 2. 네이버 API 검색 실패 또는 결과 없음 시 DB에서 검색
    if (!card) {
      const normalizedCardName = cardName.replace(/\s+/g, '');
      
      const dbCard = await Card.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%${cardName}%` } },
            { koName: { [Op.like]: `%${cardName}%` } },
            sequelize.where(
              sequelize.fn('REPLACE', sequelize.col('name'), ' ', ''),
              { [Op.like]: `%${normalizedCardName}%` }
            ),
            sequelize.where(
              sequelize.fn('REPLACE', sequelize.col('koName'), ' ', ''),
              { [Op.like]: `%${normalizedCardName}%` }
            )
          ]
        },
        include: [
          { 
            model: CardPrice, 
            as: 'prices',
            required: false 
          }
        ]
      });
      
      if (dbCard) {
        card = dbCard;
        prices = dbCard.prices || [];
      }
    }

    if (!card) {
      console.log(`[DEBUG] '${cardName}' 레어도별 가격 검색 결과 없음`);
      return res.status(404).json({ 
        success: false, 
        error: '카드를 찾을 수 없습니다. 네이버 API 검색 및 DB 검색 모두 실패했습니다.' 
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
    
    // 레어도별로 가격 정보 그룹화
    const rarityPrices = {};
    
    // 가격들을 레어도별로 그룹화
    cardFilteredPrices.forEach(price => {
      const rarity = price.rarity || '알 수 없음';
      
      if (!rarityPrices[rarity]) {
        rarityPrices[rarity] = [];
      }
      
      rarityPrices[rarity].push({
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
    
    // 각 레어도 그룹 내에서 가격 오름차순 정렬
    Object.keys(rarityPrices).forEach(rarity => {
      rarityPrices[rarity].sort((a, b) => a.price - b.price);
    });

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
        })),
        rarityPrices
      },
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
    const { cardName } = req.params;
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름이 필요합니다.' 
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
    const { cardName } = req.params;
    console.log(`[DEBUG] 네이버 쇼핑 API 요청: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름이 필요합니다.' 
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

// 네이버 API 직접 테스트
exports.testNaverApi = async (req, res) => {
  try {
    const { cardName } = req.params;
    console.log(`[DEBUG] 네이버 API 테스트: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ success: false, error: '카드 이름이 필요합니다.' });
    }
    
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    console.log(`[DEBUG] API 키: ${clientId ? '설정됨' : '없음'}, ${clientSecret ? '설정됨' : '없음'}`);
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ success: false, error: 'API 인증 정보가 없습니다.' });
    }
    
    const query = encodeURIComponent(cardName);
    const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${query}&display=10`;
    
    const headers = {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    };
    
    const response = await axios.get(apiUrl, { headers });
    
    return res.status(200).json({
      success: true,
      total: response.data.total,
      items: response.data.items
    });
  } catch (error) {
    console.error('[ERROR] 네이버 API 직접 테스트 오류:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
};

// 레어도 파싱 테스트 API
exports.testRarityParsing = async (req, res) => {
  try {
    const { title } = req.body;
    
    // 테스트 케이스 목록
    const testCases = [
      '네가로기어아제우스 (PHRA-KR045) Ultimate Rare 한글판 유희왕',
      '네가로기어아제우스 (QCAC-KR014) Secret Rare 한글판 유희왕',
      '네가로기어 아제우스 / 시크릿 레어 / QCAC-KR014 (신일러)',
      '네가로기어아제우스 QCAC-JP014 시크릿레어 신규일러스트 일본판 유희왕',
      '유희왕 한글판 네가로기어아제우스 슈퍼레어 QCAC-KR014',
      '네가로기어아제우스 Holographic Rare 한글판 유희왕 B급 PHRA-KR045',
      '네가로기어 아제우스 얼티밋레어 QCCU-JP182',
      '네가로기어아제우스 / QCAC-KR014 / Super Rare',
      '네가로기어아제우스 / QCCU-KR182 / Ultra Rare',
      '네가로기어아제우스 (QCAC-JP014) Secret Rare 일본판 유희왕카드',
      '유희왕 한글판 네가로기어아제우스(다른일러) QC시크릿레어 QCAC-KR014',
      '네가로기어아제우스 QCAC-KR014 시크릿레어 A급 중고',
      '네가로기어아제우스 시크릿 레어 C급 카드'
    ];
    
    // 결과 저장
    const formattedArray = [];
    const resultsObject = {};
    
    // 제공된 상품명 또는 테스트 케이스 파싱
    if (title && title.trim() !== '') {
      // 단일 상품명 파싱
      const result = testRarityParsing(title);
      resultsObject[title] = result;
      formattedArray.push({
        title: title,
        rarity: result.rarity,
        rarityCode: result.rarityCode,
        language: result.language,
        condition: result.condition,
        cardCode: result.cardCode ? result.cardCode.fullCode : null
      });
    } else {
      // 테스트 케이스 파싱
      for (const testCase of testCases) {
        const result = testRarityParsing(testCase);
        resultsObject[testCase] = result;
        formattedArray.push({
          title: testCase,
          rarity: result.rarity,
          rarityCode: result.rarityCode,
          language: result.language,
          condition: result.condition,
          cardCode: result.cardCode ? result.cardCode.fullCode : null
        });
      }
    }
    
    console.log('=== 카드 정보 파싱 테스트 결과 ===');
    
    res.status(200).json({ 
      success: true, 
      formattedArray,
      results: resultsObject
    });
  } catch (error) {
    console.error('[ERROR] 카드 정보 파싱 테스트 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// TCGShop에서 카드 가격 검색
exports.searchTCGShop = async (req, res) => {
  try {
    const { cardName } = req.params;
    console.log(`[DEBUG] TCGShop 검색 요청: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름이 필요합니다.' 
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
    const { cardName } = req.params;
    console.log(`[DEBUG] CardDC 검색 요청: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름이 필요합니다.' 
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
    const { cardName } = req.params;
    console.log(`[DEBUG] OnlyYugioh 검색 요청: ${cardName}`);
    
    if (!cardName) {
      return res.status(400).json({ 
        success: false, 
        error: '카드 이름이 필요합니다.' 
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
const getOptimalPurchaseCombination = async (req, res) => {
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
              message: `'${card.name}' 카드의 가격 정보가 만료되었거나 존재하지 않습니다. 다시 /api/cards/rarity-prices/${encodeURIComponent(card.name)} API를 호출하여 새로운 캐시 ID를 얻어주세요.`,
              invalidCacheId: card.cacheId
            });
          }
          
          // 캐시된 레어도별 가격 정보가 있는 경우
          console.log(`'${card.name}' 캐시된 가격 정보 사용 (ID: ${card.cacheId})`);
          
          // products 배열로 변환
          let products = [];
          const rarityPrices = priceCache.rarityPrices;
          
          if (card.rarity && rarityPrices[card.rarity]) {
            // 선택된 레어도 상품 중 필터링
            const rarityProducts = rarityPrices[card.rarity];
            
            // 언어 선택이 있는 경우 해당 언어로 필터링
            if (card.language) {
              const languageProducts = rarityProducts.filter(product => 
                product.language === card.language
              );
              
              // 선택한 레어도와 언어 조합이 없는 경우
              if (languageProducts.length === 0) {
                console.log(`'${card.name}' 카드의 '${card.rarity}' 레어도에서 '${card.language}' 언어 상품을 찾을 수 없습니다.`);
                
                // 가능한 언어 목록 제공
                const availableLanguages = [...new Set(rarityProducts.map(p => p.language))];
                
                return {
                  cardName: card.name,
                  desiredRarity: card.rarity,
                  desiredLanguage: card.language,
                  quantity: card.quantity || 1,
                  products: [],
                  availableLanguages
                };
              }
              
              products = languageProducts;
            } else {
              // 언어 선택이 없으면 모든 언어 상품 포함
              products = rarityProducts;
            }
          } else {
            console.log(`'${card.name}' 카드에 대한 레어도 '${card.rarity}'의 가격 정보가 없습니다.`);
            
            // 가능한 레어도 목록 제공
            const availableRarities = Object.keys(rarityPrices);
            
            return {
              cardName: card.name,
              desiredRarity: card.rarity,
              desiredLanguage: card.language,
              quantity: card.quantity || 1,
              products: [],
              availableRarities
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
    await Promise.all(validCardsResults.map(async (card) => {
      try {
        const cardRecord = await Card.findOne({
          where: { name: card.cardName }
        });
        
        if (cardRecord && cardRecord.image) {
          cardImages[card.cardName] = cardRecord.image;
        } else {
          // 상품 중에 이미지가 있는지 확인
          const productWithImage = card.products.find(p => p.image);
          if (productWithImage) {
            cardImages[card.cardName] = productWithImage.image;
          }
        }
      } catch (error) {
        console.error(`카드 이미지 검색 중 오류 발생: ${error.message}`);
      }
    }));
    
    // 이미지 정보를 결과에 추가
    const response = {
      ...optimalCombination,
      cardImages,
      notFoundCards: cards
        .filter(card => !validCardsResults.some(vc => vc.cardName === card.name))
        .map(card => card.name)
    };

    // invalidRarityCards가 있으면 응답에 추가
    if (invalidRarityCards.length > 0) {
      response.invalidRarityLanguageCards = invalidRarityCards;
    }
    
    // 클라이언트에 반환할 때는 민감한 정보 필터링
    response.cardsOptimalPurchase = response.cardsOptimalPurchase.map(card => {
      // 제품 객체에서 필요한 정보만 포함
      const product = card.product ? {
        price: card.product.price,
        rarity: card.product.rarity,
        language: card.product.language,
        site: card.product.site,
        url: card.product.url,
        cardCode: card.product.cardCode
      } : null;
      
      return {
        cardName: card.cardName,
        seller: card.seller,
        price: card.price,
        quantity: card.quantity || 1,  // 수량 정보 추가
        totalPrice: card.totalPrice || card.price,  // 총 가격 정보 추가
        product: product
      };
    });

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
  getAllCards,
  getLowestPrice,
  getPricesByRarity,
  crawlNaverStorePrice,
  searchNaverShopApi,
  testNaverApi,
  testRarityParsing,
  searchTCGShop,
  searchCardDC,
  searchOnlyYugioh,
  getOptimalPurchaseCombination,
  getCachedPrices
}; 