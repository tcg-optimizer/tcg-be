"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const redis_service_1 = require("./redis/redis.service");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const internal_auth_middleware_1 = require("./common/middleware/internal-auth.middleware");
const api_traffic_guard_middleware_1 = require("./common/middleware/api-traffic-guard.middleware");
const api_rate_limit_middleware_1 = require("./common/middleware/api-rate-limit.middleware");
const resolveTrustProxy = (value) => {
    if (value === undefined || value === null || value === '') {
        return 1;
    }
    if (value === 'true') {
        return 1;
    }
    if (value === 'false') {
        return false;
    }
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? value : numericValue;
};
// 기존 app.js의 redisManager 모듈 싱글톤과 동일하게, 프로세스 핸들러가 부트스트랩 실패
// 시점에도 에러를 발행할 수 있도록 DI 밖에서 생성한다 (RedisService는 의존성 없음).
const redisService = new redis_service_1.RedisService();
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
    redisService.publishError({
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
    const err = reason;
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    redisService.publishError({
        type: 'unhandled-rejection',
        error: {
            message: err?.message || reason,
            stack: err?.stack,
        },
        context: {
            timestamp: new Date().toISOString(),
            processId: process.pid,
        },
        severity: 'critical',
    });
});
async function bootstrap() {
    if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_SECRET) {
        throw new Error('INTERNAL_API_SECRET must be set in production.');
    }
    if (!process.env.INTERNAL_API_SECRET) {
        console.warn('[WARN] INTERNAL_API_SECRET is not set. /api internal auth is disabled outside production.');
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));
    expressApp.disable('x-powered-by');
    app.use((0, helmet_1.default)());
    app.enableCors({
        origin(origin, callback) {
            const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
            if (!origin) {
                return callback(null, true);
            }
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            if (process.env.NODE_ENV !== 'production' &&
                /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        },
    });
    app.use('/api', api_traffic_guard_middleware_1.apiTrafficGuard);
    app.use('/api', api_rate_limit_middleware_1.apiLimiter);
    app.use('/api', internal_auth_middleware_1.internalApiAuth);
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter(redisService));
    const port = process.env.PORT ? Number(process.env.PORT) : 0;
    const host = process.env.HOST || '0.0.0.0';
    await app.listen(port, host);
    console.log(`TCG스캐너 서버가 ${host}:${port}에서 실행 중입니다.`);
}
void bootstrap();
//# sourceMappingURL=main.js.map