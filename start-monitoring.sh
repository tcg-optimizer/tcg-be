#!/bin/bash

echo "🚀 TCG Optimizer 모니터링 시스템 시작..."

# API 서버가 실행중인지 확인
if ! curl -s http://localhost:5000/health > /dev/null; then
    echo "❌ API 서버가 실행되지 않았습니다. 먼저 API 서버를 시작해주세요."
    echo "   npm start 또는 node src/server.js"
    exit 1
fi

echo "✅ API 서버가 실행 중입니다."

# Docker가 설치되어 있는지 확인
if ! command -v docker &> /dev/null; then
    echo "❌ Docker가 설치되지 않았습니다. Docker를 설치하고 다시 시도해주세요."
    exit 1
fi

# Docker Compose가 설치되어 있는지 확인
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose가 설치되지 않았습니다. Docker Compose를 설치하고 다시 시도해주세요."
    exit 1
fi

echo "✅ Docker 환경이 준비되었습니다."

# Grafana 디렉토리 생성
mkdir -p grafana/provisioning/datasources

echo "📊 Prometheus와 Grafana를 시작합니다..."

# Docker Compose로 서비스 시작
docker-compose -f docker-compose.monitoring.yml up -d

echo ""
echo "🎉 모니터링 시스템이 시작되었습니다!"
echo ""
echo "📍 접속 정보:"
echo "   • Prometheus: http://localhost:9090"
echo "   • Grafana: http://localhost:3030"
echo "     - 사용자명: admin"
echo "     - 비밀번호: admin123"
echo ""
echo "📊 유용한 Prometheus 쿼리:"
echo "   • 전체 요청 수: sum(http_requests_total)"
echo "   • 평균 응답 시간: rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])"
echo "   • Event Loop Utilization: event_loop_utilization"
echo "   • 활성 연결 수: active_connections"
echo ""
echo "🔄 API 서버에 몇 가지 요청을 보내서 메트릭을 생성해보세요:"
echo "   curl http://localhost:5000/"
echo "   curl http://localhost:5000/health"
echo "   curl http://localhost:5000/metrics"
echo ""
echo "🛑 중지하려면: docker-compose -f docker-compose.monitoring.yml down" 
