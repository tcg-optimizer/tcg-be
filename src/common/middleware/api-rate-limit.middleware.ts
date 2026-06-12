import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { getRateLimitKey } from '../utils/client-ip';

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // IP당 1분에 최대 60개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => getRateLimitKey(req),
});
