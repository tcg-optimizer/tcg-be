const { parseRarity } = require('./rarityUtil');

/**
 * 상품명에서 다른 일러스트 여부를 판단합니다.
 * @param {string} title - 상품 제목
 * @returns {string} - 'default' (기본 일러스트) 또는 'another' (다른 일러스트)
 */
function detectIllustration(title) {
  if (!title) return 'default';

  // "증원" 카드 특별 처리: 상품명에 "증원"과 "섬도희"가 모두 포함되면 어나더 일러스트
  if (/증원/i.test(title) && /섬도희/i.test(title)) {
    return 'another';
  }

  // 더 단순하고 강력한 패턴 - 키워드가 포함되기만 하면 감지
  const anotherIllustrationPatterns = [
    // 핵심 키워드들 (위치와 상관없이 포함되면 감지)
    /다른일러/i, // "다른일러" 포함
    /다른\s+일러/i, // "다른 일러" (띄어쓰기 포함)
    /신규일러/i, // "신규일러" 포함
    /신규\s+일러/i, // "신규 일러" (띄어쓰기 포함)
    /어나더일러/i, // "어나더일러" 포함
    /어나더\s+일러/i, // "어나더 일러" (띄어쓰기 포함)
    /신일러/i, // "신일러" 포함
    /새일러/i, // "새일러" 포함
    /다른일러스트/i, // "다른일러스트" 포함
    /신규일러스트/i, // "신규일러스트" 포함
    /어나더일러스트/i, // "어나더일러스트" 포함
    /신일러스트/i, // "신일러스트" 포함
    /새일러스트/i, // "새일러스트" 포함

    // 버전 관련
    /다른버전/i, // "다른버전" 포함
    /신버전/i, // "신버전" 포함
    /어나더버전/i, // "어나더버전" 포함
    /새버전/i, // "새버전" 포함

    // 아트 관련
    /다른아트/i, // "다른아트" 포함
    /신아트/i, // "신아트" 포함
    /새아트/i, // "새아트" 포함
    /어나더아트/i, // "어나더아트" 포함

    // 기타
    /리메이크/i, // "리메이크" 포함
    /재판/i, // "재판" 포함

    // 영문 패턴
    /another.*illustration/i, // "another illustration" 관련
    /new.*illustration/i, // "new illustration" 관련
    /alternate.*art/i, // "alternate art" 관련
    /alt.*art/i, // "alt art" 관련
    /different.*art/i, // "different art" 관련
    /new.*art/i, // "new art" 관련
    /special.*art/i, // "special art" 관련
    /limited.*art/i, // "limited art" 관련
  ];

  // 다른 일러스트 키워드가 있는지 확인
  for (const pattern of anotherIllustrationPatterns) {
    if (pattern.test(title)) {
      return 'another';
    }
  }

  return 'default';
}

/**
 * 카드 언어를 파싱합니다. (한글판, 일본판, 영문판)
 * @param {string} title - 상품 제목
 * @returns {string} - 파싱된 언어 정보
 */
function parseLanguage(title) {
  // 직접적인 언어 표기 체크
  if (/(한글판|한판)/i.test(title)) {
    return '한글판';
  }
  if (/(일본판|일어판|일판)/i.test(title)) {
    return '일본판';
  }
  if (/(영문판|영어판|영판)/i.test(title)) {
    return '영문판';
  }

  // 없을 경우 카드 코드에서 언어 추출
  const cardCode = /\b([A-Z0-9]{2,5})-([A-Z]{2})\d{3,4}\b/i;
  const match = title.match(cardCode);

  if (match && match[2]) {
    const code = match[2].toUpperCase();

    switch (code) {
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
  if (/A급|A\+|A등급|A-등급/i.test(title)) {
    return '중고';
  }
  if (/B급|B등급/i.test(title)) {
    return '중고';
  }
  if (/C급|C등급/i.test(title)) {
    return '중고';
  }
  if (/중고|중고품/i.test(title)) {
    return '중고';
  }

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

module.exports = {
  testRarityParsing,
  parseLanguage,
  parseCondition,
  extractCardCode,
  detectIllustration,
};
