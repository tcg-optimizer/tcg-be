/**
 * rarityUtil.js
 *
 * 카드 레어도 파싱을 위한 유틸리티 함수
 */

/**
 * 카드 레어도를 파싱하고 표준화된 코드를 반환합니다.
 * @param {string} title - 상품 제목
 * @returns {Object} - 파싱된 레어도 정보 {rarity, rarityCode}
 */
function parseRarity(title) {
  // 레어도 우선순위(더 구체적인 것이 먼저 매칭되도록)
  const rarityPatterns = [
    {
      pattern: /(오버\s*러시\s*레어|오버\s*러쉬\s*레어|오버러시레어|오버러시|over\s*rush\s*rare)/i,
      rarity: '오버 러시 레어',
      code: 'ORR',
    },
    {
      pattern:
        /(골드\s*러시\s*레어|골드\s*러쉬\s*레어|골드러시레어|골드러쉬레어|gold\s*rush\s*rare)/i,
      rarity: '골드 러시 레어',
      code: 'GRR',
    },
    {
      pattern: /(러시\s*레어|러쉬\s*레어|러시레어|러쉬레어|rush\s*rare)/i,
      rarity: '러시 레어',
      code: 'RR',
    },
    {
      pattern: /(엑스트라\s*시크릿\s*레어|엑스트라시크릿레어|엑시크|extra\s*secret\s*rare)/i,
      rarity: '엑스트라 시크릿 레어',
      code: 'EXSE',
    },
    {
      pattern:
        /(20th\s*시크릿\s*레어|20시크릿\s*레어|20th\s*secret\s*rare|twentieth\s*secret\s*rare)/i,
      rarity: '20th 시크릿 레어',
      code: '20th SE',
    },
    {
      pattern:
        /(QC\s*시크릿\s*레어|쿼터\s*센추리\s*시크|쿼터\s*센츄리\s*시크|QC\s*쿼터\s*시크릿\s*레어|QC시크릿레어|쿼터\s*시크릿|쿼터\s*센츄리\s*시크릿\s*레어|quarter\s*century\s*secret\s*rare|QC\s*secret\s*rare)/i,
      rarity: '쿼터 센츄리 시크릿 레어',
      code: 'QCSE',
    },
    {
      pattern:
        /(홀로그래픽\s*레어|홀로\s*레어|홀로그래픽레어|홀로레어|holographic\s*rare|holographic|holo\s*rare|홀로)/i,
      rarity: '홀로그래픽 레어',
      code: 'HR',
    },
    {
      pattern:
        /(프리즈마틱\s*시크릿\s*레어|프리즈매틱\s*시크릿\s*레어|프리즈머틱시크릿레어|프리즈마틱시크릿레어|프리즈매틱시크릿레어|prismatic\s*secret\s*rare|프리즈마틱\s*시크릿|프리즈매틱\s*시크릿|prismatic|Prismatic)/i,
      rarity: '프리즈마틱 시크릿 레어',
      code: 'PSE',
    },
    {
      pattern:
        /(골드\s*시크릿\s*레어|골드시크릿레어|골시크|gold\s*secret\s*rare|골드\s*secret\s*레어)/i,
      rarity: '골드 시크릿 레어',
      code: 'GSE',
    },
    {
      pattern:
        /(밀레니엄\s*레어|밀\s*레어|밀레니엄레어|밀레어|밀레니엄|millennium\s*rare|millennium)/i,
      rarity: '밀레니엄 레어',
      code: 'M',
    },
    {
      pattern: /(시크릿\s*레어|시크릿레어|\[시크릿\]|secret\s*rare|secret)/i,
      rarity: '시크릿 레어',
      code: 'SE',
    },
    {
      pattern: /(울트라\s*레어|울트라레어|울트|울트라|울레|ultra\s*rare|ultra)/i,
      rarity: '울트라 레어',
      code: 'UR',
    },
    {
      pattern: /(슈퍼\s*레어|슈퍼레어|수퍼\s*레어|슈레|\[슈퍼\]|super\s*rare|super)/i,
      rarity: '슈퍼 레어',
      code: 'SR',
    },
    {
      pattern:
        /(컬렉터즈\s*레어|컬렉터스\s*레어|컬렉터즈레어|컬렉터스레어|컬렉터|collector'?s?\s*rare|collector'?s?)/i,
      rarity: '컬렉터즈 레어',
      code: 'CR',
    },
    {
      pattern:
        /(얼티미트\s*레어|얼티메이트\s*레어|얼티미트레어|얼티메이트레어|얼티밋\s*레어|얼티밋레어|\[얼티\]|ultimate\s*rare|ultimate)/i,
      rarity: '얼티미트 레어',
      code: 'UL',
    },
    {
      pattern:
        /(패러렐\s*레어|패러럴\s*레어|페러렐\s*레어|패레렐\s*레어|패러렐레어|패러럴레어|\[페러렐\]|parallel\s*rare)/i,
      rarity: '패러렐 레어',
      code: 'P',
    },
    {
      pattern:
        /(프리미엄\s*골드\s*레어|프리미엄골드레어|프리미엄\s*골드|premium\s*gold\s*rare|premium\s*gold)/i,
      rarity: '프리미엄 골드 레어',
      code: 'PG',
    },
    { pattern: /(골드\s*레어|골드레어|gold\s*rare)/i, rarity: '골드 레어', code: 'GR' },

    // 기본 레어도
    { pattern: /(노멀|노멀레어|normal|노말)/i, rarity: '노멀', code: 'N' },
    { pattern: /(?<![가-힣\w])(레어|rare)(?![가-힣\w])/i, rarity: '레어', code: 'R' },
  ];

  // 일반 패턴 매칭
  for (const { pattern, rarity, code } of rarityPatterns) {
    if (pattern.test(title)) {
      return { rarity, rarityCode: code };
    }
  }

  // 기본값
  return { rarity: '알 수 없음', rarityCode: 'UNK' };
}

module.exports = {
  parseRarity,
};
