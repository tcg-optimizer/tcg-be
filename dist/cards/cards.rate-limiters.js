"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardSearchRateLimiter = exports.optimalPurchaseRateLimiter = exports.cardPriceRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_ip_1 = require("../common/utils/client-ip");
// 카드 가격 검색 API에 대한 IP당 제한 설정
exports.cardPriceRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 30 * 1000,
    max: 20, // 30초당 20개까지만 요청 가능
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: '카드 가격 검색 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
    },
    keyGenerator: (req) => {
        return (0, client_ip_1.getRateLimitKey)(req, req.query.cardName || 'unknown');
    },
});
// 최적 구매 조합 API에 대한 IP당 제한 설정
exports.optimalPurchaseRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 30 * 1000,
    max: 15, // 30초당 15개 요청
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: '최적 구매 조합 계산 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
    },
    keyGenerator: (req) => (0, client_ip_1.getRateLimitKey)(req),
});
// 카드 검색 API에 대한 IP당 제한 설정
exports.cardSearchRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 1000, // 10초
    max: 15, // 10초당 15개 요청
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: '카드 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    },
    keyGenerator: (req) => (0, client_ip_1.getRateLimitKey)(req),
});
//# sourceMappingURL=cards.rate-limiters.js.map