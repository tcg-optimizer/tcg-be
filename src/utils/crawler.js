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

// 유희왕 언어 파싱
function parseYugiohLanguage(title) {
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

// 뱅가드 언어 파싱
function parseVanguardLanguage(title) {
  // 상품명에 언어가 명시된 경우
  if (/(한글판|한판)/i.test(title)) {
    return '한글판';
  }
  if (/(일본판|일판)/i.test(title)) {
    return '일본판';
  }

  // 뱅가드 카드 코드에서 언어 추출
  const langPatterns = [
    // D-PR-KR262, D-PR-KR239 (가장 일반적인 패턴)
    /\b[A-Z]{1,2}-[A-Z]{2,4}-(KR|JP|EN)\d{2,4}\b/i,
    // DZ-SS07-KRFFR03, DZ-SS07-KRRe38
    /\b[A-Z]{1,2}-[A-Z]{2,4}\d{2}-(KR|JP|EN)[A-Z]{2,4}\d{2}\b/i,
    // DZ-SS01-D-PR-KR262 (복합 패턴)
    /\b[A-Z]{1,2}-[A-Z]{2,4}\d{2}-[A-Z]{1,2}-[A-Z]{2,4}-(KR|JP|EN)\d{2,4}\b/i,
    // (D-PR-KR262) - 괄호 안의 패턴
    /\([A-Z]{1,2}-[A-Z]{2,4}-(KR|JP|EN)\d{2,4}\)/i,
    // (DZ-SS07-KRFFR03) - 괄호 안의 복잡한 패턴
    /\([A-Z]{1,2}-[A-Z]{2,4}\d{2}-(KR|JP|EN)[A-Z]{2,4}\d{2}\)/i,
    // (D-SS06-PR/KR239) - 특수 복합
    /\([A-Z]{1,2}-[A-Z]{2,4}\d{2}-[A-Z]{2,4}\/(KR|JP|EN)\d/i,
    // D-PR/262KR, DZ-SS07/Re38KR
    /[\/\-]([A-Z]*\d{1,4}[A-Z]*)(KR|JP|EN)\b/i,
    // DZ-BT09/EX01 KR
    /[\/\-][A-Z]+\d{1,4}\s+(KR|JP|EN)\b/i,
    // DZ-BT09-KREX01
    /\b[A-Z]{1,2}-?[A-Z]{2,4}\d{2}-?(KR|JP|EN)/i,
  ];

  for (const pattern of langPatterns) {
    const match = title.match(pattern);
    if (match) {
      // 매칭 그룹에서 언어 코드 추출
      const langCode = match[match.length - 1].toUpperCase();
      
      switch (langCode) {
        case 'KR':
          return '한글판';
        case 'JP':
          return '일본판';
        default:
          return '알 수 없음';
      }
    }
  }

  return '알 수 없음';
}

// 게임 타입에 따라 언어 파싱
function parseLanguage(title, gameType = 'yugioh') {
  if (gameType === 'vanguard') {
    return parseVanguardLanguage(title);
  }
  return parseYugiohLanguage(title);
}

// 유희왕 카드 코드 추출
function extractYugiohCardCode(title) {
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

// 뱅가드 카드 코드 추출
function extractVanguardCardCode(title) {
  // 패턴들을 우선순위 순서로 정의
  const patterns = [
    // 패턴 0: (D-SS06-PR/KR239) - 특수 복합 패턴
    {
      regex: /\([A-Z]{1,2}-[A-Z]{2,4}\d{2}-([A-Z]{2,4})\/(KR|JP|EN)(\d{1,4})\)/i,
      handler: (m) => `D-${m[1]}/${m[3]} ${m[2]}`
    },
    // 패턴 1: (D-SS06-D-PR-239KR) - 복합 세트 코드
    {
      regex: /\([A-Z]{1,2}-[A-Z]{2,4}\d{2}-([A-Z]{1,2})-([A-Z]{2,4})-(\d{1,4})(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]} ${m[4]}`
    },
    // 패턴 1-1: DZ-SS01/D-PR-262KR - 슬래시로 두 코드 나열
    {
      regex: /[A-Z]{1,2}-[A-Z]{2,4}\d{2}\/([A-Z]{1,2})-([A-Z]{2,4})-(\d{1,4})(KR|JP|EN)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]} ${m[4]}`
    },
    // 패턴 2: (DZ-SS07-KRFFR03) - 괄호 안, 하이픈, 언어+카드번호(문자로 시작)
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-(KR|JP|EN)([A-Z]+\d{1,4})\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[5]} ${m[4]}`
    },
    // 패턴 3: (DZ-SS07-Re38KR) - 괄호 안, 하이픈, 카드번호+언어코드
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-([A-Z]+\d{1,4})(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 4: (D-PR-KR262) - 괄호 안, 언어코드가 숫자 앞에
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})-(KR|JP|EN)(\d{1,4})\)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[4]} ${m[3]}`
    },
    // 패턴 5: (D-PR-262KR) - 괄호 안, 하이픈, 언어코드 붙음
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})-([A-Z]*\d{1,4}[A-Z]*)(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]} ${m[4]}`
    },
    // 패턴 6: (D-PR/262KR) - 괄호 안, 슬래시, 언어코드 붙음
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})[\/]([A-Z]*\d{1,4}[A-Z]*)(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]} ${m[4]}`
    },
    // 패턴 6-1: (DZ-BT09/100KR) - 괄호 안, 슬래시, 숫자만 있는 카드번호+언어코드
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/](\d{2,4})(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 6-2: DZ-BT08/038KR - 괄호 없이, 슬래시, 숫자+언어코드 (3자리 숫자)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/](\d{3})(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 6-3: DZ-BT09/035 KR - 괄호 없이, 슬래시, 공백, 언어코드
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/](\d{3})\s+(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 7: (DZ-BT09/035) - 괄호 안, 슬래시, 3자리 숫자, 언어코드 없음
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/](\d{3})\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]}`
    },
    // 패턴 7-1: (D-PR/262) - 괄호 안, 슬래시, 언어코드 없음 (기존)
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})[\/]([A-Z]*\d{1,4}[A-Z]*)\)/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]}`
    },
    // 패턴 8: DZ-SS07/Re38KR - 슬래시, 언어코드 붙음
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/]([A-Z]+\d{1,4})(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 9: DZ-SS07/Re38 KR - 슬래시, 공백, 언어코드
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/]([A-Z]+\d{1,4})\s+(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 10: DZ-BT09/035 - 슬래시, 3자리 숫자, 언어코드 없음
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/](\d{3})\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]}`
    },
    // 패턴 10-1: DZ-SS07/FFR03 - 슬래시, 언어코드 없음 (일본판 기본)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})[\/]([A-Z]+\d{1,4})\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]}`
    },
    // 패턴 11: D-PR/262KR - 슬래시, 언어코드 붙음 (괄호 없음)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})[\/]([A-Z]*\d{1,4}[A-Z]*)(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}/${m[3]} ${m[4]}`
    },
    // 패턴 12: DZBT09-Re38 - 하이픈 없이 시작, 문자로 시작하는 카드번호
    {
      regex: /\b([A-Z]{1,2})([A-Z]{2,4})(\d{2})-([A-Z]+\d{1,4})\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]}`
    },
    // 패턴 13: (DZ-BT09-035KR) - 괄호 안, 하이픈, 숫자+언어코드
    {
      regex: /\(([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-(\d{3})(KR|JP|EN)\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 13-1: (DZ-BT09-KREX01) - 기존 패턴 (숫자로 시작)
    {
      regex: /\(([A-Z]{1,2})-?([A-Z]{2,4})(\d{2})-?(KR|JP|EN)?([A-Z]{0,2}\d{2,4}[A-Z]?)\)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[5]}${m[4] ? ` ${m[4]}` : ''}`
    },
    // 패턴 14: DZ-BT09-KREX01 - 괄호 없는 기존 패턴
    {
      regex: /\b([A-Z]{1,2})-?([A-Z]{2,4})(\d{2})-?(KR|JP|EN)?([A-Z]{0,2}\d{2,4}[A-Z]?)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[5]}${m[4] ? ` ${m[4]}` : ''}`
    },
    
    // 새로 추가된 패턴들
    // 패턴 15: DZ-BT07 / 004KR - 공백과 슬래시가 있는 패턴
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})\s*\/\s*(\d{3})(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 16: DZ-BT07 / 004 / RRR / 한글판 - 여러 슬래시로 구분된 패턴
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})\s*\/\s*(\d{3})\s*\/\s*[A-Z]+\s*\/\s*(한글판|일본판|영문판)/i,
      handler: (m) => {
        const lang = m[5] === '한글판' ? 'KR' : m[5] === '일본판' ? 'JP' : 'EN';
        return `${m[1]}-${m[2]}${m[3]}/${m[4]} ${lang}`;
      }
    },
    // 패턴 17: = 기호로 연결된 카드명과 코드 (쌍성각희 아스트로아 = 바이코 스텔라 / DZ-BT07 / 004KR)
    {
      regex: /=.*?\/\s*([A-Z]{1,2})-([A-Z]{2,4})(\d{2})\s*\/\s*(\d{3})(KR|JP|EN)/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
    // 패턴 18: 카드명 뒤에 바로 오는 코드 (쌍성각희 아스트로아 바이코 스텔라 / DZ-BT07 / 004 / RRR / 일본판)
    {
      regex: /\/\s*([A-Z]{1,2})-([A-Z]{2,4})(\d{2})\s*\/\s*(\d{3})\s*\/\s*[A-Z]+\s*\/\s*(한글판|일본판|영문판)/i,
      handler: (m) => {
        const lang = m[5] === '한글판' ? 'KR' : m[5] === '일본판' ? 'JP' : 'EN';
        return `${m[1]}-${m[2]}${m[3]}/${m[4]} ${lang}`;
      }
    },
    // 패턴 19: 단순한 3자리 숫자 코드 (004KR, 004)
    {
      regex: /\b(\d{3})(KR|JP|EN)?\b/i,
      handler: (m) => m[2] ? `${m[1]} ${m[2]}` : m[1]
    },
    // 패턴 20: 괄호 없이 하이픈으로 구분된 긴 패턴 (D-SS06-PR-KR239)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-([A-Z]{2,4})-(KR|JP|EN)(\d{1,4})\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}-${m[4]}/${m[6]} ${m[5]}`
    },
    // 패턴 21: 복잡한 하이픈 구조 (D-SS06-D-PR-KR239)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-([A-Z]{1,2})-([A-Z]{2,4})-(KR|JP|EN)(\d{1,4})\b/i,
      handler: (m) => `${m[4]}-${m[5]}/${m[7]} ${m[6]}`
    },
    // 패턴 22: 언어가 앞에 오는 패턴 (KR 004, JP 035)
    {
      regex: /\b(KR|JP|EN)\s+(\d{3})\b/i,
      handler: (m) => `${m[2]} ${m[1]}`
    },
    // 패턴 23: 세트명이 포함된 복합 패턴 (DZ-BT07-004KR, DZ-SS07-Re38KR 등)
    {
      regex: /\b([A-Z]{1,2})-([A-Z]{2,4})(\d{2})-([A-Z]*\d{2,4}[A-Z]*)(KR|JP|EN)\b/i,
      handler: (m) => `${m[1]}-${m[2]}${m[3]}/${m[4]} ${m[5]}`
    },
  ];

  for (const { regex, handler } of patterns) {
    const match = title.match(regex);
    if (match) {
      const normalized = handler(match);
      return normalized.trim();
    }
  }

  return null;
}

// 게임 타입에 따라 카드 코드 추출
function extractCardCode(title, gameType = 'yugioh') {
  if (gameType === 'vanguard') {
    return extractVanguardCardCode(title);
  }
  return extractYugiohCardCode(title);
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
