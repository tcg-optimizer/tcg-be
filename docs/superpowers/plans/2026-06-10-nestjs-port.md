# NestJS + TypeScript 포팅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Express + JavaScript 백엔드를 NestJS 11 + TypeScript로 1:1 포팅하되, DB는 CardPriceCache 단일 테이블로 단순화한다 (스펙: `docs/superpowers/specs/2026-06-10-nestjs-port-design.md`).

**Architecture:** NestJS(Express 어댑터) 위에 기존 코드를 모듈별로 번역한다. HTTP 계층(컨트롤러/미들웨어/필터)만 Nest 구조를 쓰고, 크롤러·유틸·최적화 알고리즘은 기존처럼 plain 함수 모듈로 유지한다. ORM은 TypeORM(synchronize: false), 엔티티는 CardPriceCache 하나. 크롤러의 Card/CardPrice DB 접근은 전부 제거한다.

**Tech Stack:** NestJS 11, TypeScript(strict), TypeORM 0.3, mysql2, ioredis, axios, cheerio 1.0.0-rc.10, iconv-lite, express-rate-limit 7, helmet 8, uuid(v7)

---

## 전역 규칙 (모든 태스크 공통)

1. **커밋 금지.** 사용자가 직접 커밋한다. 각 태스크 끝의 "커밋 포인트"는 사용자에게 알리는 지점일 뿐, git 명령을 실행하지 않는다.
2. **자동 테스트 작성 금지.** 검증은 `npx tsc --noEmit`(또는 `npm run build`)와 Task 16의 수동 검증으로 한다.
3. **번역 규칙 (JS → TS):**
   - `require` → `import`, `module.exports` → named `export`. export 목록은 원본 `module.exports`와 정확히 동일하게.
   - 로직·문자열·로그 메시지·정규식·주석은 **절대 변경 금지**. 한 줄씩 대응하는 번역만 한다. 버그처럼 보여도 고치지 않는다 (예: uncaughtException에서 publish를 await하지 않고 exit하는 것).
   - 타입: exported 함수 시그니처에는 타입을 붙인다. 객체 형태가 동적이라 자명하지 않으면 **명시적 `any`** 를 쓴다 (strict 모드에서 implicit any만 금지). 내부 변수는 추론에 맡긴다. 정밀 타이핑은 포팅 범위 밖이다.
   - Express 타입은 `import type { Request, Response, NextFunction } from 'express'`.
4. **파일 삭제:** 각 태스크에서 포팅이 끝난 원본 JS 파일은 그 태스크에서 삭제한다(`rm`). git 히스토리에 남는다.
5. 각 태스크 종료 시: `npx tsc --noEmit` 통과 확인 → 사용자에게 커밋 포인트 안내.

---

### Task 1: Discord 봇 분리 (bot/)

**Files:**
- Create: `bot/discord-bot.js` (이동), `bot/redis-manager.js` (이동)
- Delete: `src/discord-bot.js`, `src/lib/redis-manager.js`는 **아직 삭제하지 않는다** — `src/lib/redis-manager.js`는 복사만 한다 (기존 앱이 아직 참조하므로 Task 15에서 일괄 삭제).

- [ ] **Step 1: bot 디렉토리 생성 및 파일 이동/복사**

```bash
mkdir -p /home/qli/tcgscanner/tcg-be/bot
git mv src/discord-bot.js bot/discord-bot.js
cp src/lib/redis-manager.js bot/redis-manager.js
```

- [ ] **Step 2: require 경로 수정**

`bot/discord-bot.js` 2번째 줄:

```js
// 변경 전
const redisManager = require('./lib/redis-manager');
// 변경 후
const redisManager = require('./redis-manager');
```

- [ ] **Step 3: 동작 확인**

```bash
node -e "require('/home/qli/tcgscanner/tcg-be/bot/redis-manager'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: 커밋 포인트** — 사용자 안내: "bot/ 분리 완료"

---

### Task 2: NestJS 프로젝트 스캐폴드

**Files:**
- Modify: `package.json` (전면 재작성)
- Create: `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `src/main.ts`(최소), `src/app.module.ts`(최소)
- Modify: `.gitignore` (dist 추가)

- [ ] **Step 1: package.json 재작성**

```json
{
  "name": "cards-price-comparison",
  "version": "2.0.0",
  "main": "dist/main.js",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "dev": "nest start --watch",
    "discord-bot": "node bot/discord-bot.js",
    "lint": "eslint \"src/**/*.ts\"",
    "format": "prettier --write \"src/**/*.ts\" \"bot/**/*.js\" \"*.json\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"bot/**/*.js\" \"*.json\""
  },
  "keywords": ["yugioh", "card", "price", "comparison", "crawler"],
  "author": "",
  "license": "ISC",
  "description": "유희왕 카드 가격 비교 웹 애플리케이션",
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "axios": "^1.8.4",
    "cheerio": "1.0.0-rc.10",
    "discord.js": "^14.20.0",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.1.0",
    "iconv-lite": "^0.6.3",
    "ioredis": "^5.3.2",
    "mysql2": "^3.14.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.21",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@nestjs/cli": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.5.3",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

제거된 의존성: `express`(platform-express에 포함), `cors`(Nest enableCors 내장), `sequelize`, `nodemon`. `discord.js`/`dotenv`는 bot용으로 유지.

- [ ] **Step 2: tsconfig.json 생성**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2023",
    "lib": ["ES2023"],
    "declaration": false,
    "removeComments": false,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "bot"]
}
```

- [ ] **Step 3: tsconfig.build.json 생성**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "bot"]
}
```

- [ ] **Step 4: nest-cli.json 생성**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: eslint.config.mjs 생성**

```js
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'bot/**', 'node_modules/**', 'scripts/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  }
);
```

- [ ] **Step 6: .gitignore에 빌드 산출물 추가**

`.gitignore` 끝에 추가:

```
# 빌드 산출물
dist/
*.tsbuildinfo
```

- [ ] **Step 7: 최소 부트스트랩 생성**

`src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

`src/main.ts`:

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ? Number(process.env.PORT) : 0;
  await app.listen(port, process.env.HOST || '0.0.0.0');
}

