const client = require('prom-client');
const { performance } = require('perf_hooks');

// 기본 메트릭 수집 시작
client.collectDefaultMetrics({
  timeout: 5000,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // gc 지속시간 버킷
});

// HTTP 요청 총 개수 (Counter)
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: '서버 기동 이후 총 HTTP 요청 수',
  labelNames: ['method', 'route', 'status_code'],
});

// HTTP 요청 처리 시간 (Histogram)
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 요청 처리 시간 (초)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5], // 응답시간 버킷
});

// Event Loop Utilization (Summary)
const eventLoopUtilization = new client.Summary({
  name: 'event_loop_utilization',
  help: 'Node.js Event Loop 활용도',
  percentiles: [0.01, 0.05, 0.5, 0.9, 0.95, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5,
});

// 활성 연결 수 (Gauge)
const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: '현재 활성 연결 수',
});

// ELU 모니터링 시작
let lastElu = performance.eventLoopUtilization();

// ELU 측정 함수
function measureEventLoopUtilization() {
  const currentElu = performance.eventLoopUtilization(lastElu);
  const utilization = currentElu.utilization;

  // 0~1 사이의 값을 0~100으로 변환
  eventLoopUtilization.observe(utilization * 100);

  lastElu = performance.eventLoopUtilization();
}

// 주기적으로 ELU 측정 (1초마다)
setInterval(measureEventLoopUtilization, 1000);

// 메트릭 등록
client.register.registerMetric(httpRequestsTotal);
client.register.registerMetric(httpRequestDuration);
client.register.registerMetric(eventLoopUtilization);
client.register.registerMetric(activeConnections);

module.exports = {
  client,
  httpRequestsTotal,
  httpRequestDuration,
  eventLoopUtilization,
  activeConnections,
  register: client.register,
};
