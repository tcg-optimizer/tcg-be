function normalizeIp(ip) {
  if (!ip) {
    return null;
  }

  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function getForwardedIp(req) {
  const headerValue = req.headers?.['x-forwarded-for'];

  if (!headerValue) {
    return null;
  }

  const forwardedValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const firstIp = forwardedValue.split(',')[0]?.trim();

  return normalizeIp(firstIp);
}

function getClientIp(req) {
  return (
    getForwardedIp(req) ||
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress) ||
    normalizeIp(req.connection?.remoteAddress) ||
    'unknown'
  );
}

function getRateLimitKey(req, suffix = null) {
  const clientIp = getClientIp(req);

  if (!suffix) {
    return clientIp;
  }

  return `${clientIp}:${suffix}`;
}

module.exports = {
  getClientIp,
  getRateLimitKey,
};
