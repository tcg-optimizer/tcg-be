const { parseRarity } = require('./rarityUtil');
const iconv = require('iconv-lite');

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
    /\(신\)/i,
  ];

  for (const pattern of anotherIllustrationPatterns) {
    if (pattern.test(title)) {
      return 'another';
    }
  }

  return 'default';
}

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

function extractCardCode(title) {
  // 일반적인 카드 코드 패턴 (예: ROTA-KR024, ROTA-KR024A)
  const standardPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2})(\d{3,4}[A-Z]?)\b/i;

  // 특수한 카드 코드 패턴 (예: SUB1-JPS07, SUB1-JPS07A)
  const specialPattern = /\b([A-Z0-9]{2,5})-([A-Z]{2,3})([0-9A-Z]{2,4})\b/i;

  // 카드 코드가 괄호 안에 있는 패턴 (예: (ROTA-KR024), (ROTA-KR024A))
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

function encodeEUCKR(cardName) {
  try {
    // 띄어쓰기를 +로 대체 - CardDC에서의 검색을 위함
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
    return encodeURIComponent(cardName).replace(/%20/g, '+');
  }
}

module.exports = {
  parseLanguage,
  parseCondition,
  extractCardCode,
  detectIllustration,
  encodeEUCKR,
};
