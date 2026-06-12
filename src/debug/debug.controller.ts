import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getClientIp, getForwardedIp, getForwardedIpList } from '../common/utils/client-ip';

@Controller('api/debug')
export class DebugController {
  @Get('client-ip')
  getClientIpInfo(@Req() req: Request, @Res() res: Response) {
    res.status(200).json({
      success: true,
      data: {
        method: req.method,
        path: req.originalUrl,
        trustProxy: req.app.get('trust proxy'),
        clientIp: getClientIp(req),
        forwardedIp: getForwardedIp(req),
        forwardedIpList: getForwardedIpList(req),
        expressIp: req.ip || null,
        expressIps: Array.isArray(req.ips) ? req.ips : [],
        cfConnectingIp: req.get('CF-Connecting-IP') || null,
        trueClientIp: req.get('True-Client-IP') || null,
        xRealIp: req.get('X-Real-IP') || null,
        xForwardedFor: req.get('X-Forwarded-For') || null,
        remoteAddress: req.socket?.remoteAddress || (req as any).connection?.remoteAddress || null,
        userAgent: req.get('User-Agent') || null,
      },
    });
  }
}
