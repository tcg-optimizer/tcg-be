# NestJS + TypeScript 포팅 설계

날짜: 2026-06-10
브랜치: `feat/nest-js`

## 목표

Express + JavaScript 백엔드(~8,300줄, 31개 파일)를 NestJS + TypeScript로 포팅한다.

- **API 동작 1:1 보존** — 엔드포인트 경로·메서드·응답 형식·에러 메시지·상태코드를 그대로 유지한다. 단 하나의 예외는 아래 "DB 스키마 단순화"이며, 그로 인한 응답 차이는 [외부 영향](#외부-영향-프론트엔드-확인-필요) 절에 명시된 3가지로 한정한다.
- **제자리 교체** — 이 브랜치에서 `src/`를 NestJS 구조로 교체한다. 기존 JS 코드는 git 히스토리와 master에 남는다.
- **Discord 봇은 범위 제외** — `discord-bot.js`와 그 의존성 `lib/redis-manager.js`는 JS 그대로 `bot/` 폴더로 이동만 한다.
- **검증은 수동** — 자동 테스트는 작성하지 않는다. 기존 서버와 새 서버의 응답을 curl로 비교한다.
- **커밋은 사용자가 직접** — 작업 도구는 어떤 단계에서도 git commit을 실행하지 않는다.

## 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | NestJS 11 + Express 어댑터 | Fastify 미사용 — 기존 Express 미들웨어(helmet, express-rate-limit 등) 동작 보존 |
| 언어 | TypeScript (strict) | |
| ORM | TypeORM + @nestjs/typeorm | mysql2 드라이버, `synchronize: false` |
| 유지 의존성 | axios, cheerio, iconv-lite, ioredis, helmet, cors, express-rate-limit, uuid | 버전 그대로 |
| 제거 의존성 | sequelize | discord.js는 bot/ 용으로 유지 |
| 도구 | prettier(기존 설정 유지) + eslint(typescript-eslint) 추가 | |

## DB 스키마 단순화: CardPriceCache 단일 테이블

### 근거 (코드 분석 결과)

- `CardPrice`는 **write-only 테이블**이다. 코드 전체에 `CardPrice.findAll/findOne`이 없다. 크롤러가 `destroy` 후 `bulkCreate`만 하고, 응답 조립은 DB가 아닌 메모리 인스턴스로 한다. 12시간 후 cleanup이 삭제하므로 히스토리 용도도 아니다.
- tcgshop/carddc 크롤러에는 이미 `cardId === null`일 때 DB 저장을 건너뛰고 크롤링 결과를 그대로 반환하는 분기가 있고, 이 경로로도 서비스가 정상 동작한다.
- `Card`의 실질 역할은 ① 크롤러에 넘길 cardId 제공(= CardPrice 쓰기용), ② 카드 이미지/명칭 재사용인데, ②의 데이터(cardName, image, gameType)는 CardPriceCache에 동일하게 저장된다. Card.expiresAt은 생성 후 갱신되지 않아 캐시와 같은 12시간 수명이다.
- `CardPriceCache`가 실제 서빙 캐시다: 캐시 히트 경로, `GET /api/cards/prices-cache/:id`, `POST /api/cards/optimal-purchase`의 카드 데이터 복원이 전부 이 테이블만 읽는다.

### 결정

- TypeORM 엔티티는 **CardPriceCache 하나만** 만든다.
  - 테이블명 `CardPriceCaches`(Sequelize 복수형 규칙 그대로), camelCase 컬럼, `createdAt`/`updatedAt` 유지.
  - PK는 uuidv7 — `@BeforeInsert()`로 생성 (기존 `defaultValue: () => uuidv7()`와 동일 동작).
  - 컬럼: `id`(uuid PK), `cardName`(varchar, NOT NULL), `image`(varchar, NULL), `gameType`(varchar, NOT NULL, 기본 `yugioh`), `rarityPrices`(JSON, NOT NULL), `expiresAt`(datetime, NOT NULL).
  - 인덱스: `(cardName, gameType, expiresAt)` — 기존과 동일.
- `Cards`/`CardPrices` 테이블은 코드에서만 제거하고 DB에서는 건드리지 않는다. DROP은 포팅 검증 완료 후 별도 작업.
- `sequelize.sync()`는 대체하지 않는다(`synchronize: false`). 스키마는 이미 존재한다고 가정하고, 신규 환경 셋업 방법은 README에 안내한다.

### 크롤러 변경

- 크롤러 3종(naverShopApi, tcgshopCrawler, cardDCCrawler)에서 DB 접근을 전부 제거하고 **순수 "검색 → 메모리 결과 반환"** 함수로 만든다.
  - `cardId` 파라미터 제거. tcgshop/carddc의 기존 cardId-null 분기(결과에 `product` 객체를 붙여 반환)가 유일한 경로가 된다.
  - naverShopApi: `Card.findOrCreate`/`CardPrice.destroy`/`bulkCreate` 제거. card 정보는 메모리에서 구성 — `{ name: cardName, image: 이미지가 있는 첫 번째 검색 결과의 이미지 (없으면 null) }` (기존 `results.find(item => item.image && item.image.trim() !== '')` 로직과 동일). 가격 항목의 `id`는 DB PK 대신 `productId`를 사용한다.
- 부수 효과: 검색 경로의 DB 쓰기가 캐시 저장 1회만 남는다 (기존: 검색마다 DELETE + bulk INSERT).

### 컨트롤러/서비스 변경

- `searchCardPricesFromAllSources`, `searchTCGShop`, `searchCardDC`의 `Card.findOne` 조회 제거.
- `/api/cards/search/tcgshop`, `/api/cards/search/carddc` 응답의 `card` 필드는 항상 `null` (기존에도 Card 행이 없으면 null이었던 필드).
- rarity-prices 응답의 `data.cardId` 필드가 사라진다 — 기존에도 캐시 히트 응답에는 없던 필드라 형식이 오히려 일관돼진다.
- `excludedProductIds` 매칭은 productId 기반으로 동작한다 (`processCardDataStructure`의 기존 fallback 로직이 이미 처리: `product.id || product.productId || URL 추출 || 생성`).

### cleanup 변경

- `cleanupExpiredCardPriceCache`만 남긴다. Card/CardPrice 정리 함수는 포팅하지 않는다.

### 외부 영향 (프론트엔드 확인 필요)

B안(스키마 단순화 동시 진행)의 외부 영향은 아래 3가지가 전부다. 수동 검증 시 프론트엔드가 이들에 의존하지 않는지 확인한다.

1. 신규 검색 응답의 가격 항목 `id`: DB auto-increment PK → `productId` 기반 문자열로 변경 (재크롤링에도 안정적). 가격 항목에서 Sequelize 부가 필드(`cardId`, `expiresAt`, `createdAt`, `updatedAt`)도 사라진다.
2. rarity-prices 응답에서 `data.cardId` 제거.
3. `/api/cards/search/tcgshop`, `/api/cards/search/carddc` 응답의 `card` 객체가 항상 `null`. `/api/cards/search/naver-api`의 `card`는 DB 행 대신 메모리 구성 객체 `{ name, gameType, image }`.

## 모듈 구조 (기존 → 신규)

```
src/
├── main.ts                  ← app.js 부트스트랩: helmet, CORS(동일 origin 규칙),
│                               trust proxy(resolveTrustProxy 동일 로직), x-powered-by 비활성,
│                               uncaughtException/unhandledRejection 핸들러(Redis 에러 발행 포함)
├── app.module.ts
├── (설정 모듈 없음)          ← @nestjs/config 미사용. main.ts 최상단 `import 'dotenv/config'` +
│                               기존처럼 process.env 직접 참조 (1:1 보존, 환경변수 이름 동일)
├── database/                ← TypeORM 설정: mysql, timezone +09:00, pool max 5,
│                               synchronize: false, logging: false
├── entities/
│   └── card-price-cache.entity.ts
├── redis/                   ← lib/redis-manager.js → RedisService
│                               (publisher/subscriber lazy 초기화, publishError, 채널명 동일)
├── cards/
│   ├── cards.controller.ts  ← routes/cards.js 8개 엔드포인트, 경로·메서드 동일
│   └── cards.service.ts     ← cardController.js 비즈니스 로직
│                               (normalizePriceRecord, getOrCreateCardPriceData,
│                                enhanceCardsWithCacheData, processCardDataStructure 등)
├── debug/
│   └── debug.controller.ts  ← routes/debug.js (GET /api/debug/client-ip)
├── crawlers/                ← naver-shop-api / tcgshop-crawler / carddc-crawler (DB 접근 없음),
│                               공용 crawler 유틸, userAgentUtil, rateLimiter(크롤러 호출 제한).
│                               기존처럼 plain 함수 모듈로 유지 (Nest DI 미사용 — 1:1 보존)
├── optimal-purchase/        ← optimizedPurchase/* 5개 파일.
│                               순수 함수 그대로, 타입만 추가. 로직 재작성 절대 금지
├── cleanup/                 ← CardPriceCache 만료 행 정리. onModuleInit + 기존 setInterval 로직(60분)
└── common/
    ├── middleware/          ← internalAuth, apiTrafficGuard, requestLogger, 전역 rate limiter
    ├── filters/             ← error-handler → 전역 ExceptionFilter (응답 JSON 형식 동일)
    └── utils/               ← clientIp, rarityUtil, shippingInfo, gameType, gameTypes 상수
```

분해 원칙: `cardController.js`(1,393줄)는 컨트롤러(라우팅·요청 파싱)와 서비스(로직)로만 나누고 그 이상 분해하지 않는다. 요청 검증은 class-validator를 도입하지 않고 기존 수동 검증 코드를 그대로 이식한다 — 에러 메시지·상태코드가 바뀌면 안 되기 때문이다.

## 미들웨어·횡단 관심사

- 적용 순서를 정확히 보존한다: `/api` 프리픽스에 `apiTrafficGuard → express-rate-limit(분당 60) → internalApiAuth`. Nest `MiddlewareConsumer`로 기존 Express 미들웨어 함수를 그대로 등록한다.
- 핸들러별 rate limiter(cardPriceRateLimiter, optimalPurchaseRateLimiter, cardSearchRateLimiter)와 `cardRequestLimiter`, `createRequestLogger`는 기존처럼 라우트 단위로 적용한다.
- 404 처리(`apiNotFoundHandler`, `notFoundHandler`)와 전역 에러 핸들러는 ExceptionFilter로 옮기되 응답 본문을 동일하게 맞춘다.
- `GET /` 루트 환영 메시지 동일 유지.

## Discord 봇·빌드

- `src/discord-bot.js` + `src/lib/redis-manager.js`를 `bot/`으로 이동(JS 유지), `npm run discord-bot` 경로 수정. NestJS의 RedisService가 동일한 채널명으로 에러를 발행하므로 봇은 수정 없이 동작한다.
- npm scripts: `build`(nest build), `start`(node dist/main), `dev`(nest start --watch), `discord-bot`(node bot/discord-bot.js).

## 검증 계획 (수동)

기존 서버(master)와 새 서버(feat/nest-js)를 로컬에서 동시에 띄워 비교한다.

1. `GET /api/cards/yugioh-rarity-prices?cardName=...` — 응답 형식 비교 (신규 검색·캐시 히트 각각, `data.cardId`·가격 `id` 차이는 예상된 변경)
2. `POST /api/cards/optimal-purchase` — 동일 입력 → 동일 출력 (가장 중요: greedy 알고리즘 1:1 검증)
3. `GET /api/cards/prices-cache/:id` — 정상·만료(410)·잘못된 ID(400) 케이스
4. 에러 응답: 404(없는 카드·센터 카드), rate limit(429), 내부 인증 실패, CORS 거부
5. `GET /api/debug/client-ip` — trust proxy 동작 확인
6. cleanup 스케줄러 동작 로그 확인
7. Discord 봇: 에러 발행 → 봇 수신 확인
8. 프론트엔드 연동: [외부 영향](#외부-영향-프론트엔드-확인-필요) 3가지 확인

## 명시적 비범위 (Out of Scope)

- Discord 봇의 TypeScript 전환
- `Cards`/`CardPrices` 테이블 DROP (검증 완료 후 별도 작업)
- 자동 테스트 작성
- class-validator 등 NestJS 관용 패턴으로의 리팩토링 (포팅 완료 후 별도 작업)
- 응답 형식·에러 메시지 개선
