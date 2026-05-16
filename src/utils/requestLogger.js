function createRequestLogger(endpointName) {
  return (req, res, next) => {
    const startTime = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const reqIp = req.ip || 'unknown';

    const queryParams = Object.keys(req.query).length > 0 ? req.query : null;

    const originalSend = res.send;
    res.send = function (data) {
      const statusCode = res.statusCode;
      const responseTime = Date.now() - startTime;

      let logMessage = `[API] ${method} ${url} | Status: ${statusCode} | Time: ${responseTime}ms | IP: ${reqIp}`;

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
