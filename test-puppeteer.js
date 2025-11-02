#!/usr/bin/env node

/**
 * Puppeteer를 사용한 CardDC 크롤링 테스트 스크립트
 * 
 * 사용법:
 * node test-puppeteer.js
 */

const { crawlCardDCPuppeteer, closeBrowser } = require('./src/utils/cardDCCrawlerPuppeteer');

async function testPuppeteerCrawl() {
  const testCardName = '하루우라라';
  
  console.log('='.repeat(60));
  console.log('Puppeteer를 사용한 CardDC 크롤링 테스트');
  console.log('='.repeat(60));
  console.log(`카드명: ${testCardName}`);
  console.log(`방식: 실제 Chrome 브라우저 사용`);
  console.log('='.repeat(60));
  console.log('');
  
  const startTime = Date.now();
  
  try {
    console.log('크롤링 시작... (브라우저 로딩 중)');
    const results = await crawlCardDCPuppeteer(testCardName, null);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ 크롤링 성공!');
    console.log('='.repeat(60));
    console.log(`소요 시간: ${duration}ms (${(duration / 1000).toFixed(2)}초)`);
    console.log(`검색 결과: ${results.length}개`);
    console.log('');
    
    if (results.length > 0) {
      console.log('첫 5개 결과:');
      results.slice(0, 5).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.title}`);
        console.log(`   가격: ${item.price.toLocaleString()}원`);
        console.log(`   레어도: ${item.rarity}`);
        console.log(`   언어: ${item.language}`);
        console.log(`   상태: ${item.condition}`);
        console.log(`   카드코드: ${item.cardCode || 'N/A'}`);
        console.log(`   URL: ${item.url}`);
      });
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 Puppeteer vs axios 비교:');
    console.log('   - axios (WARP): ~500ms, 403 차단');
    console.log(`   - Puppeteer: ${duration}ms, 성공!`);
    console.log('');
    console.log('✨ Puppeteer는 느리지만 차단을 우회할 수 있습니다!');
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
    console.log('');
    console.log('에러 스택:');
    console.log(error.stack);
    console.log('='.repeat(60));
    
    process.exit(1);
  } finally {
    // 브라우저 정리
    await closeBrowser();
  }
}

console.log('\n');
testPuppeteerCrawl();

