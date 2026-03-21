function parseYugiohRarity(title) {
  const rarityPatterns = [
    {
      pattern:
        /(?=.*(?:오버\s*프레임|오버프레임|over\s*frame))(?=.*(?:프리즈마틱\s*시크릿\s*레어|프리즈마틱\s*시크릿|프리즈매틱\s*시크릿\s*레어|프리즈매틱\s*시크릿|프리즈마틱시크릿레어|프리즈매틱시크릿레어|prismatic\s*secret\s*rare|prismatic\s*secret|prismatic)).*/i,
      rarity: '오버 프레임 프리즈마틱 시크릿 레어',
    },
    {
      pattern:
        /(?=.*(?:오버\s*프레임|오버프레임|over\s*frame))(?=.*(?:울트라\s*레어|울트라레어|울트라|ultra\s*rare|ultra)).*/i,
      rarity: '오버 프레임 울트라 레어',
    },
    {
      pattern:
        /(그랜드\s*마스터\s*레어|그랜드마스터레어|grand\s*master\s*rare|grand\s*master|grandmaster\s*rare)/i,
      rarity: '그랜드 마스터 레어',
    },
    {
      pattern: /(오버\s*러시\s*레어|오버\s*러쉬\s*레어|오버러시레어|오버러시|over\s*rush\s*rare)/i,
      rarity: '오버 러시 레어',
    },
    {
      pattern:
        /(골드\s*러시\s*레어|골드\s*러쉬\s*레어|골드러시레어|골드러쉬레어|gold\s*rush\s*rare)/i,
      rarity: '골드 러시 레어',
    },
    {
      pattern: /(러시\s*레어|러쉬\s*레어|러시레어|러쉬레어|rush\s*rare)/i,
      rarity: '러시 레어',
    },
    {
      pattern: /(엑스트라\s*시크릿\s*레어|엑스트라시크릿레어|엑스트라\s*씨그릿|엑시크|extra\s*secret\s*rare)/i,
      rarity: '엑스트라 시크릿 레어',
    },
    {
      pattern: /(20th\s*시크릿\s*레어|20시크릿\s*레어|20th\s*secret\s*rare)/i,
      rarity: '20th 시크릿 레어',
    },
    {
      pattern:
        /(QC\s*시크릿\s*레어|25th\s*시크릿\s*레어|쿼터\s*센추리\s*시크|쿼터\s*센츄리\s*시크|쿼터\s*센츄리얼\s*시크릿\s*레어|QC\s*쿼터\s*시크릿\s*레어|QC시크릿레어|쿼터\s*시크릿|Qc\s*레어|쿼터\s*센츄리\s*시크릿\s*레어|quarter\s*century\s*secret\s*rare|QC\s*secret\s*rare)/i,
      rarity: '쿼터 센츄리 시크릿 레어',
    },
    {
      pattern:
        /(홀로그래픽\s*레어|홀로\s*레어|홀로그래픽레어|홀로레어|holographic\s*rare|holographic|holo\s*rare|홀로)/i,
      rarity: '홀로그래픽 레어',
    },
    {
      pattern:
        /(프리즈마틱\s*시크릿\s*레어|프리즈매틱\s*시크릿\s*레어|프리즈머틱시크릿레어|프리즈마틱씨크릿레어|프리즈마틱시크릿레어|프리즈매틱시크릿레어|prismatic\s*secret\s*rare|프리즈마틱\s*시크릿|프리즈매틱\s*시크릿|prismatic|Prismatic)/i,
      rarity: '프리즈마틱 시크릿 레어',
    },
    {
      pattern:
        /(골드\s*시크릿\s*레어|골드시크릿레어|골시크|gold\s*secret\s*rare|골드\s*secret\s*레어)/i,
      rarity: '골드 시크릿 레어',
    },
    {
      pattern:
        /(블루\s*시크릿\s*레어|블루시크릿레어|블루\s*시크|blue\s*secret\s*rare|블루\s*secret\s*레어|special\s*blue\s*ver|스페셜\s*블루)/i,
      rarity: '블루 시크릿 레어',
    },
    {
      pattern:
        /(레드\s*시크릿\s*레어|레드시크릿레어|레드\s*시크|red\s*secret\s*rare|레드\s*secret\s*레어|special\s*red\s*ver|스페셜\s*레드)/i,
      rarity: '레드 시크릿 레어',
    },
    {
      pattern: /(밀레니엄\s*레어|밀레니엄레어|millennium\s*rare|millennium)/i,
      rarity: '밀레니엄 레어',
    },
    {
      pattern: /(시크릿\s*레어|씨크릿|시크릿레어|\[시크릿\]|secret\s*rare|secret)/i,
      rarity: '시크릿 레어',
    },
    {
      pattern: /(울트라\s*레어|울트라레어|울트|울트라|울레|ultra\s*rare|ultra)/i,
      rarity: '울트라 레어',
    },
    {
      pattern: /(슈퍼\s*레어|슈퍼레어|수퍼\s*레어|슈레|\[슈퍼\]|super\s*rare|super)/i,
      rarity: '슈퍼 레어',
    },
    {
      pattern:
        /(컬렉터즈\s*레어|컬렉터스\s*레어|컬렉터즈레어|컬렉터스레어|컬렉터|collector'?s?\s*rare|collecters|collector'?s?)/i,
      rarity: '컬렉터즈 레어',
    },
    {
      pattern:
        /(얼티미트\s*레어|얼티메이트\s*레어|얼티미트레어|얼티메이트레어|얼티밋\s*레어|얼티밋레어|\[얼티\]|ultimate\s*rare|ultimate)/i,
      rarity: '얼티미트 레어',
    },
    {
      pattern:
        /(패러렐\s*레어|패러럴\s*레어|페러렐\s*레어|패레렐\s*레어|페러럴\s*레어|페레럴\s*레어|패러렐레어|패러럴레어|\[페러렐\]|parallel\s*rare)/i,
      rarity: '패러렐 레어',
    },
    {
      pattern:
        /(프리미엄\s*골드\s*레어|프리미엄골드레어|프리미엄\s*골드|premium\s*gold\s*rare|premium\s*gold)/i,
      rarity: '프리미엄 골드 레어',
    },
    { pattern: /(골드\s*레어|골드레어|gold\s*rare)/i, rarity: '골드 레어' },
    { pattern: /(노멀|노멀레어|normal|노말)/i, rarity: '노멀' },
    { pattern: /(레어|rare)/i, rarity: '레어' },
  ];

  for (const { pattern, rarity } of rarityPatterns) {
    if (pattern.test(title)) {
      return rarity;
    }
  }

  return '알 수 없음';
}