void bootstrap();
```

(`import 'dotenv/config'`가 **반드시 첫 import** — 이후 모든 모듈이 평가 시점에 process.env를 읽을 수 있게 한다. 기존 app.js의 `dotenv.config()` 위치와 같은 역할.)

- [ ] **Step 8: 설치 및 빌드 확인**

```bash
npm install
npm run build
```
Expected: 에러 없이 완료, `dist/main.js` 생성. (기존 `src/*.js`는 tsc 대상이 아니므로 그대로 무시된다.)

- [ ] **Step 9: 커밋 포인트** — "NestJS 스캐폴드 완료"

---

### Task 3: 게임 타입 상수·유틸 + clientIp

**Files:**
- Create: `src/common/constants/game-types.ts` ← `src/constants/gameTypes.js`
- Create: `src/common/utils/game-type.ts` ← `src/utils/gameType.js`
- Create: `src/common/utils/client-ip.ts` ← `src/utils/clientIp.js`
- Delete: `src/constants/gameTypes.js`, `src/utils/gameType.js`, `src/utils/clientIp.js`

- [ ] **Step 1: game-types.ts 작성**

```ts
export const GAME_TYPES = Object.freeze({
  YUGIOH: 'yugioh',
  VANGUARD: 'vanguard',
  ONEPIECE: 'onepiece',
} as const);

export type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

export const SUPPORTED_GAME_TYPES: readonly string[] = Object.freeze(Object.values(GAME_TYPES));

export const GAME_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  [GAME_TYPES.YUGIOH]: '유희왕',
  [GAME_TYPES.VANGUARD]: '뱅가드',
  [GAME_TYPES.ONEPIECE]: '원피스',
});
```

- [ ] **Step 2: game-type.ts 작성**

```ts
import { GAME_TYPES, SUPPORTED_GAME_TYPES } from '../constants/game-types';

export function normalizeGameType(gameType: unknown, fallback: string = GAME_TYPES.YUGIOH): string {
  if (!gameType || typeof gameType !== 'string') {
    return fallback;
  }

  const normalized = gameType.trim().toLowerCase();
  if (SUPPORTED_GAME_TYPES.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

export function isValidGameType(gameType: unknown): boolean {
  if (!gameType || typeof gameType !== 'string') {
    return false;
  }

  return SUPPORTED_GAME_TYPES.includes(gameType.trim().toLowerCase());
}
```

- [ ] **Step 3: client-ip.ts 작성** — `src/utils/clientIp.js`를 번역 규칙대로 1:1 번역. 시그니처:

```ts
import type { Request } from 'express';

function normalizeIp(ip: string | null | undefined): string | null;
export function getForwardedIpList(req: Request): string[];
export function getForwardedIp(req: Request): string | null;
export function getClientIp(req: Request): string;
export function getRateLimitKey(req: Request, suffix?: string | null): string;
```

(원본의 `req.get?.('x-client-ip')`, `req.connection` 등 옵셔널 접근은 그대로 유지. `req.connection`은 Express 5 타입에 없으므로 `(req as any).connection?.remoteAddress`로 캐스팅.)

- [ ] **Step 4: 원본 3개 파일 삭제 후 컴파일 확인**

```bash
rm src/constants/gameTypes.js src/utils/gameType.js src/utils/clientIp.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 5: 커밋 포인트** — "공통 상수/유틸 1차 포팅"

---

### Task 4: 순수 유틸 번역 (rarity / userAgent / shipping)

**Files:**
- Create: `src/common/utils/rarity-util.ts` ← `src/utils/rarityUtil.js` (256줄)
- Create: `src/common/utils/user-agent-util.ts` ← `src/utils/userAgentUtil.js` (191줄)
- Create: `src/common/utils/shipping-info.ts` ← `src/utils/shippingInfo.js` (885줄)
- Delete: 원본 3개

- [ ] **Step 1: rarity-util.ts 번역** — exported 시그니처:

```ts
export function parseYugiohRarity(title: string): string;
export function parseVanguardRarity(title: string): string;
export function parseOnepieceRarity(title: string): string;
export function normalizeRarity(rarity: any, options?: { gameType?: string; cardCode?: string | null }): any;
export function parseRarity(title: string, gameType?: string): string;
```
(원본 export 목록과 대조해 동일하게. 내부 레어도 매핑 테이블·정규식은 글자 하나 바꾸지 않는다.)

- [ ] **Step 2: user-agent-util.ts 번역** — 시그니처:

```ts
export function getRandomUserAgent(includeMobile?: boolean): string;
export function getRandomizedHeaders(includeMobile?: boolean, additionalHeaders?: Record<string, string>): Record<string, string>;
export function generateRandomCookies(site: string): string;
export function getSiteSpecificHeaders(site: string, additionalHeaders?: Record<string, string>, includeCookies?: boolean): Record<string, string>;
export function createCrawlerConfig(site: string, options?: any): any;
```
(원본 module.exports 목록 확인 후 동일하게 export.)

- [ ] **Step 3: shipping-info.ts 번역** — 885줄 대부분이 판매처별 배송비 데이터 객체. 데이터 객체는 `const SHIPPING_INFO: Record<string, any> = { ... }` 형태로 통째로 복사. 시그니처:

```ts
export function normalizeSellerName(sellerName: string): string;
export function shouldSkipMarketplace(sellerName: string): boolean;
export function getShippingInfo(site: string): any;
export function calculateShippingFee(/* 원본 파라미터 그대로 */): number;
// REGION_TYPES 등 원본 module.exports(875행)의 모든 항목을 동일하게 export
```

- [ ] **Step 4: 원본 삭제 후 컴파일 확인**

```bash
rm src/utils/rarityUtil.js src/utils/userAgentUtil.js src/utils/shippingInfo.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 5: 커밋 포인트** — "순수 유틸 포팅 (rarity/userAgent/shipping)"

---

### Task 5: Redis 모듈

**Files:**
- Create: `src/redis/redis.service.ts` ← `src/lib/redis-manager.js`
- Create: `src/redis/redis.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: redis.service.ts 작성**

```ts
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  getPublisher(): Redis {
    if (!this.publisher) {
      this.publisher = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT as string) || 6379,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.publisher.on('error', err => {
        console.error('Redis Publisher error:', err);
      });
    }
    return this.publisher;
  }

  getSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT as string) || 6379,
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.subscriber.on('error', err => {
        console.error('Redis Subscriber error:', err);
      });
    }
    return this.subscriber;
  }

  async publishError(errorData: any): Promise<boolean> {
    try {
      const publisher = this.getPublisher();
      await publisher.publish('error-logs', JSON.stringify(errorData));
      console.log('Error published to Redis successfully');
      return true;
    } catch (err) {
      console.error('Failed to publish error:', err);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
    } catch (err) {
      console.error('Error disconnecting Redis:', err);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }
}
```

주의: 원본의 `retryDelayOnFailover: 100`은 ioredis v5에 존재하지 않는 옵션(무시되던 죽은 옵션)이므로 타입 에러를 피하기 위해 제거한다. 채널명 `'error-logs'`는 봇이 구독하므로 절대 변경 금지.

- [ ] **Step 2: redis.module.ts 작성**

```ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 3: app.module.ts에 RedisModule 등록**

```ts
import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [RedisModule],
})
export class AppModule {}
```

- [ ] **Step 4: 컴파일 확인** — `npx tsc --noEmit` Expected: 에러 없음

- [ ] **Step 5: 커밋 포인트** — "Redis 모듈 포팅"

---

### Task 6: TypeORM 설정 + CardPriceCache 엔티티

**Files:**
- Create: `src/entities/card-price-cache.entity.ts`
- Create: `src/database/database.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: 엔티티 작성**

```ts
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { GAME_TYPES } from '../common/constants/game-types';

// Sequelize가 생성한 기존 테이블(CardPriceCaches)을 그대로 사용한다. synchronize: false.
@Entity({ name: 'CardPriceCaches' })
@Index(['cardName', 'gameType', 'expiresAt'])
export class CardPriceCache {
  // strict 모드(strictPropertyInitialization)에서 TypeORM 엔티티는 `!` 한정자 필요
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  cardName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image!: string | null;

  @Column({ type: 'varchar', length: 255, default: GAME_TYPES.YUGIOH })
  gameType!: string;

