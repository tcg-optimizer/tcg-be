const axios = require('axios');
require('dotenv').config();
const { searchCards } = require('./utils/naverShopApi');
const { parseRarity } = require('./utils/rarityUtil');

async function main() {
  try {
    // 명령줄 인자로부터 검색어 가져오기
    const searchTerm = process.argv[2] || "블루아이즈 화이트 드래곤";
    
    if (!searchTerm) {
      console.error('검색어를 입력해주세요.');
      process.exit(1);
    }
    
    console.log(`'${searchTerm}' 검색 결과 가져오는 중...`);
    
    // 네이버 쇼핑 API로 검색 결과 가져오기
    const apiItems = await searchCards(searchTerm);
    console.log(`API 검색 결과: ${apiItems.length}개 항목 발견`);
    
    console.log(`총 ${apiItems.length}개 항목 발견`);
    
    // 카드 정보 정리 및 레어도 분석
    const processedItems = apiItems.map(item => {
      const rarityInfo = parseRarity(item.title);
      return {
        ...item,
        ...rarityInfo
      };
    });
    
    // 가격순 정렬
    processedItems.sort((a, b) => a.lprice - b.lprice);
    
    // 결과 출력
    console.log('\n===== 검색 결과 =====');
    for (const item of processedItems) {
      console.log(`제목: ${item.title}`);
      console.log(`가격: ${item.lprice.toLocaleString()}원`);
      console.log(`레어도: ${item.rarity} (${item.rarityCode})`);
      console.log(`판매처: ${item.mallName}`);
      console.log(`링크: ${item.link}`);
      console.log('---------------------');
    }
    
  } catch (error) {
    console.error('오류 발생:', error);
  }
}

main(); 