import type { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/client-ip';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createRequestLogger(endpointName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const reqIp = getClientIp(req);

    const queryParams = Object.keys(req.query).length > 0 ? req.query : null;

    const originalSend = res.send;
    res.send = function (this: Response, data: any) {
      const statusCode = res.statusCode;
      const responseTime = Date.now() - startTime;

      let logMessage = `[API] ${method} ${url} | Status: ${statusCode} | Time: ${responseTime}ms | IP: ${reqIp}`;

      if (queryParams) {
        logMessage += ` | Query: ${JSON.stringify(queryParams)}`;
      }

      console.log(logMessage);

      originalSend.call(this, data);
    } as typeof res.send;
    next();
  };
}
