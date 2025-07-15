/**
 * 크롤링 요청 빈도 제한 유틸리티
 * 각 사이트별로 초당 요청 수를 제한하여 과도한 크롤링 방지
 */

const { redisClient } = require('./db');

// 사이트별 초당 최대 요청 수 설정
const RATE_LIMITS = {
  naver: 10, // 네이버 API - 초당 10개 요청
  tcgshop: 10, // TCGShop - 초당 10개 요청
  carddc: 10, // CardDC - 초당 10개 요청
  onlyyugioh: 10, // OnlyYugioh - 초당 10개 요청
  default: 5, // 기본값 - 초당 5개 요청
};

// 요청 제한 윈도우 (초)
const WINDOW_SIZE_SEC = 1;

// 메모리 기반 카드 검색 요청 추적용 캐시
const cardRequestCache = new Map();

// 특정 IP와 카드 이름 조합에 대한 요청 추적
function trackCardRequest(ip, cardName) {
  const now = Date.now();
  const key = `${ip}:${cardName || 'unknown'}`;

  // 현재 아이템이 있는지 확인
  if (!cardRequestCache.has(key)) {
    cardRequestCache.set(key, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
    return { isLimited: false, retryAfter: 0 };
  }

  // 기존 요청 정보 가져오기
  const requestData = cardRequestCache.get(key);

  // 마지막 요청에서 5초 이상 지났으면 초기화
  if (now - requestData.lastRequest > 5000) {
    cardRequestCache.set(key, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
    return { isLimited: false, retryAfter: 0 };
  }

  // 요청 정보 업데이트
  requestData.count += 1;
  requestData.lastRequest = now;
  cardRequestCache.set(key, requestData);

  // 5초 이내에 3회 이상 동일 카드 요청 시 제한 적용
  const isLimited = requestData.count > 2;
  // 현재 시간으로부터 5초 후에 다시 요청 가능
  const retryAfter = Math.ceil((requestData.lastRequest + 5000 - now) / 1000);

  // 제한 상태 로깅
  if (isLimited) {
    console.log(
      `[INFO] IP ${ip}의 "${cardName}" 카드 요청 제한됨: 5초 내 ${requestData.count}회 요청`
    );
  }

  return { isLimited, retryAfter };
}

// 오래된 캐시 항목 제거
function cleanupCardRequestCache() {
  const now = Date.now();

  for (const [key, data] of cardRequestCache.entries()) {
    // 마지막 요청이 10분 이상 지난 항목 제거
    if (now - data.lastRequest > 600000) {
      cardRequestCache.delete(key);
    }
  }
}

// 5분마다 캐시 정리
setInterval(cleanupCardRequestCache, 300000);

/**
 * 특정 사이트에 대한 요청이 제한을 초과하는지 확인
 * @param {string} site - 크롤링 대상 사이트
 * @returns {Promise<boolean>} - 요청 가능 여부 (true: 가능, false: 제한 초과)
 */
async function checkRateLimit(site) {
  const now = Math.floor(Date.now() / 1000); // 현재 시간 (초)
  const rateKey = `ratelimit:${site}:${now}`; // Redis 키

  try {
    // 현재 요청 수 증가 및 조회
    const currentRequests = await redisClient.incr(rateKey);

    // 첫 요청인 경우 만료 시간 설정 (윈도우 사이즈 + 1초)
    if (currentRequests === 1) {
      await redisClient.expire(rateKey, WINDOW_SIZE_SEC + 1);
    }

    // 사이트별 제한 확인
    const limit = RATE_LIMITS[site] || RATE_LIMITS.default;

    // 제한 초과 여부 반환
    return currentRequests <= limit;
  } catch (error) {
    console.error(`[ERROR] 요청 제한 확인 중 오류 발생: ${error.message}`);
    return true; // Redis 오류 시 기본적으로 요청 허용
  }
}

/**
 * 요청 제한에 도달한 경우 대기 후 재시도
 * @param {string} site - 크롤링 대상 사이트
 * @param {number} maxRetries - 최대 재시도 횟수
 * @returns {Promise<boolean>} - 요청 가능 여부
 */
async function waitForRateLimit(site, maxRetries = 5) {
  let retries = 0;

  while (retries < maxRetries) {
    const canProceed = await checkRateLimit(site);

    if (canProceed) {
      return true;
    }

    // 요청 제한에 도달한 경우 대기 (지수 백오프 적용)
    const waitTime = Math.min(100 * Math.pow(2, retries), 2000); // 최대 2초까지 대기
    console.log(
      `[INFO] ${site} 요청 제한 도달, ${waitTime}ms 대기 후 재시도 (${retries + 1}/${maxRetries})`
    );

    await new Promise(resolve => setTimeout(resolve, waitTime));
    retries++;
  }

  console.warn(`[WARN] ${site} 요청 제한 초과, 최대 재시도 횟수(${maxRetries}) 도달`);
  return false;
}

/**
 * 요청 제한 데코레이터 - 함수 실행 전 요청 제한 확인
 * @param {Function} fn - 래핑할 함수 (크롤링 함수)
 * @param {string} site - 크롤링 대상 사이트
 * @returns {Function} - 요청 제한이 적용된 함수
 */
function withRateLimit(fn, site) {
  return async (...args) => {
    // 요청 제한 확인
    const canProceed = await waitForRateLimit(site);

    if (!canProceed) {
      throw new Error(`${site} 요청 제한 초과로 크롤링을 진행할 수 없습니다.`);
    }

    // 원래 함수 실행
    return fn(...args);
  };
}

/**
 * 동일 카드 반복 요청 제한 미들웨어
 * @param {Object} req - HTTP 요청 객체
 * @param {Object} res - HTTP 응답 객체
 * @param {Function} next - 다음 미들웨어
 */
function cardRequestLimiter(req, res, next) {
  const ip = req.ip;
  const cardName = req.query.cardName || req.body.cardName || req.params.cardName;

  const { isLimited, retryAfter } = trackCardRequest(ip, cardName);

  if (isLimited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      error: `같은 카드에 대한 요청이 너무 많습니다. ${retryAfter}초 후에 다시 시도해주세요.`,
    });
  }

  next();
}

module.exports = {
  checkRateLimit,
  waitForRateLimit,
  withRateLimit,
  cardRequestLimiter,
  RATE_LIMITS,
};
