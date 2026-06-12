import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { getClientIp } from '../utils/client-ip';

const createErrorData = (error: any, req: Request | null = null, context: any = {}) => {
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
      ip: req ? getClientIp(req) : undefined,
      body: req?.body,
      params: req?.params,
      query: req?.query,
      ...context,
    },
    severity: determineSeverity(error),
  };
};

const determineSeverity = (error: any): string => {
  if (error.statusCode >= 500) return 'critical';
  if (error.statusCode >= 400) return 'warning';
  if (error.name === 'ValidationError') return 'warning';
  if (error.name === 'UnhandledPromiseRejectionWarning') return 'critical';
  return 'info';
};

const shouldPublishError = (error: any): boolean => {
  const statusCode = error.statusCode || 500;
  return statusCode >= 500;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly redisService: RedisService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // 라우트 미스: Nest 라우터가 NotFoundException을 던진다
    if (exception instanceof NotFoundException) {
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
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : exception?.statusCode || 500;
    const message = exception?.isOperational ? exception.message : 'Internal Server Error';
    const logMethod = statusCode >= 500 ? console.error : console.warn;

    logMethod('Error occurred:', {
      message: exception?.message,
      stack: exception?.stack,
      url: req.url,
      method: req.method,
    });

    if (shouldPublishError(exception)) {
      setImmediate(async () => {
        try {
          const errorData = createErrorData(exception, req);
          const success = await this.redisService.publishError(errorData);
          if (!success) {
            console.error('Failed to publish error to Redis');
          }
        } catch (publishError) {
          console.error('Failed to publish error to Redis:', publishError);
        }
      });
    }

    res.status(statusCode).json({
      success: false,
      error: { message },
    });
  }
}