  // 레어도별 가격 정보 JSON 객체
  @Column({ type: 'json' })
  rarityPrices!: any;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  // Create/UpdateDateColumn 금지: 기존 테이블은 Sequelize가 DEFAULT 없이 NOT NULL로
  // 생성했고, TypeORM 날짜 데코레이터는 INSERT 시 DB 기본값에 의존해
  // ER_NO_DEFAULT_FOR_FIELD로 실패한다 (Task 16 검증에서 발견). 앱에서 직접 채운다.
  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime' })
  updatedAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Sequelize의 timestamps: true 동작 재현
  @BeforeInsert()
  setInsertTimestamps() {
    const now = new Date();
    if (!this.createdAt) {
      this.createdAt = now;
    }
    this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdateTimestamp() {
    this.updatedAt = new Date();
  }
}
```
(import에 `BeforeUpdate` 추가, `CreateDateColumn`/`UpdateDateColumn` 제거)

- [ ] **Step 2: database.module.ts 작성**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql' as const,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [CardPriceCache],
        synchronize: false,
        logging: false,
        timezone: '+09:00',
        extra: {
          connectionLimit: 5,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
```

(기존 db.js와 동일: timezone +09:00, pool max 5 → connectionLimit 5. `synchronize: false`는 스펙 결정 사항 — 기존 테이블을 절대 ALTER하지 않는다.)

- [ ] **Step 3: app.module.ts에 DatabaseModule 추가**

```ts
imports: [RedisModule, DatabaseModule],
```

- [ ] **Step 4: 컴파일 + 기동 확인** (로컬 MySQL 환경변수가 있다면)

```bash
npx tsc --noEmit && npm run build
```
Expected: 에러 없음. (DB 연결은 Task 16에서 통합 확인)

- [ ] **Step 5: 커밋 포인트** — "TypeORM + CardPriceCache 엔티티"

---

### Task 7: 크롤러 공용 유틸 (crawler / rate-limiter)

**Files:**
- Create: `src/crawlers/crawler.ts` ← `src/utils/crawler.js` (512줄)
- Create: `src/crawlers/rate-limiter.ts` ← `src/utils/rateLimiter.js` (147줄)
- Delete: 원본 2개 + `src/utils/db.js` (rate-limiter가 redisClient의 마지막 사용처. Sequelize 부분은 이미 대체됨)

- [ ] **Step 1: crawler.ts 번역** — 시그니처:

```ts
export function detectIllustration(title: string): string;
export function parseYugiohLanguage(title: string): string;
export function parseVanguardLanguage(title: string): string;
export function parseOnepieceLanguage(title: string): string;
export function parseLanguage(title: string, gameType?: string): string;
export function extractYugiohCardCode(title: string): string | null;
export function extractVanguardCardCode(title: string): string | null;
export function extractOnepieceCardCode(title: string): string | null;
export function extractCardCode(title: string, gameType?: string): string | null;
export function parseCondition(title: string): string;
export function encodeEUCKR(cardName: string): string;
```
(원본 module.exports(506행)와 대조해 동일하게. iconv-lite는 `import iconv from 'iconv-lite'`.)

- [ ] **Step 2: rate-limiter.ts 번역** — 핵심 변경: redisClient를 기존 `db.js`에서 가져오던 것을 **모듈 스코프에서 직접 생성** (기존 db.js의 클라이언트 생성 코드를 이 파일로 이전):

```ts
import Redis from 'ioredis';
import type { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../common/utils/client-ip';

// 기존 utils/db.js의 redisClient를 이 파일로 이전 (마지막 사용처가 여기뿐)
const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
});

export const RATE_LIMITS: Record<string, number> = { ... }; // 원본 그대로
// trackCardRequest, cleanupCardRequestCache, setInterval(cleanupCardRequestCache, 300000),
// checkRateLimit, waitForRateLimit 전부 원본 그대로 번역

export function withRateLimit<T extends (...args: any[]) => Promise<any>>(fn: T, site: string): T;
export function cardRequestLimiter(req: Request, res: Response, next: NextFunction): void;
export { checkRateLimit, waitForRateLimit };
```

주의: 모듈 스코프 `new Redis(...)`는 import 시점에 실행된다. main.ts 첫 줄의 `import 'dotenv/config'` 덕에 env는 이미 로드되어 있다 (기존 app.js → db.js와 같은 순서).

- [ ] **Step 3: 원본 삭제 후 컴파일 확인**

```bash
rm src/utils/crawler.js src/utils/rateLimiter.js src/utils/db.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: 커밋 포인트** — "크롤러 공용 유틸 포팅"

---

### Task 8: 네이버 쇼핑 API 크롤러 (DB 제거)

**Files:**
- Create: `src/crawlers/naver-shop-api.ts` ← `src/utils/naverShopApi.js` (336줄)
- Delete: `src/utils/naverShopApi.js`

- [ ] **Step 1: 검색 부분(1~241행) 1:1 번역** — `delay`, `getGameSearchPrefix`, `getExcludedShops`, `shouldExcludeByCrossGameTitle`, `searchNaverShop`(파싱·중복제거 로직 전부), `searchNaverShopWithRateLimit = withRateLimit(searchNaverShop, 'naver')`. import에서 `Card`/`CardPrice`/`Op` 제거.

- [ ] **Step 2: `searchAndSaveCardPricesApi`를 DB 없는 버전으로 재작성** (스펙의 핵심 변경점. 아래 코드 그대로):

```ts
export const searchAndSaveCardPricesApi = async (
  cardName: string,
  options: { gameType?: string } = {}
): Promise<any> => {
  try {
    const gameType = normalizeGameType(options.gameType, GAME_TYPES.YUGIOH);
    const results = await searchNaverShopWithRateLimit(cardName, gameType);

    // 기존 Card.findOrCreate 대체: 카드 정보를 메모리에서 구성
    const itemWithImage = results.find((item: any) => item.image && item.image.trim() !== '');
    const card = {
      name: cardName,
      gameType,
      image: itemWithImage ? itemWithImage.image : null,
    };

    if (results.length === 0) {
      return { message: '검색 결과가 없습니다.', card, count: 0 };
    }

    // 기존 CardPrice.bulkCreate 대체: DB 저장 없이 메모리 객체로 구성.
    // id는 DB PK 대신 productId 사용 (스펙 외부 영향 #1)
    const savedPrices = results.map((item: any) => ({
      id: item.productId,
      title: item.title,
      site: `Naver_${item.site}`,
      price: item.price,
      url: item.url,
      condition: item.condition,
      rarity: item.rarity,
      language: item.language,
      available: item.available,
      cardCode: item.cardCode,
      lastUpdated: new Date(),
      productId: item.productId,
      illustration: item.illustration,
    }));

    return {
      card,
      prices: savedPrices,
      count: savedPrices.length,
      rawResults: results,
    };
  } catch (error) {
    console.error('카드 가격 저장 오류:', error);
    throw error;
  }
};
```

- [ ] **Step 3: export 정리**

```ts
export { searchNaverShopWithRateLimit as searchNaverShop };
```
(원본과 동일한 export 이름 유지: `searchNaverShop`, `searchAndSaveCardPricesApi`)

- [ ] **Step 4: 원본 삭제 후 컴파일**

```bash
rm src/utils/naverShopApi.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 5: 커밋 포인트** — "네이버 크롤러 포팅 (DB 제거)"

---

### Task 9: TCGShop 크롤러 (DB 제거)

**Files:**
- Create: `src/crawlers/tcgshop-crawler.ts` ← `src/utils/tcgshopCrawler.js` (525줄)
- Delete: 원본

- [ ] **Step 1: 크롤링 함수 1:1 번역** — `crawlTCGShop`, `crawlTCGShopVanguard`(EUC-KR 인코딩, cheerio 파싱 전부 그대로), `withRateLimit` 래핑 그대로. **`cardId` 파라미터는 모든 함수에서 제거** (크롤링 함수 내부에서 cardId를 쓰는 부분이 있으면 해당 인자만 제거하고 로직 유지 — 원본 확인 결과 cardId는 저장 단계에서만 사용됨).

- [ ] **Step 2: `searchAndSaveTCGShopPrices`를 DB 없는 버전으로 재작성** — 기존 cardId-null 분기를 유일한 경로로 만든다:

```ts
export async function searchAndSaveTCGShopPrices(cardName: string, gameType: string = GAME_TYPES.YUGIOH): Promise<any> {
  try {
    gameType = normalizeGameType(gameType, GAME_TYPES.YUGIOH);

    // gameType에 따라 적절한 크롤링 함수 선택 (원본 그대로)
    let priceData: any[];
    if (gameType === GAME_TYPES.VANGUARD || gameType === GAME_TYPES.ONEPIECE) {
      priceData = await crawlTCGShopVanguardWithRateLimit(cardName, gameType);
    } else {
      priceData = await crawlTCGShopWithRateLimit(cardName, gameType);
    }

    if (priceData.length === 0) {
      return {
        message: 'TCGShop에서 검색 결과가 없습니다.',
        count: 0,
      };
    }

    return {
      message: `TCGShop에서 ${priceData.length}개의 가격 정보를 찾았습니다.`,
      count: priceData.length,
      prices: priceData.map(item => {
        return {
          ...item,
          product: {
            id: item.productId.toString(),
            url: item.url,
            site: 'TCGShop',
            price: item.price,
            available: item.available,
            cardCode: item.cardCode,
            condition: item.condition,
            language: item.language,
            rarity: item.rarity,
            illustration: item.illustration || 'default',
          },
        };
      }),
    };
  } catch (error: any) {
    console.error('[ERROR] TCGShop 가격 검색 및 저장 오류:', error);
    return {
      message: `TCGShop 가격 검색 중 오류 발생: ${error.message}`,
      count: 0,
      error: error.message,
    };
  }
}
```

(기존 응답의 `cardId` 필드는 항상 null이었으므로 제거. `CardPrice.destroy`/`bulkCreate` 블록 전체 삭제. prices 매핑은 원본 490~508행의 null-cardId 분기와 동일.)

- [ ] **Step 3: 원본 삭제 후 컴파일**

```bash
rm src/utils/tcgshopCrawler.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: 커밋 포인트** — "TCGShop 크롤러 포팅 (DB 제거)"

---

### Task 10: CardDC 크롤러 (DB 제거)

**Files:**
- Create: `src/crawlers/carddc-crawler.ts` ← `src/utils/cardDCCrawler.js` (497줄)
- Delete: 원본

- [ ] **Step 1: 크롤링 함수 1:1 번역** — `crawlCardDC`, `crawlCardDCVanguard`(cheerio 파싱 전부 그대로, cardId 파라미터 제거), `withRateLimit` 래핑 그대로.

- [ ] **Step 2: `searchAndSaveCardDCPrices`를 DB 없는 버전으로 재작성** (아래 코드 그대로):

```ts
export async function searchAndSaveCardDCPrices(cardName: string, gameType: string = GAME_TYPES.YUGIOH): Promise<any> {
  try {
    gameType = normalizeGameType(gameType, GAME_TYPES.YUGIOH);

    // gameType에 따라 적절한 크롤링 함수 선택
    let results: any[];
    if (gameType === GAME_TYPES.VANGUARD || gameType === GAME_TYPES.ONEPIECE) {
      results = await crawlCardDCVanguardWithRateLimit(cardName, gameType);
    } else {
      results = await crawlCardDCWithRateLimit(cardName, gameType);
    }

    if (results.length === 0) {
      return {
        message: 'CardDC에서 검색 결과가 없습니다.',
        count: 0,
      };
    }

    return {
      message: `CardDC에서 ${results.length}개의 가격 정보를 찾았습니다.`,
      count: results.length,
      prices: results.map(item => {
        return {
          ...item,
          product: {
            id: item.productId,
            url: item.url,
            site: 'CardDC',
            price: item.price,
            available: item.available,
            cardCode: item.cardCode,
            condition: item.condition,
            language: item.language,
            rarity: item.rarity,
            illustration: item.illustration || 'default',
          },
        };
      }),
    };
  } catch (error: any) {
    console.error('[ERROR] CardDC 가격 검색 및 저장 오류:', error);
    return {
      message: `CardDC 가격 검색 중 오류 발생: ${error.message}`,
      count: 0,
      error: error.message,
    };
  }
}
```

(TCGShop과 달리 `product.id`는 `item.productId` 그대로 — toString 없음, 원본 468행과 동일.)

- [ ] **Step 3: 원본 삭제 후 컴파일**

```bash
rm src/utils/cardDCCrawler.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: 커밋 포인트** — "CardDC 크롤러 포팅 (DB 제거)"

---

### Task 11: 최적 구매 알고리즘 (순수 번역)

**Files:**
- Create: `src/optimal-purchase/card-utils.ts` ← `src/utils/optimizedPurchase/cardUtils.js` (176줄)
- Create: `src/optimal-purchase/points-utils.ts` ← `pointsUtils.js` (94줄)
- Create: `src/optimal-purchase/greedy-algorithm.ts` ← `greedyAlgorithm.js` (1,582줄)
- Create: `src/optimal-purchase/optimization-strategies.ts` ← `optimizationStrategies.js` (683줄)
- Create: `src/optimal-purchase/index.ts` ← `index.js` (555줄)
- Delete: `src/utils/optimizedPurchase/` 디렉토리 전체

**이 태스크가 가장 위험하다. 로직 재작성 절대 금지 — 변수명, 루프 구조, 조건식, Math 연산 순서까지 그대로 옮긴다. 타입은 시그니처에만 붙이고 내부는 any 천국이어도 허용.**

- [ ] **Step 1: card-utils.ts 번역** (의존성 없음 쪽부터)

```ts
export function getSellerId(seller: any): string;
export function filterTopSellers(cardsList: any[], options: any): any[];
export function isNaverStore(seller: any): boolean;
```

- [ ] **Step 2: points-utils.ts 번역**

```ts
export function calculateNaverPoints(/* 원본 파라미터 그대로 */): number;
export function calculatePointsAmount(/* 원본 파라미터 그대로 */): number;
```

- [ ] **Step 3: greedy-algorithm.ts 번역** (1,582줄 — 시간이 걸려도 한 줄씩 대응)

```ts
export function findGreedyOptimalPurchase(cardsList: any[], options?: any): any;
// generateFreeShippingCombinations, generateConsistentProductId, simpleStringHash 등
// 원본 module.exports(1580행) 목록과 동일하게 export
```

- [ ] **Step 4: optimization-strategies.ts 번역**

```ts
// tryMoveCardsToReachThreshold, tryMultipleCardsMove, trySellersConsolidation —
// 원본 module.exports(679행)와 동일하게
```

- [ ] **Step 5: index.ts 번역**

```ts
export function findOptimalPurchaseCombination(cardsList: any[], options?: any): any;
// 원본 module.exports(548행)와 동일하게
```

- [ ] **Step 6: 원본 디렉토리 삭제 후 컴파일**

```bash
rm -rf src/utils/optimizedPurchase
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 7: (선택이지만 강력 권장) 번역 검증 — git stash 없이 원본과 diff 가능한 형태 확인**

master의 원본 파일과 새 파일을 나란히 놓고 함수 개수·이름·순서가 일치하는지 확인:

```bash
git show master:src/utils/optimizedPurchase/greedyAlgorithm.js | grep -c "^function\|^  function"
grep -c "^function\|^export function" src/optimal-purchase/greedy-algorithm.ts
```
Expected: 두 숫자가 같음 (함수 누락 없음)

- [ ] **Step 8: 커밋 포인트** — "최적 구매 알고리즘 포팅"

---

### Task 12: CardsService (cardController 비즈니스 로직)

**Files:**
- Create: `src/cards/cards.service.ts` ← `src/controllers/cardController.js`의 17~802행 + 1122~1143행
- Create: `src/cards/cards.module.ts` (스켈레톤)
- Modify: `src/app.module.ts`

- [ ] **Step 1: cards.service.ts 작성** — 클래스 구조:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
// searchAndSaveCardPricesApi, searchAndSaveTCGShopPrices, searchAndSaveCardDCPrices,
// findOptimalPurchaseCombination, shouldSkipMarketplace, parseCondition,
// normalizeRarity, GAME_TYPES, normalizeGameType import

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardPriceCache)
    private readonly cacheRepo: Repository<CardPriceCache>
  ) {}

  normalizePriceRecord(rawPrice: any, gameType?: string): any { /* 17~63행 그대로 */ }
  async searchCardPricesFromAllSources(cardName: string, gameType?: string): Promise<any> { /* 아래 Step 2 */ }
  async getOrCreateCardPriceData(cardName: string, cacheId?: string | null, gameType?: string): Promise<any> { /* 아래 Step 3 */ }
  async enhanceCardsWithCacheData(cards: any[]): Promise<any[]> { /* 507~568행, findByPk → findOneBy */ }
  processCardDataStructure(cards: any[]): any[] { /* 570~802행 그대로 (DB 무관) */ }
  calculateTotalProducts(rarityPrices: any): number { /* 1122~1143행 그대로 */ }
}
```

- [ ] **Step 2: searchCardPricesFromAllSources — Card.findOne 제거 버전**

```ts
async searchCardPricesFromAllSources(cardName: string, gameType: string = GAME_TYPES.YUGIOH): Promise<any> {
  gameType = normalizeGameType(gameType, GAME_TYPES.YUGIOH);

  // (기존 Card.findOne / cardId 조회 제거 — 스펙 결정)
  const [naverResult, tcgshopResult, cardDCResult] = await Promise.all([
    searchAndSaveCardPricesApi(cardName, { gameType }).catch((error: any) => {
      console.error(`[ERROR] 네이버 API 검색 오류: ${error.message}`);
      return { count: 0, prices: [], rawResults: [] };
    }),

    searchAndSaveTCGShopPrices(cardName, gameType).catch((error: any) => {
      console.error(`[ERROR] TCGShop 검색 오류: ${error.message}`);
      return { count: 0, prices: [] };
    }),

    searchAndSaveCardDCPrices(cardName, gameType).catch((error: any) => {
      console.error(`[ERROR] CardDC 검색 오류: ${error.message}`);
      return { count: 0, prices: [] };
    }),
  ]);
  // 이하 94~121행 그대로 (hasResults, combinedPrices, cardInfo, return)
}
```

- [ ] **Step 3: getOrCreateCardPriceData — Sequelize → TypeORM 치환표** (나머지 로직 124~505행 그대로):

| 원본 (Sequelize) | 변경 (TypeORM) |
|---|---|
| `CardPriceCache.findByPk(cacheId)` | `this.cacheRepo.findOneBy({ id: cacheId })` |
| `CardPriceCache.findOne({ where: { cardName, gameType, expiresAt: { [Op.gt]: new Date() } } })` | `this.cacheRepo.findOne({ where: { cardName, gameType, expiresAt: MoreThan(new Date()) } })` |
| `cachedResult.update({ expiresAt: new Date(Date.now() - 1000) })` | `cachedResult.expiresAt = new Date(Date.now() - 1000); await this.cacheRepo.save(cachedResult);` |
| `cachedResult.update({ cardName, image, gameType, rarityPrices, expiresAt })` | `Object.assign(cachedResult, { cardName: ..., image: ..., gameType, rarityPrices, expiresAt }); await this.cacheRepo.save(cachedResult); cacheEntry = cachedResult;` |
| `CardPriceCache.create({ ... })` | `await this.cacheRepo.save(this.cacheRepo.create({ ... }))` |

센터 카드 체크, 캐시 정규화/무효화, 필터링, rarityPrices 조립, 이미지 매핑(375~463행)은 **한 글자도 바꾸지 않는다**. `naverResult.card`는 이제 `{ name, gameType, image }` 메모리 객체이므로 `searchCard.image`/`searchCard.name` 접근은 그대로 동작한다. `searchCard.cardCode` 접근(282~288행)은 undefined가 되어 기존의 "naver card에 cardCode 없음" 케이스와 동일하게 통과한다.

- [ ] **Step 4: cards.module.ts 스켈레톤 + app.module 등록**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
import { CardsService } from './cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardPriceCache])],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
```

app.module.ts: `imports: [RedisModule, DatabaseModule, CardsModule]`

- [ ] **Step 5: 컴파일 확인** — `npx tsc --noEmit` Expected: 에러 없음

- [ ] **Step 6: 커밋 포인트** — "CardsService 포팅"

---### Task 13: 라우트 미들웨어 + CardsController + DebugController

**Files:**
- Create: `src/cards/cards.rate-limiters.ts` ← cardController.js 804~843행
- Create: `src/common/middleware/request-logger.middleware.ts` ← `src/utils/requestLogger.js`
- Create: `src/cards/cards.controller.ts` ← cardController.js 845~1120행, 1145~1382행 + routes/cards.js
- Create: `src/debug/debug.controller.ts` ← routes/debug.js
- Modify: `src/cards/cards.module.ts` (컨트롤러 등록 + 라우트별 미들웨어 배선)
- Delete: `src/utils/requestLogger.js`, `src/routes/cards.js`, `src/routes/debug.js`, `src/controllers/cardController.js`

- [ ] **Step 1: cards.rate-limiters.ts 작성** — 804~843행의 3개 limiter를 그대로:

```ts
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { getRateLimitKey } from '../common/utils/client-ip';

export const cardPriceRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '카드 가격 검색 요청이 너무 많습니다. 30초 후에 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => {
    return getRateLimitKey(req, (req.query.cardName as string) || 'unknown');
  },
});
// optimalPurchaseRateLimiter(30초/15회), cardSearchRateLimiter(10초/15회) 동일 패턴, 메시지 원본 그대로
```

- [ ] **Step 2: request-logger.middleware.ts 번역** — `createRequestLogger(endpointName)` 팩토리 그대로 (res.send 래핑 포함).

- [ ] **Step 3: cards.controller.ts 작성** — `@Res()` 직접 사용으로 응답을 바이트 단위 보존:

```ts
import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CardsService } from './cards.service';
import { GAME_TYPES } from '../common/constants/game-types';

