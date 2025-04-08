const app = require('./app');

// 서버 포트 설정 (app.js에서 이미 설정되어 있지만 참조용으로 추가)
const PORT = process.env.PORT || 5000;

// 서버 시작은 app.js에서 수행되므로 여기서는 추가 로깅만 진행
console.log(`서버 초기화 완료. 서버 정보: Node.js ${process.version}, Express`); 