function parseVanguardRarity(title) {
  const rarityPatterns = [
    { pattern: /(PR)/i, rarity: 'PR' },
    { pattern: /(SER)/i, rarity: 'SER' },
    { pattern: /(GCR)/i, rarity: 'GCR' },
    { pattern: /(CR)/i, rarity: 'CR' },
    { pattern: /(SSP)/i, rarity: 'SSP' },
    { pattern: /(RGR)/i, rarity: 'RGR' },
    { pattern: /(SKR)/i, rarity: 'SKR' },
    { pattern: /(MSR)/i, rarity: 'MSR' },
    { pattern: /(TRR)/i, rarity: 'TRR' },
    { pattern: /(EXRRR)/i, rarity: 'EXRRR' },
    { pattern: /(EXC)/i, rarity: 'EXC' },
    { pattern: /(EXS)/i, rarity: 'EXS' },
    { pattern: /(EXP)/i, rarity: 'EXP' },
    { pattern: /(EX)/i, rarity: 'EX' },
    { pattern: /(Re\+)/i, rarity: 'Re+' },
    { pattern: /(Re)/i, rarity: 'Re' },
    { pattern: /(LSP)/i, rarity: 'LSP' },
    { pattern: /(LSR)/i, rarity: 'LSR' },
    { pattern: /(SIR)/i, rarity: 'SIR' },
    { pattern: /(SNR)/i, rarity: 'SNR' },
    { pattern: /(SECP)/i, rarity: 'SECP' },
    { pattern: /(SECV)/i, rarity: 'SECV' },
    { pattern: /(SEC)/i, rarity: 'SEC' },
    { pattern: /(SSR)/i, rarity: 'SSR' },
    { pattern: /(WO)/i, rarity: 'WO' },
    { pattern: /(DSR)/i, rarity: 'DSR' },
    { pattern: /(SR)/i, rarity: 'SR' },
    { pattern: /(SP)/i, rarity: 'SP' },
    { pattern: /(FFR)/i, rarity: 'FFR' },
    { pattern: /(ORRR)/i, rarity: 'ORRR' },
    { pattern: /(RRR)/i, rarity: 'RRR' },
    { pattern: /(ORR)/i, rarity: 'ORR' },
    { pattern: /(RR)/i, rarity: 'RR' },
    { pattern: /(FR)/i, rarity: 'FR' },
    { pattern: /(SH)/i, rarity: 'SH' },
    { pattern: /\b(H)\b/i, rarity: 'H' },
    { pattern: /\b(R)\b/i, rarity: 'R' },
    { pattern: /\b(TD)\b/i, rarity: 'TD' },
    { pattern: /\b(C)\b/i, rarity: 'C' },
  ];
  
  for (const { pattern, rarity } of rarityPatterns) {
    if (pattern.test(title)) {
      return rarity;
    }
  }

  return '알 수 없음';
}