@Controller('api/cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get('yugioh-rarity-prices')
  async getYugiohPricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.YUGIOH, '유희왕');
  }

  @Get('vanguard-rarity-prices')
  async getVanguardPricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.VANGUARD, '뱅가드');
  }

  @Get('onepiece-rarity-prices')
  async getOnepiecePricesByRarity(@Req() req: Request, @Res() res: Response) {
    return this.handleGetPricesByRarity(req, res, GAME_TYPES.ONEPIECE, '원피스');
  }

  private async handleGetPricesByRarity(req: Request, res: Response, gameType: string, gameTypeLabel: string) {
    // createGetPricesByRarityHandler(845~907행)의 핸들러 본문 그대로.
    // 단 result.card.id는 없어졌으므로 응답의 data.cardId 라인은 삭제 (스펙 외부 영향 #2):
    // data: { cardName: result.card.name, image: result.card.image || null, totalProducts: result.totalProducts }
  }

  @Get('search/naver-api')
  async searchNaverShopApi(@Req() req: Request, @Res() res: Response) { /* 919~961행 핸들러 본문 그대로 */ }

  @Get('search/tcgshop')
  async searchTCGShop(@Req() req: Request, @Res() res: Response) {
    // 963~1015행. Card.findOne 제거 (스펙 외부 영향 #3):
    // const card = null; 로 두고 404/200 응답의 card 필드에 그대로 사용.
    // searchAndSaveTCGShopPrices(cardName, gameType) 호출 (cardId 인자 없음)
  }

  @Get('search/carddc')
  async searchCardDC(@Req() req: Request, @Res() res: Response) { /* 1017~1069행, 위와 동일 패턴 */ }

  @Get('prices-cache/:id')
  async getCachedPrices(@Req() req: Request, @Res() res: Response) {
    // 1071~1120행 그대로. findByPk → this.cardsService 경유 또는 컨트롤러에서 service 메서드 호출.
    // UUID 정규식 검사, 410 만료 응답, calculateTotalProducts 호출 전부 그대로.
  }

  @Post('optimal-purchase')
  async getOptimalPurchaseCombination(@Req() req: Request, @Res() res: Response) {
    // 1145~1382행 핸들러 본문 그대로 (이 함수는 DB 직접 접근 없음 —
    // enhanceCardsWithCacheData / processCardDataStructure / findOptimalPurchaseCombination 호출)
  }
}
```

`getCachedPrices`의 DB 접근은 CardsService에 `findCacheById(id): Promise<CardPriceCache | null>` 메서드를 추가해 경유한다:

```ts
// cards.service.ts에 추가
async findCacheById(id: string): Promise<CardPriceCache | null> {
  return this.cacheRepo.findOneBy({ id });
}
```

- [ ] **Step 4: debug.controller.ts 작성** — routes/debug.js 그대로:

```ts
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getClientIp, getForwardedIp, getForwardedIpList } from '../common/utils/client-ip';

