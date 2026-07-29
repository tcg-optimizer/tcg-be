"use strict";
// 도메인 공유 타입 정의.
//
// 설계 원칙 (타입 강화 1·2단계):
// - 코드 전반을 흐르는 "이름 없던 형태"에 이름을 붙이는 것이 목적이다. 런타임 동작은
//   바꾸지 않는다 — 모호함이 드러나도 고치지 않고 느슨한 타입으로 기록한다.
// - JS 시절의 동적 필드 접근을 보존해야 하는 형태에는 인덱스 시그니처([key: string]: any)를
//   남긴다. 폐쇄형(closed) 타입으로 조이는 것은 characterization 테스트 확보 후의 작업.
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map