/**
 * 사용자 요청 로깅 미들웨어
 * User-Agent, 요청 경로, 파라미터 등을 상세하게 로깅
 */

/**
 * 요청 정보를 상세하게 로깅하는 미들웨어
 * @param {string} endpointName - API 엔드포인트 이름
 * @returns {Function} Express 미들웨어 함수
 */
function createRequestLogger(endpointName) {
  return (req, res, next) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;

    // 요청 파라미터 추출
    const queryParams = Object.keys(req.query).length > 0 ? req.query : null;
    const bodyParams = req.body && Object.keys(req.body).length > 0 ? sanitizeBody(req.body) : null;
    const pathParams = req.params && Object.keys(req.params).length > 0 ? req.params : null;

    // 로그 메시지 구성
    let logMessage = `[REQUEST] ${method} ${url} | Endpoint: ${endpointName} | UserAgent: ${userAgent}`;

    if (queryParams) {
      logMessage += ` | Query: ${JSON.stringify(queryParams)}`;
    }

    if (pathParams) {
      logMessage += ` | Params: ${JSON.stringify(pathParams)}`;
    }

    if (bodyParams) {
      logMessage += ` | Body: ${JSON.stringify(bodyParams)}`;
    }

    console.log(logMessage);

    // 응답 완료 시 로깅
    const originalSend = res.send;
    res.send = function (data) {
      const statusCode = res.statusCode;
      const responseTime = Date.now() - new Date(timestamp).getTime();

      console.log(`[RESPONSE] ${method} ${url} | Status: ${statusCode} | Time: ${responseTime}ms`);

      originalSend.call(this, data);
    };

    next();
  };
}

/**
 * 요청 본문에서 민감한 정보 제거
 * @param {Object} body - 요청 본문
 * @returns {Object} 정제된 요청 본문
 */
function sanitizeBody(body) {
  const sanitized = { ...body };

  // 민감한 필드들 마스킹
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***';
    }
  });

  // 큰 배열이나 객체는 길이만 표시
  Object.keys(sanitized).forEach(key => {
    if (Array.isArray(sanitized[key]) && sanitized[key].length > 5) {
      sanitized[key] = `[Array length: ${sanitized[key].length}]`;
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      const objSize = Object.keys(sanitized[key]).length;
      if (objSize > 10) {
        sanitized[key] = `[Object keys: ${objSize}]`;
      }
    }
  });

  return sanitized;
}

/**
 * 간단한 요청 로깅 함수 (기존 호환성 유지)
 * @param {Object} req - Express 요청 객체
 * @param {string} endpoint - 엔드포인트 이름
 * @param {Object} additionalInfo - 추가 정보
 */
function logUserRequest(req, endpoint, additionalInfo = {}) {
  const userAgent = req.get('User-Agent') || 'unknown';
  const method = req.method;
  const url = req.originalUrl || req.url;

  console.log(
    `[REQUEST] ${method} ${url} | Endpoint: ${endpoint} | UserAgent: ${userAgent}${Object.keys(additionalInfo).length > 0 ? ` | ${JSON.stringify(additionalInfo)}` : ''}`
  );
}

module.exports = {
  createRequestLogger,
  logUserRequest,
  sanitizeBody,
};
