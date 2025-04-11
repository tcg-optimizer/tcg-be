const axios = require('axios');
const { Card, CardPrice } = require('../models/Card');
const { Op } = require('sequelize');
// rarityUtil.js에서 레어도 파싱 함수를 가져옵니다
const { parseRarity } = require('./rarityUtil');
// naverCrawler.js에서 나머지 파싱 함수들을 가져옵니다
const { parseLanguage, parseCondition, extractCardCode, testRarityParsing } = require('./naverCrawler');

/**
 * 네이버 쇼핑 검색 API를 사용하여 카드 가격 정보를 가져옵니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Array>} - 검색된 상품 정보 배열
 */
async function searchNaverShop(cardName) {
  try {
    // 네이버 API 키 설정 (환경 변수에서 가져옴)
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    console.log(`[DEBUG] 네이버 API 키: ${clientId ? '설정됨' : '없음'}, ${clientSecret ? '설정됨' : '없음'}`);
    
    if (!clientId || !clientSecret) {
      throw new Error('네이버 API 인증 정보가 설정되지 않았습니다.');
    }
    
    // 검색 파라미터 설정
    const query = encodeURIComponent(cardName);
    const display = 100; // 검색 결과 개수 (최대 100)
    const sort = 'sim'; // 정렬 (sim: 정확도순, date: 날짜순, asc: 가격오름차순, dsc: 가격내림차순)
    
    // API 요청 헤더
    const headers = {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    };
    
    let allItems = [];
    let start = 1;
    let hasMoreItems = true;
    const maxItems = 1000; // 최대 1000개까지 가져오기
    
    while (hasMoreItems && allItems.length < maxItems) {
      // API 요청 URL
      const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${query}&display=${display}&start=${start}&sort=${sort}`;
      console.log(`[DEBUG] 네이버 API 요청 URL: ${apiUrl}`);
      
      // API 요청
      const response = await axios.get(apiUrl, { headers });
      
      // 결과 파싱
      const items = response.data.items.map(item => {
        const title = item.title.replace(/<b>|<\/b>/g, ''); // HTML 태그 제거
        
        // 레어도, 언어, 상태 정보 파싱
        const rarityInfo = parseRarity(title);
        const language = parseLanguage(title);
        const condition = parseCondition(title);
        const cardCode = extractCardCode(title);
        
        console.log(`[DEBUG] 상품 파싱: "${title}" - 레어도: ${rarityInfo.rarity}, 언어: ${language}`);
        
        return {
          title: title,
          price: parseInt(item.lprice), // 최저가
          site: item.mallName,
          url: item.link,
          productId: item.productId,
          image: item.image, // 이미지 URL 추가
          condition: condition,
          rarity: rarityInfo.rarity,
          rarityCode: rarityInfo.rarityCode,
          language: language,
          cardCode: cardCode ? cardCode.fullCode : null,
          available: true,
          brand: item.brand,
          category: item.category1
        };
      });
      
      allItems = [...allItems, ...items];
      
      // 100개 미만의 결과를 받았거나 최대 개수에 도달했다면 더 이상 요청하지 않음
      if (items.length < display) {
        hasMoreItems = false;
      } else {
        start += display; // 다음 페이지로 이동
      }
    }
    
    console.log(`[INFO] 총 ${allItems.length}개의 상품 정보를 가져왔습니다.`);
    return allItems;
  } catch (error) {
    console.error('[ERROR] 네이버 쇼핑 API 검색 오류:', error);
    return [];
  }
}

/**
 * 카드 이름으로 검색하여 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveCardPricesApi(cardName) {
  try {
    // 카드 찾기 또는 생성
    let [card, created] = await Card.findOrCreate({
      where: { name: cardName },
      defaults: { name: cardName }
    });
    
    // 네이버 쇼핑 API 검색
    const priceData = await searchNaverShop(cardName);
    
    // 검색 결과가 없는 경우
    if (priceData.length === 0) {
      return { message: '검색 결과가 없습니다.', card, count: 0 };
    }
    
    // 기존 가격 정보 삭제 (최신 정보로 갱신)
    await CardPrice.destroy({
      where: { 
        cardId: card.id,
        site: { [Op.like]: 'Naver%' } // 네이버 스토어 데이터만 삭제
      }
    });
    
    // 대표 이미지가 없는 경우에만 카드 이미지 업데이트
    if (!card.image && priceData.length > 0) {
      // 이미지가 있는 첫 번째 상품 찾기
      const itemWithImage = priceData.find(item => item.image && item.image.trim() !== '');
      
      if (itemWithImage) {
        console.log(`[DEBUG] 카드 이미지 업데이트: ${itemWithImage.image}`);
        await card.update({ image: itemWithImage.image });
        // 업데이트된 카드 정보 다시 로드
        card = await Card.findByPk(card.id);
      }
    }
    
    // 새 가격 정보 저장
    const savedPrices = await Promise.all(
      priceData.map(async (item) => {
        return CardPrice.create({
          cardId: card.id,
          site: `Naver_${item.site}`,
          price: item.price,
          url: item.url,
          condition: item.condition,
          rarity: item.rarity,
          language: item.language,
          available: item.available,
          cardCode: item.cardCode,
          lastUpdated: new Date()
        });
      })
    );
    
    // 레어도 정보가 있는 상품이 있으면 카드의 기본 레어도 정보도 업데이트
    const rarityItems = priceData.filter(item => item.rarity !== '알 수 없음');
    if (rarityItems.length > 0) {
      // 가장 많이 파싱된 레어도 선택
      const rarityCount = {};
      rarityItems.forEach(item => {
        if (!rarityCount[item.rarity]) rarityCount[item.rarity] = 0;
        rarityCount[item.rarity]++;
      });
      
      const mostCommonRarity = Object.keys(rarityCount).reduce((a, b) => 
        rarityCount[a] > rarityCount[b] ? a : b
      );
      
      const rarityCode = rarityItems.find(item => item.rarity === mostCommonRarity).rarityCode;
      
      // 카드 정보 업데이트
      await card.update({
        rarity: mostCommonRarity,
        rarityCode: rarityCode
      });
      
      // 업데이트된 카드 정보 다시 로드
      card = await Card.findByPk(card.id);
    }
    
    return {
      card,
      prices: savedPrices,
      count: savedPrices.length
    };
  } catch (error) {
    console.error('카드 가격 저장 오류:', error);
    throw error;
  }
}

module.exports = {
  searchNaverShop,
  searchAndSaveCardPricesApi
}; 