@Controller('api/debug')
export class DebugController {
  @Get('client-ip')
  getClientIpInfo(@Req() req: Request, @Res() res: Response) {
    res.status(200).json({
      success: true,
      data: {
        method: req.method,
        path: req.originalUrl,
        trustProxy: req.app.get('trust proxy'),
        clientIp: getClientIp(req),
        forwardedIp: getForwardedIp(req),
        forwardedIpList: getForwardedIpList(req),
        expressIp: req.ip || null,
        expressIps: Array.isArray(req.ips) ? req.ips : [],
        cfConnectingIp: req.get('CF-Connecting-IP') || null,
        trueClientIp: req.get('True-Client-IP') || null,
        xRealIp: req.get('X-Real-IP') || null,
        xForwardedFor: req.get('X-Forwarded-For') || null,
        remoteAddress: req.socket?.remoteAddress || (req as any).connection?.remoteAddress || null,
        userAgent: req.get('User-Agent') || null,
      },
    });
  }
}
```

- [ ] **Step 5: cards.module.ts에 라우트별 미들웨어 배선** — 기존 적용 순서 보존 (requestLogger → cardPriceRateLimiter → cardRequestLimiter → 핸들러):

```ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { DebugController } from '../debug/debug.controller';
import { createRequestLogger } from '../common/middleware/request-logger.middleware';
import { cardPriceRateLimiter, optimalPurchaseRateLimiter, cardSearchRateLimiter } from './cards.rate-limiters';
import { cardRequestLimiter } from '../crawlers/rate-limiter';

