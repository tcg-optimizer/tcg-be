"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalApiAuth = internalApiAuth;
function internalApiAuth(req, res, next) {
    const configuredSecret = process.env.INTERNAL_API_SECRET;
    if (!configuredSecret && process.env.NODE_ENV !== 'production') {
        return next();
    }
    const requestSecret = req.get('x-internal-api-secret');
    if (!configuredSecret || requestSecret !== configuredSecret) {
        return res.status(403).json({
            success: false,
            error: '허용되지 않은 API 요청입니다.',
        });
    }
    next();
}
//# sourceMappingURL=internal-auth.middleware.js.map