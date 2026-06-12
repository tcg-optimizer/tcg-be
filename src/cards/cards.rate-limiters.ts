import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { getRateLimitKey } from '../common/utils/client-ip';

// 카드 가격 검색 API에 대한 IP당 제한 설정
export const cardPriceRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 20, // 30초당 20개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 가격 검색 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => {
    return getRateLimitKey(req, (req.query.cardName as string) || 'unknown');
  },
});

// 최적 구매 조합 API에 대한 IP당 제한 설정
export const optimalPurchaseRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 15, // 30초당 15개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '최적 구매 조합 계산 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => getRateLimitKey(req),
});

// 카드 검색 API에 대한 IP당 제한 설정
export const cardSearchRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10초
  max: 15, // 10초당 15개 요청
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => getRateLimitKey(req),
});
