const { httpRequestsTotal, httpRequestDuration, activeConnections } = require('./metrics');

/**
 * HTTP 요청 모니터링 미들웨어
 */
function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();

  // 활성 연결 수 증가
  activeConnections.inc();

  // 원본 end 메서드 저장
  const originalEnd = res.end;

  // res.end 메서드 오버라이드
  res.end = function (...args) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // 초 단위로 변환

    // 라우트 정보 추출 (매개변수가 있는 경우 정규화)
    const route = req.route ? req.route.path : req.path;

    // 메트릭 수집
    const labels = {
      method: req.method,
      route: route || 'unknown',
      status_code: res.statusCode.toString(),
    };

    // HTTP 요청 총 개수 증가
    httpRequestsTotal.inc(labels);

    // HTTP 요청 처리 시간 기록
    httpRequestDuration.observe(labels, duration);

    // 활성 연결 수 감소
    activeConnections.dec();

    // 원본 end 메서드 호출
    originalEnd.apply(this, args);
  };

  next();
}

/**
 * 연결 수 모니터링을 위한 서버 이벤트 리스너
 */
function setupServerMonitoring(server) {
  server.on('connection', socket => {
    // 연결 종료 시 활성 연결 수 감소
    socket.on('close', () => {
      // 이미 res.end에서 처리하므로 여기서는 별도 처리 불필요
    });
  });

  server.on('error', error => {
    console.error('서버 오류:', error);
  });
}

/**
 * 메트릭 엔드포인트 핸들러
 */
async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', require('./metrics').register.contentType);
    const metrics = await require('./metrics').register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('메트릭 수집 오류:', error);
    res.status(500).end('메트릭 수집 중 오류가 발생했습니다.');
  }
}

module.exports = {
  monitoringMiddleware,
  setupServerMonitoring,
  metricsHandler,
};
