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
  getForwardedIp,
  getForwardedIpList,
  getRateLimitKey,
};