@Module({
  imports: [TypeOrmModule.forFeature([CardPriceCache])],
  controllers: [CardsController, DebugController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(createRequestLogger('searchNaverShopApi'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/naver-api', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('searchTCGShop'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/tcgshop', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('searchCardDC'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/search/carddc', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('getYugiohPricesByRarity'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/yugioh-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('getVanguardPricesByRarity'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/vanguard-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('getOnepiecePricesByRarity'), cardPriceRateLimiter, cardRequestLimiter)
      .forRoutes({ path: 'api/cards/onepiece-rarity-prices', method: RequestMethod.GET });
    consumer
      .apply(createRequestLogger('getOptimalPurchaseCombination'), optimalPurchaseRateLimiter)
      .forRoutes({ path: 'api/cards/optimal-purchase', method: RequestMethod.POST });
    consumer
      .apply(createRequestLogger('getCachedPrices'), cardSearchRateLimiter)
      .forRoutes({ path: 'api/cards/prices-cache/:id', method: RequestMethod.GET });
  }
}
```

(주의: 원본 routes/cards.js에서 rarity-prices 핸들러들은 `createGetPricesByRarityHandler`가 내부에 cardPriceRateLimiter + cardRequestLimiter를 포함했고, requestLogger는 라우터에서 적용 — 위 배선이 그 순서와 동일하다.)

- [ ] **Step 6: 원본 삭제 후 컴파일**

```bash
rm src/utils/requestLogger.js src/routes/cards.js src/routes/debug.js src/controllers/cardController.js
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 7: 커밋 포인트** — "컨트롤러/라우팅 포팅"

---

### Task 14: 전역 배선 (미들웨어·필터·cleanup·main.ts 완성)

**Files:**
- Create: `src/common/middleware/internal-auth.middleware.ts` ← `src/middleware/internalAuth.js`
- Create: `src/common/middleware/api-traffic-guard.middleware.ts` ← `src/utils/apiTrafficGuard.js`
- Create: `src/common/middleware/api-rate-limit.middleware.ts` ← app.js 126~136행 (apiLimiter)
- Create: `src/common/filters/all-exceptions.filter.ts` ← `src/lib/error-handler.js` + 404 처리
- Create: `src/cleanup/cleanup.service.ts` ← `src/utils/cleanup.js` (CardPriceCache만)
- Create: `src/cleanup/cleanup.module.ts`
- Create: `src/app.controller.ts` (GET / 환영 메시지)
- Modify: `src/main.ts` (완성), `src/app.module.ts`
- Delete: `src/middleware/internalAuth.js`, `src/utils/apiTrafficGuard.js`, `src/utils/cleanup.js`, `src/lib/error-handler.js`, `src/lib/redis-manager.js`, `src/app.js`, `src/server.js`, `src/models/Card.js`, `src/models/CardPriceCache.js`

- [ ] **Step 1: internal-auth.middleware.ts** — `internalApiAuth(req, res, next)` 1:1 번역 (403 메시지 그대로).

- [ ] **Step 2: api-traffic-guard.middleware.ts** — apiTrafficGuard.js 전체 1:1 번역 (`apiTrafficGuard`, `apiNotFoundHandler`는 여기선 함수만 export — 404 응답 본문은 필터에서 재현하므로 `apiNotFoundHandler`는 export하지 않아도 됨. SUSPICIOUS_PATH_PATTERNS 정규식 9개 글자 그대로).

- [ ] **Step 3: api-rate-limit.middleware.ts** — app.js의 apiLimiter:

```ts
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { getRateLimitKey } from '../utils/client-ip';

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // IP당 1분에 최대 60개까지만 요청 가능
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  },
  keyGenerator: (req: Request) => getRateLimitKey(req),
});
```

- [ ] **Step 4: all-exceptions.filter.ts** — error-handler.js의 createErrorData/determineSeverity/shouldPublishError/globalErrorHandler 로직 + notFoundHandler/apiNotFoundHandler의 404 본문 재현:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { getClientIp } from '../utils/client-ip';

const createErrorData = (error: any, req: Request | null = null, context: any = {}) => ({
  /* error-handler.js 16~38행 그대로 */
});
const determineSeverity = (error: any): string => { /* 40~46행 그대로 */ };
const shouldPublishError = (error: any): boolean => { /* 48~51행 그대로 */ };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly redisService: RedisService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // 라우트 미스: Nest 라우터가 NotFoundException을 던진다
    if (exception instanceof NotFoundException) {
      const url = req.originalUrl || req.url;
      if (url.startsWith('/api')) {
        // 기존 apiNotFoundHandler 본문 (apiTrafficGuard.js 128~135행)
        return res.status(404).json({
          success: false,
          error: { message: 'API endpoint not found' },
        });
      }
      // 기존 notFoundHandler → globalErrorHandler 경로 (AppError 404)
      const message = `Route ${url} not found`;
      console.warn('Error occurred:', { message, stack: exception.stack, url: req.url, method: req.method });
      return res.status(404).json({ success: false, error: { message } });
    }

    // 그 외: globalErrorHandler(53~85행) 1:1 재현
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : exception?.statusCode || 500;
    const message = exception?.isOperational ? exception.message : 'Internal Server Error';
    const logMethod = statusCode >= 500 ? console.error : console.warn;

    logMethod('Error occurred:', {
      message: exception?.message,
      stack: exception?.stack,
      url: req.url,
      method: req.method,
    });

    if (shouldPublishError(exception)) {
      setImmediate(async () => {
        try {
          const errorData = createErrorData(exception, req);
          const success = await this.redisService.publishError(errorData);
          if (!success) {
            console.error('Failed to publish error to Redis');
          }
        } catch (publishError) {
          console.error('Failed to publish error to Redis:', publishError);
        }
      });
    }

    res.status(statusCode).json({
      success: false,
      error: { message },
    });
  }
}
```

(참고: 컨트롤러 핸들러는 전부 자체 try/catch로 응답하므로 이 필터는 라우트 404와 예기치 못한 예외만 처리한다 — 기존 Express의 notFoundHandler/globalErrorHandler 역할과 동일.)

- [ ] **Step 5: cleanup.service.ts + cleanup.module.ts**

```ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';

@Injectable()
export class CleanupService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(CardPriceCache)
    private readonly cacheRepo: Repository<CardPriceCache>
  ) {}

  onApplicationBootstrap() {
    // 기존 app.js: startPeriodicCleanup(60)
    this.startPeriodicCleanup(60);
  }

  async cleanupExpiredCardPriceCache(): Promise<number> {
    try {
      const result = await this.cacheRepo.delete({ expiresAt: LessThan(new Date()) });
      return result.affected ?? 0;
    } catch (error) {
      console.error('[ERROR] CardPriceCache 정리 중 오류 발생:', error);
      return 0;
    }
  }

  async cleanupAllExpiredData(): Promise<void> {
    console.log('[CLEANUP] 만료된 데이터 정리 시작...');
    const startTime = new Date();
    try {
      const cardPriceCache = await this.cleanupExpiredCardPriceCache();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`[CLEANUP] 정리 완료: CardPriceCache(${cardPriceCache}), 소요시간: ${duration}ms`);
    } catch (error) {
      console.error('[ERROR] 데이터 정리 중 전체 오류 발생:', error);
    }
  }

  startPeriodicCleanup(intervalMinutes = 60): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`[CLEANUP] 정기 데이터 정리 시작 (${intervalMinutes}분마다 실행)`);
    this.cleanupAllExpiredData();
    const cleanupInterval = setInterval(() => {
      this.cleanupAllExpiredData();
    }, intervalMs);
    return cleanupInterval;
  }
}
```

`src/cleanup/cleanup.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardPriceCache])],
  providers: [CleanupService],
})
export class CleanupModule {}
```

- [ ] **Step 6: app.controller.ts**

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getWelcome() {
    return { message: 'TCG스캐너에 오신 것을 환영합니다!' };
  }
}
```

