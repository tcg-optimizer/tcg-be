const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

dotenv.config();

const { sequelize, connectDB } = require('./utils/db');
require('./models/Card');
require('./models/CardPriceCache');

const app = express();

(async () => {
  await connectDB();
  await sequelize.sync();
  console.log('데이터베이스 테이블 동기화 완료');
})();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // IP당 1분에 최대 60개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  },
});

// API 경로에 요청 제한 적용
app.use('/api', apiLimiter);

app.get('/', (req, res) => {
  res.json({ message: 'TCG스캐너에 오신 것을 환영합니다!' });
});

const cardRoutes = require('./routes/cards');
app.use('/api/cards', cardRoutes);

app.use((req, res, _next) => {
  const error = new Error('Not Found');
  error.status = 404;
  _next(error);
});

app.use((err, req, res) => {
  res.status(err.status || 500);
  res.json({
    error: {
      message: err.message,
    },
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`TCG스캐너 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

module.exports = app;
