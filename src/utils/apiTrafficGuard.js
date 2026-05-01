const { getClientIp } = require('./clientIp');

const SUSPICIOUS_PROBE_WINDOW_MS = 10 * 60 * 1000;
const SUSPICIOUS_BAN_MS = 60 * 60 * 1000;
const SUSPICIOUS_THRESHOLD = 5;

const suspiciousProbeCache = new Map();

const SUSPICIOUS_PATH_PATTERNS = [
  /(^|\/)vendor\/phpunit/i,
  /\.php(?:$|\/)/i,
  /(^|\/)\.env(?:$|\/)/i,
  /(^|\/)\.git(?:$|\/)/i,
  /wp-(admin|login|content|includes)/i,
  /phpmyadmin/i,
  /\.(?:asp|aspx|jsp|cgi|bak|old|sql)(?:$|\/)/i,
  /\.\.(?:\/|\\)/,
  /(^|\/)(?:boaform|HNAP1)(?:$|\/)/i,
];

function cleanupSuspiciousProbeCache(now = Date.now()) {
  for (const [ip, probeState] of suspiciousProbeCache.entries()) {
    const isExpired = now - probeState.lastSeenAt > SUSPICIOUS_BAN_MS;

    if (isExpired) {
      suspiciousProbeCache.delete(ip);
    }
  }
}

function normalizeApiPath(req) {
  return req.path || req.url || '/';
}

function isSuspiciousApiPath(path) {
  return SUSPICIOUS_PATH_PATTERNS.some(pattern => pattern.test(path));
}

function recordSuspiciousProbe(ip) {
  const now = Date.now();
  const currentState = suspiciousProbeCache.get(ip);

  if (!currentState || now - currentState.firstSeenAt > SUSPICIOUS_PROBE_WINDOW_MS) {
    const nextState = {
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      blockedUntil: null,
    };
    suspiciousProbeCache.set(ip, nextState);
    return nextState;
  }

  currentState.count += 1;
  currentState.lastSeenAt = now;

  if (currentState.count >= SUSPICIOUS_THRESHOLD) {
    currentState.blockedUntil = now + SUSPICIOUS_BAN_MS;
  }

  suspiciousProbeCache.set(ip, currentState);
  return currentState;
}

function isBlockedIp(ip) {
  const probeState = suspiciousProbeCache.get(ip);

  if (!probeState) {
    return false;
  }

  if (!probeState.blockedUntil) {
    return false;
  }

  if (probeState.blockedUntil <= Date.now()) {
    suspiciousProbeCache.delete(ip);
    return false;
  }

  return true;
}

function logBlockedRequest(req, reason, probeState = null) {
  const ip = getClientIp(req);
  const path = normalizeApiPath(req);
  const userAgent = req.get('User-Agent') || 'unknown';
  const blockUntil = probeState?.blockedUntil
    ? new Date(probeState.blockedUntil).toISOString()
    : 'n/a';

  console.warn(
    `[WARN] Blocked suspicious API request | IP: ${ip} | Method: ${req.method} | Path: ${path} | Reason: ${reason} | Count: ${probeState?.count || 0} | BlockUntil: ${blockUntil} | UserAgent: ${userAgent}`
  );
}

function apiTrafficGuard(req, res, next) {
  cleanupSuspiciousProbeCache();

  const ip = getClientIp(req);
  const path = normalizeApiPath(req);

  if (isBlockedIp(ip)) {
    logBlockedRequest(req, 'ip-temporarily-banned', suspiciousProbeCache.get(ip));
    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden',
      },
    });
  }

  if (isSuspiciousApiPath(path)) {
    const probeState = recordSuspiciousProbe(ip);
    logBlockedRequest(req, 'suspicious-path-pattern', probeState);

    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden',
      },
    });
  }

  return next();
}

function apiNotFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      message: 'API endpoint not found',
    },
  });
}

module.exports = {
  apiTrafficGuard,
  apiNotFoundHandler,
};
