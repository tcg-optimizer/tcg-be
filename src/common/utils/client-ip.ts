import type { Request } from 'express';

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }

  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function getForwardedIpList(req: Request): string[] {
  const headerValue = req.headers?.['x-forwarded-for'];

  if (!headerValue) {
    return [];
  }

  const forwardedValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return forwardedValue
    .split(',')
    .map(ip => normalizeIp(ip.trim()))
    .filter(Boolean) as string[];
}

export function getForwardedIp(req: Request): string | null {
  return getForwardedIpList(req)[0] || null;
}

export function getClientIp(req: Request): string {
  const clientIp = req.get?.('x-client-ip');
  if (clientIp) {
    return normalizeIp(clientIp.trim()) || 'unknown';
  }

  return (
    getForwardedIp(req) ||
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress) ||
    normalizeIp((req as any).connection?.remoteAddress) ||
    'unknown'
  );
}

export function getRateLimitKey(req: Request, suffix?: string | null): string {
  const clientIp = getClientIp(req);

  if (!suffix) {
    return clientIp;
  }

  return `${clientIp}:${suffix}`;
}
