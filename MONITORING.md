# 🔍 모니터링 시스템 빠른 시작 가이드

이 가이드는 TCG Optimizer API의 Prometheus + Grafana 모니터링 시스템을 빠르게 시작하는 방법을 설명합니다.

## 🚀 빠른 시작

### 1단계: API 서버 시작
```bash
npm start
```

### 2단계: 모니터링 시스템 시작
```bash
./start-monitoring.sh
```

## 📊 접속 정보

| 서비스 | URL | 계정 정보 |
|--------|-----|-----------|
| **Prometheus** | http://localhost:9090 | - |
| **Grafana** | http://localhost:3030 | admin / admin123 |
| **API Health** | http://localhost:5000/health | - |
| **API Metrics** | http://localhost:5000/metrics | - |

## 🔧 수동 설정 (Docker 없이)

Docker를 사용하지 않고 Prometheus를 직접 설치하고 싶다면:

### Ubuntu/Debian:
```bash
# Prometheus 다운로드 및 설치
wget https://github.com/prometheus/prometheus/releases/latest/download/prometheus-*-linux-amd64.tar.gz
tar xvfz prometheus-*-linux-amd64.tar.gz
cd prometheus-*

# 설정 파일 복사
cp /path/to/your/prometheus.yml ./

# Prometheus 실행
./prometheus --config.file=prometheus.yml
```

### macOS:
```bash
# Homebrew로 설치
brew install prometheus

# Prometheus 실행
prometheus --config.file=prometheus.yml
```

## 📈 유용한 Prometheus 쿼리

### 기본 메트릭
```promql
# 전체 HTTP 요청 수
sum(http_requests_total)

# 메서드별 요청 수
sum(http_requests_total) by (method)

# 상태 코드별 요청 수
sum(http_requests_total) by (status_code)
```

### 성능 메트릭
```promql
# 평균 응답 시간 (초)
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# 95th 백분위수 응답 시간
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Event Loop Utilization (중간값)
event_loop_utilization{quantile="0.5"}
```

### 에러 모니터링
```promql
# 4xx 에러율
sum(rate(http_requests_total{status_code=~"4.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# 5xx 에러율
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# 느린 요청 (1초 이상)
sum(rate(http_request_duration_seconds_bucket{le="1"}[5m])) / sum(rate(http_request_duration_seconds_count[5m])) * 100
```

## 🧪 테스트 요청 생성

메트릭 데이터를 생성하기 위해 API에 요청을 보내세요:

```bash
# 기본 요청
curl http://localhost:5000/
curl http://localhost:5000/health

# 여러 요청 보내기
for i in {1..10}; do
  curl http://localhost:5000/health
  sleep 1
done

# 404 에러 생성 (에러 메트릭 테스트)
curl http://localhost:5000/nonexistent

# API 카드 엔드포인트 테스트 (있다면)
curl http://localhost:5000/api/cards
```

## 🛑 종료

### 모니터링 시스템 종료
```bash
docker-compose -f docker-compose.monitoring.yml down
```

### 모든 데이터 삭제 (볼륨 포함)
```bash
docker-compose -f docker-compose.monitoring.yml down -v
```

## 🔧 문제 해결

### 1. API 서버가 시작되지 않는 경우
```bash
# 포트 5000이 사용 중인지 확인
lsof -i :5000

# 프로세스 종료
kill -9 <PID>
```

### 2. Docker 서비스가 시작되지 않는 경우
```bash
# Docker 서비스 상태 확인
docker ps

# 로그 확인
docker-compose -f docker-compose.monitoring.yml logs
```

### 3. 메트릭이 수집되지 않는 경우
- API 서버의 `/metrics` 엔드포인트 확인: http://localhost:5000/metrics
- Prometheus의 타겟 상태 확인: http://localhost:9090/targets
- 네트워크 연결 확인

## 📚 추가 리소스

- [Prometheus 공식 문서](https://prometheus.io/docs/)
- [Grafana 공식 문서](https://grafana.com/docs/)
- [PromQL 가이드](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [프로젝트 모니터링 상세 문서](docs/monitoring.md) 
