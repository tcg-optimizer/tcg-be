require('dotenv').config();
const axios = require('axios');

async function testNaverApi() {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    console.log('API 키 확인:', clientId ? '설정됨' : '없음', clientSecret ? '설정됨' : '없음');
    
    if (!clientId || !clientSecret) {
      throw new Error('네이버 API 인증 정보가 설정되지 않았습니다.');
    }
    
    const query = encodeURIComponent('천옥의왕');
    const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${query}&display=10`;
    
    console.log('요청 URL:', apiUrl);
    
    const headers = {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    };
    
    console.log('요청 중...');
    const response = await axios.get(apiUrl, { headers });
    
    console.log('응답 상태:', response.status);
    console.log('총 결과 수:', response.data.total);
    console.log('첫 번째 아이템:', response.data.items[0]);
  } catch (error) {
    console.error('오류 발생:', error.message);
    if (error.response) {
      console.error('응답 상태:', error.response.status);
      console.error('응답 데이터:', error.response.data);
    }
  }
}

testNaverApi(); 