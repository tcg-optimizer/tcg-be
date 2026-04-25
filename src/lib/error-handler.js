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

const shouldPublishError = error => {
  const statusCode = error.statusCode || 500;
  return statusCode >= 500;
};

const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  if (shouldPublishError(err)) {
    setImmediate(async () => {
      try {
        const errorData = createErrorData(err, req);
        await redisManager.publishError(errorData);
      } catch (publishError) {
        console.error('Failed to publish error to Redis:', publishError);
      }
    });
  }

  if (statusCode >= 500) {
    console.error('Error occurred:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });
  } else {
    console.warn('Request handled with warning:', {
      message: err.message,
      statusCode,
      url: req.url,
      method: req.method,
      ip: req.ip || req.connection?.remoteAddress,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: '요청한 경로를 찾을 수 없습니다.',
    },
  });
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
