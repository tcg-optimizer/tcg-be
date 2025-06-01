const axios = require('axios');
const cheerio = require('cheerio');
const { Op } = require('sequelize');
const { Card, CardPrice } = require('../models/Card');
const { parseRarity } = require('./rarityUtil');

/**
 * 카드 언어를 파싱합니다. (한글판, 일본판, 영문판)
 * @param {string} title - 상품 제목
 * @returns {string} - 파싱된 언어 정보
 */
function parseLanguage(title) {
  // 1. 직접적인 언어 표기 확인
  if (/(한글판|한국어판)/i.test(title)) {
    return '한글판';
  }
  if (/(일본판|일어판|일본어판)/i.test(title)) {
    return '일본판';
  }
  if (/(영문판|영어판|영문)/i.test(title)) {
    return '영문판';
  }

  // 2. 카드 코드에서 언어 코드 추출 (예: PHRA-KR045, QCAC-JP014)
  const cardCodePattern = /\b([A-Z0-9]{2,5})-([A-Z]{2})\d{3,4}\b/i;
  const match = title.match(cardCodePattern);

  if (match && match[2]) {
    const languageCode = match[2].toUpperCase();

    switch (languageCode) {
      case 'KR':
        return '한글판';
      case 'JP':
        return '일본판';
      case 'EN':
        return '영문판';
      default:
        return '기타';
    }
  }

  // 3. 기본값
  return '알 수 없음';
}

/**
 * 카드 코드에서 정보를 추출합니다.
 * @param {string} title - 상품 제목
 * @returns {Object|null} - 추출된 카드 코드 정보
 */
function extractCardCode(title) {
  // 일반적인 카드 코드 패턴 (예: ROTA-KR024)
  const standardPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2})(\d{3,4})\b/i;

  // 특수한 카드 코드 패턴 (예: SUB1-JPS07)
  const specialPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2,3})([0-9A-Z]{2,4})\b/i;

  // 추가 패턴 (예: 코드가 괄호 안에 있는 경우: (ROTA-KR024))
  const parenthesesPattern = /\(([A-Z0-9]{2,5})-([A-Z]{2,3})([0-9A-Z]{2,4})\)/i;

  // 우선 일반 패턴으로 시도
  let match = title.match(standardPattern);

  // 일반 패턴으로 찾지 못한 경우 특수 패턴으로 시도
  if (!match) {
    match = title.match(specialPattern);
  }

  // 괄호 안의 패턴으로 시도
  if (!match) {
    match = title.match(parenthesesPattern);
  }

  if (match) {
    return {
      fullCode: match[0].replace(/[()]/g, ''), // 괄호 제거
      setCode: match[1],
      languageCode: match[2],
      cardNumber: match[3],
    };
  }

  return null;
}

/**
 * 상품 상태(신품/중고)를 파싱합니다.
 * @param {string} title - 상품 제목
 * @returns {string} - 파싱된 상품 상태
 */
function parseCondition(title) {
  if (/S-급|S-등급/i.test(title)) {
    return '중고';
  }
  if (/\[A급\]|\(A급\)|A급|A\+|A등급|A-급|A-등급/i.test(title)) {
    return '중고';
  }
  if (/\[B급\]|\(B급\)|B급|B등급|B-급|B-등급/i.test(title)) {
    return '중고';
  }
  if (/\[C급\]|\(C급\)|C급|C등급/i.test(title)) {
    return '중고';
  }
  if (/\[중고\]|\(중고\)|^중고[\s:]|\s중고[\s:]|\[used\]|\(used\)|중고품/i.test(title)) {
    return '중고';
  }

  // 기본값 (신품)
  return '신품';
}

/**
 * 레어도 파싱 테스트 함수 - 특정 상품명에서 레어도를 파싱하여 결과 반환
 * @param {string} title - 테스트할 상품명
 * @returns {Object} - 파싱 결과
 */
function testRarityParsing(title) {
  // 레어도 파싱
  const rarityResult = parseRarity(title);

  // 언어 파싱
  const language = parseLanguage(title);

  // 상품 상태 파싱
  const condition = parseCondition(title);

  // 카드 코드 추출
  const cardCode = extractCardCode(title);

  return {
    rarity: rarityResult.rarity,
    rarityCode: rarityResult.rarityCode,
    language: language,
    condition: condition,
    cardCode: cardCode,
  };
}

/**
 * 카드 이름으로 검색하여 가격 정보를 저장합니다.
 * @param {string} cardName - 검색할 카드 이름
 * @returns {Promise<Object>} - 저장된 카드와 가격 정보
 */
async function searchAndSaveCardPrices(cardName) {
  try {
    // 카드 찾기 또는 생성
    let [card, created] = await Card.findOrCreate({
      where: { name: cardName },
      defaults: { name: cardName },
    });

    // 크롤링 결과가 없는 경우
    const priceData = [];
    if (priceData.length === 0) {
      return { message: '검색 결과가 없습니다.', card };
    }

    // 기존 가격 정보 삭제 (최신 정보로 갱신)
    await CardPrice.destroy({
      where: {
        cardId: card.id,
        site: { [Op.like]: 'Naver%' }, // 네이버 스토어 데이터만 삭제
      },
    });

    // 새 가격 정보 저장
    const savedPrices = await Promise.all(
      priceData.map(async item => {
        return CardPrice.create({
          cardId: card.id,
          site: `Naver_${item.site}`,
          price: item.price,
          url: item.url,
          condition: parseCondition(item.title || ''),
          rarity: item.rarity,
          language: item.language,
          available: item.available,
          lastUpdated: new Date(),
        });
      })
    );

    // 카드 정보 업데이트 (가장 많이 발견된 레어도와 언어로 설정)
    if (priceData.length > 0) {
      // 레어도 빈도 계산
      const rarityMap = {};
      const languageMap = {};

      priceData.forEach(item => {
        // 레어도 카운트
        if (!rarityMap[item.rarityCode]) {
          rarityMap[item.rarityCode] = 0;
        }
        rarityMap[item.rarityCode]++;

        // 언어 카운트
        if (!languageMap[item.language]) {
          languageMap[item.language] = 0;
        }
        languageMap[item.language]++;
      });

      // 가장 많이 발견된 레어도 찾기
      let maxRarityCount = 0;
      let dominantRarity = null;
      let dominantRarityCode = null;

      for (const [code, count] of Object.entries(rarityMap)) {
        if (count > maxRarityCount && code !== 'UNK') {
          maxRarityCount = count;
          dominantRarityCode = code;
          dominantRarity = priceData.find(item => item.rarityCode === code).rarity;
        }
      }

      // 가장 많이 발견된 언어 찾기
      let maxLanguageCount = 0;
      let dominantLanguage = null;

      for (const [language, count] of Object.entries(languageMap)) {
        if (count > maxLanguageCount && language !== '알 수 없음') {
          maxLanguageCount = count;
          dominantLanguage = language;
        }
      }

      // 카드 정보 업데이트
      const updateData = {};

      if (dominantRarity && dominantRarityCode) {
        updateData.rarity = dominantRarity;
        updateData.rarityCode = dominantRarityCode;
      }

      if (dominantLanguage) {
        updateData.language = dominantLanguage;
      }

      if (Object.keys(updateData).length > 0) {
        await card.update(updateData);
      }
    }

    return {
      card,
      prices: savedPrices,
      count: savedPrices.length,
    };
  } catch (error) {
    console.error('카드 가격 저장 오류:', error);
    throw error;
  }
}

module.exports = {
  searchAndSaveCardPrices,
  testRarityParsing,
  parseLanguage,
  parseCondition,
  extractCardCode,
};
