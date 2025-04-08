const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// 환경 변수 설정 - 가장 먼저 로드해야 함
dotenv.config();

// DB 모듈 로드 (환경 변수 로드 후 가져와야 함)
const { sequelize, connectDB } = require('./utils/db');

// 모델 로드 (테이블 생성을 위해)
const { Card, CardPrice } = require('./models/Card');
const CardPriceCache = require('./models/CardPriceCache');

// Express 앱 초기화
const app = express();

// 데이터베이스 연결 및 테이블 동기화
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    await connectDB();
    await sequelize.sync({ alter: true });
    console.log('데이터베이스 테이블 동기화 완료');
  })();
}

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우트 설정
app.get('/', (req, res) => {
  res.json({ message: '유희왕 카드 가격 비교 API에 오신 것을 환영합니다!' });
});

// 카드 라우트
const cardRoutes = require('./routes/cards');
app.use('/api/cards', (req, res, next) => {
  console.log(`[DEBUG] 요청 수신: ${req.method} ${req.url}`);
  next();
}, cardRoutes);

// 에러 핸들링 미들웨어
app.use((req, res, next) => {
  const error = new Error('Not Found');
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.json({
    error: {
      message: err.message
    }
  });
});

// 서버 포트 설정
const PORT = process.env.PORT || 5000;

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

module.exports = app; 