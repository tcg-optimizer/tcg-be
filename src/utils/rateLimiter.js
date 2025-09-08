const { redisClient } = require('./db');

const RATE_LIMITS = {
  naver: 10, // 네이버 API - 초당 10개 요청
  tcgshop: 10, // TCGShop - 초당 10개 요청
  carddc: 10, // CardDC - 초당 10개 요청
  default: 5, // 기본값 - 초당 5개 요청
};

const WINDOW_SIZE_SEC = 1;

// 메모리 기반 카드 검색 요청 추적용 캐시
const cardRequestCache = new Map();

// 특정 IP와 카드 이름 조합에 대한 요청 추적
function trackCardRequest(ip, cardName) {
  const now = Date.now();
  const key = `${ip}:${cardName || 'unknown'}`;

  if (!cardRequestCache.has(key)) {
    cardRequestCache.set(key, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
    return { isLimited: false, retryAfter: 0 };
  }

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

  requestData.count += 1;
  requestData.lastRequest = now;
  cardRequestCache.set(key, requestData);

  // 5초 이내에 3회 이상 동일 카드 요청 시 제한 적용
  const isLimited = requestData.count > 2;
  // 현재 시간으로부터 5초 후에 다시 요청 가능
  const retryAfter = Math.ceil((requestData.lastRequest + 5000 - now) / 1000);

  if (isLimited) {
    console.log(
      `[INFO] IP ${ip}의 "${cardName}" 카드 요청 제한됨: 5초 내 ${requestData.count}회 요청`
    );
  }

  return { isLimited, retryAfter };
}

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

async function checkRateLimit(site) {
  const now = Math.floor(Date.now() / 1000);
  const rateKey = `ratelimit:${site}:${now}`; // Redis 키

  try {
    const currentRequests = await redisClient.incr(rateKey);

    // 첫 요청인 경우 만료 시간 설정 (윈도우 사이즈 + 1초)
    if (currentRequests === 1) {
      await redisClient.expire(rateKey, WINDOW_SIZE_SEC + 1);
    }

    const limit = RATE_LIMITS[site] || RATE_LIMITS.default;

    return currentRequests <= limit;
  } catch (error) {
    console.error(`[ERROR] 요청 제한 확인 중 오류 발생: ${error.message}`);
    return true;
  }
}

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
