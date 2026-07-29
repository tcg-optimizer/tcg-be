"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_ip_1 = require("../utils/client-ip");
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60, // IP당 1분에 최대 60개까지만 요청 가능
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
    },
    keyGenerator: (req) => (0, client_ip_1.getRateLimitKey)(req),
});
//# sourceMappingURL=api-rate-limit.middleware.js.map