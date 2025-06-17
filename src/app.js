const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const redisManager = require('./lib/redis-manager');
const { notFoundHandler, globalErrorHandler } = require('./lib/error-handler');

// 환경 변수 설정 - 가장 먼저 로드해야 함
dotenv.config();

// DB 모듈 로드 (환경 변수 로드 후 가져와야 함)
const { sequelize, connectDB } = require('./utils/db');

// 모델 로드 (테이블 생성을 위해)
require('./models/Card');
require('./models/CardPriceCache');

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
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 프로세스 레벨 에러 핸들링
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  redisManager.publishError({
    type: 'uncaught-exception',
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    context: {
      timestamp: new Date().toISOString(),
      processId: process.pid,
    },
    severity: 'critical',
  });

  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  redisManager.publishError({
    type: 'unhandled-rejection',
    error: {
      message: reason?.message || reason,
      stack: reason?.stack,
    },
    context: {
      timestamp: new Date().toISOString(),
      processId: process.pid,
    },
    severity: 'critical',
  });
});

// API 요청 제한 설정
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 60, // IP당 1분에 최대 60개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  },
});

// API 경로에 요청 제한 적용
app.use('/api', apiLimiter);

// 라우트 설정
app.get('/', (req, res) => {
  res.json({ message: '유희왕 카드 가격 비교 API에 오신 것을 환영합니다!' });
});

// 카드 라우트
const cardRoutes = require('./routes/cards');
app.use(
  '/api/cards',
  (req, res, _next) => {
    _next();
  },
  cardRoutes
);

// 404 핸들러 (모든 라우트 후에)
app.use(notFoundHandler);

// 전역 에러 핸들러 (가장 마지막에)
app.use(globalErrorHandler);

// 서버 포트 설정
const PORT = process.env.PORT || 5000;

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log('API 요청 제한 설정이 활성화되었습니다:');
});

module.exports = app;
