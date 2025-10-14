const { extractCardCode, parseLanguage } = require('./src/utils/crawler');
const { parseRarity } = require('./src/utils/rarityUtil');

const testCases = [
  { title: '카드파이트뱅가드 한글판 염의무녀신디 Re DZSS07-Re38', expectedCode: 'DZ-SS07/Re38', expectedLang: '한글판', expectedRarity: 'Re' },
  { title: '염의무녀신디 (D-PR/262KR) PR 한글판 뱅가드', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '염의무녀신디 (D-PR-262KR) PR', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '염의무녀신디 (DZ-SS07-KRRe38) Re+ 페스티벌부스터2025 한글판 뱅가드', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '염의 무녀 신디 (DZ-SS07-Re38KR) Re+', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '염의무녀신디 (DZ-SS07/Re38KR) Re+ 한글판 뱅가드', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '염의무녀신디 / DZ-SS01/D-PR-262KR', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '염의 무녀 신디 (D-PR-KR262) PR (DZ-SS01 수록)', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '[뱅가드카드][한글판] 염의 무녀 신디 Re+ / 페스티벌 부스터 2025 DZ-SS11/Re38KR', expectedCode: 'DZ-SS11/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '염의무녀신디 | (D-PR-KR262) | PR', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '염의무녀신디 (DZ-SS07-FFR03KR) FFR', expectedCode: 'DZ-SS07/FFR03 KR', expectedLang: '한글판', expectedRarity: 'FFR' },
  { title: '염의무녀신디 (DZ-SS07/FFR03KR) FFR 한글판 뱅가드', expectedCode: 'DZ-SS07/FFR03 KR', expectedLang: '한글판', expectedRarity: 'FFR' },
  { title: '염의무녀신디 (D-SS06-D-PR-239KR) PR', expectedCode: 'D-PR/239 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '(한) D-PR/262KR 염의 무녀 신디 / 페스티벌 2024', expectedCode: 'D-PR/262 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '염의무녀신디 DZ-SS07/Re38KR', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re' },
  { title: '염의무녀신디 (DZ-SS07-KRRe38) Re+', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '(한글판) DZ-SS07/Re38KR Re+ 염의 무녀 신디 / 페스티벌 2025', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '(일판) DZ-SS11/FFR03 FFR 염의 무녀 신디 / 페스티발 2025', expectedCode: 'DZ-SS11/FFR03', expectedLang: '일본판', expectedRarity: 'FFR' },
  { title: '카드파이터!!뱅가드 - 염의무녀신디(DZ-SS07-KRRe38) - Re+', expectedCode: 'DZ-SS07/Re38 KR', expectedLang: '한글판', expectedRarity: 'Re+' },
  { title: '염의무녀신디 (DZ-SS07-KRFFR03) FFR', expectedCode: 'DZ-SS07/FFR03 KR', expectedLang: '한글판', expectedRarity: 'FFR' },
  { title: '염의무녀신디 (D-SS06-PR/KR239) PR', expectedCode: 'D-PR/239 KR', expectedLang: '한글판', expectedRarity: 'PR' },
  { title: '서징어솔트 (DZ-BT09/100KR) C 한글판 뱅가드', expectedCode: 'DZ-BT09/100 KR', expectedLang: '한글판', expectedRarity: 'C' },
  { title: '계승의성무기사세리우스 (DZ-BT09/097KR) C 한글판 뱅가드', expectedCode: 'DZ-BT09/097 KR', expectedLang: '한글판', expectedRarity: 'C' },
];

console.log('=== 뱅가드 카드 파싱 테스트 ===\n');

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  const { title, expectedCode, expectedLang, expectedRarity } = testCase;
  
  console.log(`테스트 케이스 ${index + 1}:`);
  console.log(`원본: ${title}`);
  
  const cardCode = extractCardCode(title, 'vanguard');
  const language = parseLanguage(title, 'vanguard');
  const rarity = parseRarity(title, 'vanguard');
  
  console.log(`카드 코드: ${cardCode || '추출 실패'}`);
  console.log(`언어: ${language}`);
  console.log(`레어도: ${rarity}`);
  
  // 결과 검증
  const codeMatch = cardCode === expectedCode;
  const langMatch = language === expectedLang;
  const rarityMatch = rarity === expectedRarity;
  
  if (codeMatch && langMatch && rarityMatch) {
    console.log('✅ 통과');
    passCount++;
  } else {
    console.log('❌ 실패');
    if (!codeMatch) console.log(`  - 카드 코드 불일치: 예상 "${expectedCode}", 실제 "${cardCode}"`);
    if (!langMatch) console.log(`  - 언어 불일치: 예상 "${expectedLang}", 실제 "${language}"`);
    if (!rarityMatch) console.log(`  - 레어도 불일치: 예상 "${expectedRarity}", 실제 "${rarity}"`);
    failCount++;
  }
  
  console.log('---\n');
});

console.log(`\n=== 테스트 결과 ===`);
console.log(`✅ 통과: ${passCount}/${testCases.length}`);
console.log(`❌ 실패: ${failCount}/${testCases.length}`);
console.log(`성공률: ${((passCount / testCases.length) * 100).toFixed(1)}%`);

