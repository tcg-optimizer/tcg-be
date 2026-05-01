const express = require('express');
const router = express.Router();

const { getClientIp, getForwardedIp, getForwardedIpList } = require('../utils/clientIp');

router.get('/client-ip', (req, res) => {
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
      remoteAddress: req.socket?.remoteAddress || req.connection?.remoteAddress || null,
      userAgent: req.get('User-Agent') || null,
    },
  });
});

module.exports = router;
