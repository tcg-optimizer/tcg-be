const { Sequelize } = require('sequelize');
const Redis = require('ioredis');

// Redis 클라이언트 생성
const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
    });

// Sequelize 인스턴스 생성
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  logging: false, // SQL 로깅을 비활성화
  dialectOptions: {
    dateStrings: true,
    typeCast: true,
  },
  timezone: '+09:00', // 한국 시간대
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// 데이터베이스 연결 함수
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL 데이터베이스 연결 성공');
    return sequelize;
  } catch (error) {
    console.error(`MySQL 데이터베이스 연결 실패: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB, redisClient };
