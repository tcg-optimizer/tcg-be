// PM2 프로세스 설정.
//
// 배포 환경: OCI Always Free 인스턴스 (1GB RAM + 4GB swap, ~1/8 OCPU)에
// MySQL / Redis 가 같은 박스에 함께 떠 있다. 메모리가 매우 빠듯하므로 Node 몫을
// 낮게 잡아, 누수/폭주 시 스왑으로 넘어가 며칠씩 기어가기 전에 즉시 재시작되도록 한다.
// (2026-06-14 ~2일 다운 장애: 메모리 상한·재시작 안전망 부재가 원인의 일부였음)
//
// 최초 1회 적용(박스에서):
//   pm2 delete tcg-be 2>/dev/null; pm2 start ecosystem.config.js && pm2 save
// 이후 배포(cd.yml):
//   pm2 startOrReload ecosystem.config.js --update-env && pm2 save
module.exports = {
  apps: [
    {
      name: 'tcg-be',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork', // 1/8 OCPU라 cluster 이점이 없음

      // V8 old-space 힙 상한. Node 평소 RSS는 ~81MB(pm2 status 실측)라 256이면
      // 정상/부하 피크엔 한참 여유, 누수 시엔 이 선에서 OOM-재시작되어 폭주를 막는다.
      node_args: '--max-old-space-size=256',

      // RSS가 이 선을 넘으면 PM2가 재시작. 평소 81MB의 ~3.7배(=명백한 누수 신호)이며
      // available(~381MiB) 아래라 스왑 본격화 전에 끊는다. 부하 피크엔 닿지 않는 값.
      max_memory_restart: '300M',

      // 부팅 직후 연쇄 크래시 시 타이트 루프 완화 + 강제 종료 전 graceful 여유.
      exp_backoff_restart_delay: 200,
      kill_timeout: 5000,
    },
  ],
};
