"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getForwardedIpList = getForwardedIpList;
exports.getForwardedIp = getForwardedIp;
exports.getClientIp = getClientIp;
exports.getRateLimitKey = getRateLimitKey;
function normalizeIp(ip) {
    if (!ip) {
        return null;
    }
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
function getForwardedIpList(req) {
    const headerValue = req.headers?.['x-forwarded-for'];
    if (!headerValue) {
        return [];
    }
    const forwardedValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return forwardedValue
        .split(',')
        .map(ip => normalizeIp(ip.trim()))
        .filter(Boolean);
}
function getForwardedIp(req) {
    return getForwardedIpList(req)[0] || null;
}
function getClientIp(req) {
    const clientIp = req.get?.('x-client-ip');
    if (clientIp) {
        return normalizeIp(clientIp.trim()) || 'unknown';
    }
    return (getForwardedIp(req) ||
        normalizeIp(req.ip) ||
        normalizeIp(req.socket?.remoteAddress) ||
        // req.connection은 deprecated된 req.socket 별칭이라 Express 타입에 없다
        normalizeIp(req.connection?.remoteAddress) ||
        'unknown');
}
function getRateLimitKey(req, suffix) {
    const clientIp = getClientIp(req);
    if (!suffix) {
        return clientIp;
    }
    return `${clientIp}:${suffix}`;
}
//# sourceMappingURL=client-ip.js.map