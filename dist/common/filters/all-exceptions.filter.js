"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const client_ip_1 = require("../utils/client-ip");
const createErrorData = (error, req = null, context = {}) => {
    return {
        type: 'server-error',
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            statusCode: error.statusCode || 500,
        },
        context: {
            timestamp: new Date().toISOString(),
            url: req?.url,
            method: req?.method,
            userAgent: req?.get('User-Agent'),
            ip: req ? (0, client_ip_1.getClientIp)(req) : undefined,
            body: req?.body,
            params: req?.params,
            query: req?.query,
            ...context,
        },
        severity: determineSeverity(error),
    };
};
const determineSeverity = (error) => {
    const statusCode = error.statusCode ?? 0;
    if (statusCode >= 500)
        return 'critical';
    if (statusCode >= 400)
        return 'warning';
    if (error.name === 'ValidationError')
        return 'warning';
    if (error.name === 'UnhandledPromiseRejectionWarning')
        return 'critical';
    return 'info';
};
const shouldPublishError = (error) => {
    const statusCode = error.statusCode || 500;
    return statusCode >= 500;
};
let AllExceptionsFilter = class AllExceptionsFilter {
    redisService;
    constructor(redisService) {
        this.redisService = redisService;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const err = exception;
        // 라우트 미스: Nest 라우터가 NotFoundException을 던진다
        if (exception instanceof common_1.NotFoundException) {
            const url = req.originalUrl || req.url;
            if (url.startsWith('/api')) {
                // 기존 apiNotFoundHandler 본문 (apiTrafficGuard.js)
                return res.status(404).json({
                    success: false,
                    error: { message: 'API endpoint not found' },
                });
            }
            // 기존 notFoundHandler → globalErrorHandler 경로 (AppError 404)
            const message = `Route ${url} not found`;
            console.warn('Error occurred:', {
                message,
                stack: exception.stack,
                url: req.url,
                method: req.method,
            });
            return res.status(404).json({ success: false, error: { message } });
        }
        // 그 외: globalErrorHandler 1:1 재현
        const statusCode = exception instanceof common_1.HttpException ? exception.getStatus() : err?.statusCode || 500;
        const message = err?.isOperational ? err.message : 'Internal Server Error';
        const logMethod = statusCode >= 500 ? console.error : console.warn;
        logMethod('Error occurred:', {
            message: err?.message,
            stack: err?.stack,
            url: req.url,
            method: req.method,
        });
        if (shouldPublishError(err)) {
            setImmediate(async () => {
                try {
                    const errorData = createErrorData(err, req);
                    const success = await this.redisService.publishError(errorData);
                    if (!success) {
                        console.error('Failed to publish error to Redis');
                    }
                }
                catch (publishError) {
                    console.error('Failed to publish error to Redis:', publishError);
                }
            });
        }
        res.status(statusCode).json({
            success: false,
            error: { message },
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map