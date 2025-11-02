#!/usr/bin/env node

/**
 * Cloudflare WARP 프록시 테스트 스크립트
 * 
 * 사용법:
 * 1. WARP 없이 테스트: node test-warp.js
 * 2. WARP 사용 테스트: USE_WARP_PROXY=true node test-warp.js
 */

const { crawlCardDC } = require('./src/utils/cardDCCrawler');

async function testCardDCCrawl() {
  const testCardName = '하루우라라';
  
  console.log('='.repeat(60));
  console.log('CardDC 크롤링 테스트');
  console.log('='.repeat(60));
  console.log(`카드명: ${testCardName}`);
  console.log(`WARP 프록시: ${process.env.USE_WARP_PROXY === 'true' ? '활성화' : '비활성화'}`);
  if (process.env.USE_WARP_PROXY === 'true') {
    console.log(`프록시 URL: ${process.env.WARP_PROXY_URL || 'socks5://127.0.0.1:40000'}`);
  }
  console.log('='.repeat(60));
  console.log('');
  
  const startTime = Date.now();
  
  try {
    console.log('크롤링 시작...');
    const results = await crawlCardDC(testCardName, null);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ 크롤링 성공!');
    console.log('='.repeat(60));
    console.log(`소요 시간: ${duration}ms`);
    console.log(`검색 결과: ${results.length}개`);
    console.log('');
    
    if (results.length > 0) {
      console.log('첫 3개 결과:');
      results.slice(0, 3).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.title}`);
        console.log(`   가격: ${item.price.toLocaleString()}원`);
        console.log(`   레어도: ${item.rarity}`);
        console.log(`   언어: ${item.language}`);
        console.log(`   상태: ${item.condition}`);
        console.log(`   URL: ${item.url}`);
      });
    }
    
    console.log('');
    console.log('='.repeat(60));
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ 크롤링 실패!');
    console.log('='.repeat(60));
    console.log(`소요 시간: ${duration}ms`);
    console.log(`에러 메시지: ${error.message}`);
    
    if (error.response) {
      console.log(`HTTP 상태 코드: ${error.response.status}`);
      console.log(`HTTP 상태 메시지: ${error.response.statusText}`);
    }
    
    console.log('');
    console.log('에러 스택:');
    console.log(error.stack);
    console.log('='.repeat(60));
    
    process.exit(1);
  }
}

console.log('\n');
testCardDCCrawl();