- [ ] **Step 7: app.module.ts 최종**

```ts
import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { CardsModule } from './cards/cards.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { AppController } from './app.controller';

@Module({
  imports: [RedisModule, DatabaseModule, CardsModule, CleanupModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 8: main.ts 완성** — app.js 부트스트랩 1:1:

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { internalApiAuth } from './common/middleware/internal-auth.middleware';
import { apiTrafficGuard } from './common/middleware/api-traffic-guard.middleware';
import { apiLimiter } from './common/middleware/api-rate-limit.middleware';

const resolveTrustProxy = (value: string | undefined | null): boolean | number | string => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  if (value === 'true') {
    return 1;
  }
  if (value === 'false') {
    return false;
  }
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
};

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_SECRET) {
    throw new Error('INTERNAL_API_SECRET must be set in production.');
  }

  if (!process.env.INTERNAL_API_SECRET) {
    console.warn(
      '[WARN] INTERNAL_API_SECRET is not set. /api internal auth is disabled outside production.'
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));
  expressApp.disable('x-powered-by');

  app.use(helmet());
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
  });

  const redisService = app.get(RedisService);

  process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
    redisService.publishError({
      type: 'uncaught-exception',
      error: { name: err.name, message: err.message, stack: err.stack },
      context: { timestamp: new Date().toISOString(), processId: process.pid },
      severity: 'critical',
    });

    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    redisService.publishError({
      type: 'unhandled-rejection',
      error: { message: reason?.message || reason, stack: reason?.stack },
      context: { timestamp: new Date().toISOString(), processId: process.pid },
      severity: 'critical',
    });
  });

  app.use('/api', apiTrafficGuard);
  app.use('/api', apiLimiter);
  app.use('/api', internalApiAuth);

  app.useGlobalFilters(new AllExceptionsFilter(redisService));

  const port = process.env.PORT ? Number(process.env.PORT) : 0;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`TCG스캐너 서버가 ${host}:${port}에서 실행 중입니다.`);
}

void bootstrap();
```