function parseOnepieceRarity(title) {
  const text = String(title || '').trim();

  // 코드 뒤에 레어도를 붙여 표기하는 케이스 (예: OP10-071SR, OP02-KR056UC)
  const codeAttachedRarityMatch = text.match(
    /\b[A-Z]{1,4}-?\d{1,2}-(?:(?:KR|JP|EN)-?)?\d{3}(PP|SEC|SR|SP|TR|UC|L|R|C)\b/i
  );
  if (codeAttachedRarityMatch && codeAttachedRarityMatch[1]) {
    return codeAttachedRarityMatch[1].toUpperCase();
  }

  const rarityPatterns = [
    {
      pattern: /(\bTR\b|\[TR\]|\(TR\)|트레저\s*레어|treasure\s*rare)/i,
      rarity: 'TR',
    },
    {
      pattern: /(\bSEC\+?\b|\[SEC\+?\]|\(SEC\+?\)|시크릿\s*레어|시크레|secret\s*rare)/i,
      rarity: 'SEC',
    },
    {
      pattern: /(\bSP\b|\[SP\]|\(SP\)|스페셜\s*카드|special\s*card)/i,
      rarity: 'SP',
    },
    {
      pattern: /(\bL\b|\[L\]|\(L\)|리더|leader)/i,
      rarity: 'L',
    },
    {
      pattern: /(\bSR\b|\[SR\]|\(SR\)|슈퍼\s*레어|수퍼\s*레어|슈레|super\s*rare)/i,
      rarity: 'SR',
    },
    {
      pattern: /(\bUC\b|\[UC\]|\(UC\)|언커먼|uncommon)/i,
      rarity: 'UC',
    },
    {
      pattern: /(\bC\b|\[C\]|\(C\)|커먼|common)/i,
      rarity: 'C',
    },
    {
      pattern: /(\bR\b|\[R\]|\(R\)|레어|rare)/i,
      rarity: 'R',
    },
  ];

  for (const { pattern, rarity } of rarityPatterns) {
    if (pattern.test(text)) {
      return rarity;
    }
  }

  return '알 수 없음';
}

function normalizeRarity(rarity, options = {}) {
  const { gameType = 'yugioh', cardCode = null } = options;
  const normalizedRarity = rarity || '알 수 없음';

  // 원피스는 레어도만 누락되고 카드 코드는 파싱된 경우 커먼(C)으로 간주
  if (gameType === 'onepiece' && normalizedRarity === '알 수 없음' && cardCode) {
    return 'C';
  }

  return normalizedRarity;
}

// 게임 타입에 따라 레어도 파싱
function parseRarity(title, gameType = 'yugioh') {
  switch (gameType) {
    case 'vanguard':
      return parseVanguardRarity(title);
    case 'onepiece':
      return parseOnepieceRarity(title);
    default:
      return parseYugiohRarity(title);
  }
}

module.exports = {
  parseRarity,
  normalizeRarity,
  parseYugiohRarity,
  parseVanguardRarity,
  parseOnepieceRarity,
};
