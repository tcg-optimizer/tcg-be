# Prometheus 모니터링 시스템

이 문서는 유희왕 카드 가격 비교 API의 Prometheus 모니터링 시스템에 대해 설명합니다.

## 개요

모니터링 시스템은 다음과 같은 구조로 구성되어 있습니다:

- `src/monitoring/metrics.js`: 메트릭 정의 및 수집 로직
- `src/monitoring/middleware.js`: Express 미들웨어 및 핸들러
- `src/app.js`: 메인 애플리케이션에 모니터링 통합

## 수집되는 메트릭

### 1. 기본 Node.js 메트릭
- **process_cpu_user_seconds_total**: CPU 사용 시간 (사용자 모드)
- **process_cpu_system_seconds_total**: CPU 사용 시간 (시스템 모드)
- **process_heap_bytes**: 힙 메모리 사용량
- **process_resident_memory_bytes**: 상주 메모리 사용량
- **nodejs_gc_duration_seconds**: 가비지 컬렉션 지속 시간

### 2. HTTP 요청 메트릭

#### http_requests_total (Counter)
서버 기동 이후 총 HTTP 요청 수를 카운트합니다.

**레이블:**
- `method`: HTTP 메서드 (GET, POST, PUT, DELETE 등)
- `route`: 요청 경로 (예: /api/cards, /health)
- `status_code`: HTTP 응답 상태 코드

**예시 쿼리:**
```promql
# 전체 요청 수
sum(http_requests_total)

# 메서드별 요청 수
sum(http_requests_total) by (method)

# 4xx, 5xx 에러율
sum(rate(http_requests_total{status_code=~"4.."}[5m])) / sum(rate(http_requests_total[5m]))
```

#### http_request_duration_seconds (Histogram)
HTTP 요청 처리 시간을 측정합니다.

**레이블:**
- `method`: HTTP 메서드
- `route`: 요청 경로
- `status_code`: HTTP 응답 상태 코드

**버킷:** [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5] 초

**예시 쿼리:**
```promql
# 평균 응답 시간
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# 95th 백분위수 응답 시간
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# 응답 시간이 100ms 이상인 요청 비율
sum(rate(http_request_duration_seconds_bucket{le="0.1"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
```

### 3. Event Loop Utilization (Summary)
Node.js Event Loop의 활용도를 백분율로 측정합니다.

**메트릭명:** `event_loop_utilization`

**백분위수:** [0.01, 0.05, 0.5, 0.9, 0.95, 0.99]

**예시 쿼리:**
```promql
# 현재 ELU 중간값
event_loop_utilization{quantile="0.5"}

# ELU 99th 백분위수
event_loop_utilization{quantile="0.99"}
```

**해석:**
- 0-30%: 정상 (낮은 부하)
- 30-70%: 보통 (중간 부하)
- 70-90%: 높음 (높은 부하, 주의 필요)
- 90%+: 매우 높음 (성능 문제 가능성)

### 4. 활성 연결 수 (Gauge)
현재 서버의 활성 연결 수를 추적합니다.

**메트릭명:** `active_connections`

**예시 쿼리:**
```promql
# 현재 활성 연결 수
active_connections

# 최근 5분간 최대 연결 수
max_over_time(active_connections[5m])
```

## 엔드포인트

### GET /metrics
Prometheus가 수집할 수 있는 형태로 모든 메트릭을 출력합니다.

### GET /health
서버 상태 정보를 JSON 형태로 제공합니다:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45,
  "memory": {
    "rss": 12345678,
    "heapTotal": 1234567,
    "heapUsed": 123456,
    "external": 12345
  }
}
```

## Prometheus 설정 예시

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'tcg-optimizer-api'
    static_configs:
      - targets: ['localhost:5000']
    scrape_interval: 15s
    metrics_path: /metrics
```

## Grafana 대시보드 예시

### 주요 패널 구성

1. **개요 패널**
   - 총 요청 수
   - 평균 응답 시간
   - 에러율
   - 활성 연결 수

2. **성능 패널**
   - HTTP 응답 시간 히스토그램
   - Event Loop Utilization
   - 메모리 사용량
   - CPU 사용량

3. **에러 분석 패널**
   - 상태 코드별 요청 분포
   - 에러율 트렌드
   - 느린 요청 분석

## 알림 규칙 예시

```yaml
# alerts.yml
groups:
  - name: tcg-optimizer-api
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "높은 5xx 에러율 감지"
          description: "{{ $value | humanizePercentage }}의 요청이 5xx 에러를 반환하고 있습니다."

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "높은 응답 시간 감지"
          description: "95th 백분위수 응답 시간이 {{ $value }}초입니다."

      - alert: HighEventLoopUtilization
        expr: event_loop_utilization{quantile="0.95"} > 80
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "높은 Event Loop Utilization 감지"
          description: "Event Loop Utilization이 {{ $value }}%에 도달했습니다."
```

## 모니터링 베스트 프랙티스

1. **메트릭 카디널리티 관리**: 라벨 값이 무한히 증가하지 않도록 주의
2. **적절한 스크래핑 간격**: 15-30초 권장
3. **메트릭 보존**: 중요한 메트릭은 장기 보존 설정
4. **알림 임계값**: 환경에 맞는 적절한 임계값 설정
5. **대시보드 구성**: 업무에 필요한 핵심 메트릭 위주로 구성

## 문제 해결

### 메트릭이 수집되지 않는 경우
1. `/metrics` 엔드포인트 접근 확인
2. 모니터링 미들웨어 설정 확인
3. Prometheus 스크래핑 설정 확인

### 성능 저하가 발생하는 경우
1. Event Loop Utilization 확인
2. 메모리 사용량 모니터링
3. 느린 쿼리나 외부 API 호출 확인

### 메트릭 데이터가 부정확한 경우
1. 미들웨어 순서 확인
2. 라우트 정규화 로직 검토
3. 에러 핸들링 메트릭 수집 확인 
