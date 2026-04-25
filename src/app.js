const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const redisManager = require('./lib/redis-manager');
const { notFoundHandler, globalErrorHandler } = require('./lib/error-handler');

dotenv.config();

const { sequelize, connectDB } = require('./utils/db');
require('./models/Card');
require('./models/CardPriceCache');
const { startPeriodicCleanup } = require('./utils/cleanup');

const app = express();

const parseTrustProxy = value => {
  if (value === undefined || value === null || value === '') {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  const parsedNumber = Number(value);
  if (Number.isInteger(parsedNumber) && parsedNumber >= 0) {
    return parsedNumber;
  }

  return value;
};

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

app.disable('x-powered-by');
app.set('trust proxy', trustProxy);

(async () => {
  await connectDB();
  await sequelize.sync();
  console.log('데이터베이스 테이블 동기화 완료');
  
  // 만료된 데이터 정리 스케줄러 시작 (1시간마다)
  startPeriodicCleanup(60);
})();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // IP당 1분에 최대 60개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.method === 'OPTIONS',
  message: {
    success: false,
    error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  },
});

app.use('/api', apiLimiter);

app.get('/', (req, res) => {
  res.json({ message: 'TCG스캐너에 오신 것을 환영합니다!' });
});

const cardRoutes = require('./routes/cards');
app.use('/api/cards', cardRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: '요청한 API 엔드포인트를 찾을 수 없습니다.',
    },
  });
});

// 404 핸들러 - 모든 라우터 후에 위치하도록 해야 함 
app.use(notFoundHandler);

// 전역 에러 핸들러 - 가장 마지막에 위치하도록 해야 함
app.use(globalErrorHandler);

const PORT = process.env.PORT;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`TCG스캐너 서버가 ${HOST}:${PORT}에서 실행 중입니다.`);
});

module.exports = app;
