function getClientIp(req) {
  const clientIp = req.get('x-client-ip');
  if (clientIp) {
    return clientIp.trim();
  }

  const forwardedFor = req.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip;
}

module.exports = { getClientIp };
