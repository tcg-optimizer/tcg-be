function createRequestLogger(endpointName) {
  return (req, res, next) => {
    const startTime = Date.now();
    const userAgent = req.get('User-Agent') || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;

    const queryParams = Object.keys(req.query).length > 0 ? req.query : null;

    const originalSend = res.send;
    res.send = function (data) {
      const statusCode = res.statusCode;
      const responseTime = Date.now() - startTime;

      let logMessage = `[API] ${method} ${url} | Endpoint: ${endpointName} | Status: ${statusCode} | Time: ${responseTime}ms | UserAgent: ${userAgent}`;

      if (queryParams) {
        logMessage += ` | Query: ${JSON.stringify(queryParams)}`;
      }

      console.log(logMessage);

      originalSend.call(this, data);
    };
    next();
  };
}

module.exports = {
  createRequestLogger,
};
