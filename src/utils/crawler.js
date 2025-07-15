const { parseRarity } = require('./rarityUtil');
const iconv = require('iconv-lite');

/**
 * 상품명에서 다른 일러스트 여부를 판단합니다.
 * @param {string} title - 상품 제목
 * @returns {string} - 'default' (기본 일러스트) 또는 'another' (어나더 일러스트)
 */
function detectIllustration(title) {
  if (!title) {
    return 'default';
  }

  // "증원"만 특별 처리해야함 -> 이 카드만 어나더 일러스트의 공식 명칭이 "섬도희Ver."임
  // 따라서 상품명에 "증원"과 "섬도희"가 모두 포함되면 어나더 일러스트로 분류
  if (/증원/i.test(title) && /섬도희/i.test(title)) {
    return 'another';
  }

  const anotherIllustrationPatterns = [
    /다른\s*일러/i,
    /신규\s*일러/i,
    /어나더\s*일러/i,
    /신\s*일러/i,
    /새\s*일러/i,
    /다른\s*일러스트/i,
    /신규\s*일러스트/i,
    /어나더\s*일러스트/i,
  ];

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
  if (/(한글판|한판)/i.test(title)) {
    return '한글판';
  }
  if (/(일본판|일어판|일판)/i.test(title)) {
    return '일본판';
  }
  if (/(영문판|영어판|영판)/i.test(title)) {
    return '영문판';
  }

  // 상품명에 언어가 없을 경우 카드 코드에서 언어 추출
  // 일반 카드 코드: XXXX-KR024 또는 어나더 일러스트 카드 코드: XXXX-KR024A
  const cardCode = /\b([A-Z0-9]{2,5})-([A-Z]{2})(\d{3,4}[A-Z]?)\b/i;
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
 * @returns {string|null} - 추출된 카드 코드 또는 null
 */
function extractCardCode(title) {
  // 일반적인 카드 코드 패턴 (예: ROTA-KR024, ROTA-KR024A)
  const standardPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2})(\d{3,4}[A-Z]?)\b/i;

  // 특수한 카드 코드 패턴 (예: SUB1-JPS07, SUB1-JPS07A)
  const specialPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2,3})([0-9A-Z]{2,4})\b/i;

  // 추가 패턴 (예: 코드가 괄호 안에 있는 경우: (ROTA-KR024), (ROTA-KR024A))
  const parenthesesPattern = /\(([A-Z0-9]{2,5})-([A-Z]{2,3})([0-9A-Z]{2,4})\)/i;

  let match = title.match(standardPattern);

  if (!match) {
    match = title.match(specialPattern);
  }

  if (!match) {
    match = title.match(parenthesesPattern);
  }

  if (match) {
    return match[0].replace(/[()]/g, '');
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
  const rarityResult = parseRarity(title);

  const language = parseLanguage(title);

  const condition = parseCondition(title);

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
 * 카드 이름을 EUC-KR로 인코딩합니다 (한국 사이트들이 EUC-KR 인코딩 사용)
 * @param {string} cardName - 검색할 카드 이름
 * @returns {string} - EUC-KR로 인코딩된 문자열(hex 형태)
 */
function encodeEUCKR(cardName) {
  try {
    // 띄어쓰기를 +로 대체
    const nameWithPlus = cardName.replace(/\s+/g, '+');

    // EUC-KR로 인코딩된 바이트 배열을 생성
    const encodedBuffer = iconv.encode(nameWithPlus.replace(/\+/g, ' '), 'euc-kr');

    // 각 바이트를 16진수로 변환하여 문자열로 만듦
    let encodedString = '';
    for (let i = 0; i < encodedBuffer.length; i++) {
      encodedString += '%' + encodedBuffer[i].toString(16).toUpperCase();
    }

    return encodedString.replace(/%2B/g, '+');
  } catch (error) {
    console.error('[ERROR] EUC-KR 인코딩 오류:', error);
    // 인코딩 실패 시 원본 문자열을 그대로 반환하되 띄어쓰기를 +로 변환
    return encodeURIComponent(cardName).replace(/%20/g, '+');
  }
}

module.exports = {
  testRarityParsing,
  parseLanguage,
  parseCondition,
  extractCardCode,
  detectIllustration,
  encodeEUCKR,
};
