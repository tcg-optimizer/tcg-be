const redisManager = require('./redis-manager');

// 커스텀 에러 클래스
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

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
      ip: req?.ip || req?.connection?.remoteAddress,
      body: req?.body,
      params: req?.params,
      query: req?.query,
      ...context,
    },
    severity: determineSeverity(error),
  };
};

const determineSeverity = error => {
  if (error.statusCode >= 500) return 'critical';
  if (error.statusCode >= 400) return 'warning';
  if (error.name === 'ValidationError') return 'warning';
  if (error.name === 'UnhandledPromiseRejectionWarning') return 'critical';
  return 'info';
};

const globalErrorHandler = (err, req, res, next) => {
  setImmediate(async () => {
    try {
      console.log('Publishing error to Redis...');
      console.log('redisManager instance:', typeof redisManager, !!redisManager);
      const errorData = createErrorData(err, req);
      const success = await redisManager.publishError(errorData);
      if (success) {
        console.log('Error successfully published to Redis');
      } else {
        console.log('Failed to publish error to Redis');
      }
    } catch (publishError) {
      console.error('Failed to publish error to Redis:', publishError);
    }
  });

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

const asyncHandler = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
};