(`express.json()`/`urlencoded`는 Nest가 기본 등록. 등록 순서: body parser → app.use 미들웨어 → 라우트 — 기존 app.js와 동일한 실효 순서.)

- [ ] **Step 9: 구 파일 삭제 후 빌드**

```bash
rm src/middleware/internalAuth.js src/utils/apiTrafficGuard.js src/utils/cleanup.js \
   src/lib/error-handler.js src/lib/redis-manager.js src/app.js src/server.js \
   src/models/Card.js src/models/CardPriceCache.js
rmdir src/middleware src/lib src/models src/routes src/controllers src/constants src/utils 2>/dev/null || true
npm run build
```
Expected: 빌드 성공. `find src -name "*.js"` 결과 없음.

- [ ] **Step 10: 커밋 포인트** — "전역 배선 완료, 구 코드 제거"

---

### Task 15: README 업데이트

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 기술 스택 절 수정** — Express.js → NestJS, Sequelize → TypeORM, TypeScript 추가.

- [ ] **Step 2: 설치/실행 절 수정** — `npm run dev`(nest start --watch), `npm run build && npm start`(프로덕션), "OCI 등 저사양 서버에서는 로컬/CI에서 빌드 후 dist만 배포" 권고 추가.

- [ ] **Step 3: DB 스키마 절 추가** — 신규 환경에서 필요한 테이블은 `CardPriceCaches` 하나. 생성 SQL 예시 포함:

```sql
CREATE TABLE IF NOT EXISTS `CardPriceCaches` (
  `id` CHAR(36) NOT NULL,
  `cardName` VARCHAR(255) NOT NULL,
  `image` VARCHAR(255) NULL,
  `gameType` VARCHAR(255) NOT NULL DEFAULT 'yugioh',
  `rarityPrices` JSON NOT NULL,
  `expiresAt` DATETIME NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `card_price_caches_card_name_game_type_expires_at` (`cardName`, `gameType`, `expiresAt`)
);
```

기존 운영 DB의 `Cards`/`CardPrices` 테이블은 더 이상 사용하지 않으며, 검증 완료 후 수동 DROP 예정이라는 문구 추가.

- [ ] **Step 4: 커밋 포인트** — "README 갱신"

---

### Task 16: 수동 검증

**전제:** 로컬에 MySQL/Redis가 있고 `.env`가 설정되어 있다. master 체크아웃(또는 별도 클론)으로 기존 서버를 다른 포트에 띄울 수 있다.

- [ ] **Step 1: 빌드 + 기동**

```bash
npm run build && node dist/main
```
Expected: `TCG스캐너 서버가 0.0.0.0:<PORT>에서 실행 중입니다.` + `[CLEANUP] 정기 데이터 정리 시작 (60분마다 실행)` 로그.

- [ ] **Step 2: 기본 엔드포인트**

```bash
curl -s http://localhost:$PORT/                       # {"message":"TCG스캐너에 오신 것을 환영합니다!"}
curl -s http://localhost:$PORT/api/debug/client-ip    # success:true + trustProxy:1
curl -s http://localhost:$PORT/api/nonexistent        # 404 {"success":false,"error":{"message":"API endpoint not found"}}
curl -s http://localhost:$PORT/nonexistent            # 404 {"success":false,"error":{"message":"Route /nonexistent not found"}}
curl -s "http://localhost:$PORT/api/cards/yugioh-rarity-prices"  # 400 카드 이름 필수 에러
```

- [ ] **Step 3: 검색·캐시 흐름** (기존 서버와 동일 카드로 비교)

```bash
curl -s "http://localhost:$PORT/api/cards/yugioh-rarity-prices?cardName=블랙 매지션" | jq . > new-fresh.json
curl -s "http://localhost:$PORT/api/cards/yugioh-rarity-prices?cardName=블랙 매지션" | jq . > new-cached.json   # source: "cache"
# 기존 서버에서도 동일 요청 → old-fresh.json / old-cached.json
# 비교: rarityPrices 구조 동일, 차이는 스펙 외부 영향 1~3에 열거된 항목뿐인지 확인
```

- [ ] **Step 4: prices-cache + optimal-purchase**

```bash
# new-cached.json의 cacheId로:
curl -s "http://localhost:$PORT/api/cards/prices-cache/<cacheId>"        # 200
curl -s "http://localhost:$PORT/api/cards/prices-cache/invalid-id"       # 400
curl -s -X POST "http://localhost:$PORT/api/cards/optimal-purchase" \
  -H 'Content-Type: application/json' \
  -d '{"cards":[{"cardName":"블랙 매지션","rarity":"울트라 레어","language":"한글판","cacheId":"<cacheId>"}],"shippingRegion":"default"}' | jq . > new-optimal.json
# 기존 서버 동일 입력 결과와 diff — 가격·조합·판매처가 동일해야 함 (id 형식 차이만 허용)
```

- [ ] **Step 5: 에러·보안 경로**

```bash
# rate limit: 같은 카드 3회 연속 → 429 "같은 카드에 대한 요청이..."
for i in 1 2 3; do curl -s "http://localhost:$PORT/api/cards/yugioh-rarity-prices?cardName=test$RANDOM"; done
# INTERNAL_API_SECRET 설정 후 헤더 없이 → 403 "허용되지 않은 API 요청입니다."
# 의심 경로 차단: curl http://localhost:$PORT/api/.env → 403 Forbidden
```

- [ ] **Step 6: Discord 봇 연동** — `npm run discord-bot` 기동 후, 새 서버에서 의도적 500 유발(또는 RedisService.publishError 수동 호출)로 봇이 에러 메시지를 수신하는지 확인.

- [ ] **Step 7: 결과 보고** — 차이가 발견되면 스펙의 외부 영향 1~3 목록과 대조. 목록 밖의 차이는 전부 버그로 간주하고 수정.

---

## 알려진 의도적 차이 (검증 시 버그로 오인 금지)

1. 가격 항목 `id`: DB PK → productId 기반. Sequelize 부가 필드(cardId/expiresAt/createdAt/updatedAt) 제거.
2. rarity-prices 응답 `data.cardId` 제거.
3. `/search/tcgshop`·`/search/carddc`의 `card`는 항상 null, `/search/naver-api`의 `card`는 `{name, gameType, image}`.
4. cleanup 로그: `Card(n), CardPrice(n)` 부분 제거.
5. 시작 로그: `데이터베이스 테이블 동기화 완료` 없음 (sync 미사용).
6. DB 연결 실패 시: 기존은 unhandledRejection으로 계속 떠 있었지만, Nest는 재시도(기본 10회) 후 부팅 실패로 종료.
