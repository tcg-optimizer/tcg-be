# 유희왕 카드 가격 비교 프로젝트

이 프로젝트는 여러 온라인 쇼핑몰에서 유희왕 카드 가격을 비교하고 최적의 구매 조합을 찾아주는 웹 애플리케이션입니다.

## 📋 목차

- [주요 기능]
- [기술 스택]
- [설치 및 실행]
  - [사전 준비 사항]
  - [백엔드 설치 및 실행]
- [환경 변수 설정]
- [Discord 봇 (선택사항)]
- [문제 해결]

## 🎯 주요 기능

- **카드 가격 검색**: 네이버, TCGShop, CardDC에서 실시간 가격 조회
- **레어도별 가격 비교**: 다양한 레어도와 언어별 가격 정보 제공
- **최적 구매 조합**: 여러 카드를 가장 저렴하게 구매할 수 있는 조합 계산
- **적립금 계산**: 각 쇼핑몰의 적립금을 고려한 실제 비용 계산
- **배송비 최적화**: 사이트별 배송비를 고려한 총 비용 계산

## 🛠 기술 스택

### 백엔드
- **Node.js** - 서버 환경
- **Express.js** - 웹 프레임워크
- **MySQL** - 데이터베이스
- **Redis** - 캐싱 및 세션 관리
- **Sequelize** - ORM
- **Discord.js** - Discord 봇 (선택사항)

### 프론트엔드
- **Next.js 15** - React 프레임워크
- **TypeScript** - 타입 안전성
- **Tailwind CSS** - 스타일링
- **Radix UI** - UI 컴포넌트

## 🚀 설치 및 실행

### 사전 준비 사항

다음 소프트웨어들이 설치되어 있어야 합니다:

1. **Node.js** (v18 이상)
   ```bash
   # 설치 확인
   node --version
   npm --version
   ```
   설치가 필요한 경우: [Node.js 공식 사이트](https://nodejs.org/)

2. **MySQL** (v8.0 이상)
   ```bash
   # 설치 확인
   mysql --version
   ```
   설치가 필요한 경우:
   - Windows: [MySQL Installer](https://dev.mysql.com/downloads/installer/)
   - macOS: `brew install mysql`
   - Ubuntu: `sudo apt install mysql-server`

3. **Redis** (v6.0 이상)
   ```bash
   # 설치 확인
   redis-cli --version
   ```
   설치가 필요한 경우:
   - Windows: [Redis for Windows](https://github.com/microsoftarchive/redis/releases)
   - macOS: `brew install redis`
   - Ubuntu: `sudo apt install redis-server`

### 백엔드 설치 및 실행

1. **프로젝트 클론**
   ```bash
   git clone [프로젝트-주소]
   cd cards-price-comparison
   ```

2. **백엔드 디렉토리로 이동**
   ```bash
   cd be
   ```

3. **의존성 패키지 설치**
   ```bash
   npm install
   ```

4. **MySQL 데이터베이스 생성**
   ```bash
   # MySQL 접속
   mysql -u root -p
   ```
   ```sql
   -- 데이터베이스 생성
   CREATE DATABASE cards;
   
   exit;
   ```

5. **Redis 서버 시작**
   ```bash
   # macOS/Linux
   redis-server
   
   # Windows (Redis 설치 폴더에서)
   redis-server.exe
   ```

6. **환경 변수 설정**
   ```bash
   # .env 파일 생성
   touch .env
   ```
   
   `.env` 파일에 다음 내용을 추가:
   ```env
   # 서버 설정
   PORT=5000
   
   # 데이터베이스 설정
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=cards
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   
   # Redis 설정
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # API 키 (선택사항)
   NAVER_CLIENT_ID=your_naver_client_id
   NAVER_CLIENT_SECRET=your_naver_client_secret
   
   # Discord 봇 (선택사항)
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CHANNEL_ID=your_discord_channel_id
   ```

7. **백엔드 서버 실행**
   ```bash
   # 개발 모드 (nodemon 사용)
   npm run dev
   
   # 또는 일반 실행
   npm start
   ```

   서버가 정상적으로 시작되면 다음과 같은 메시지가 표시됩니다:
   ```
   DB 연결 성공
   데이터베이스 테이블 동기화 완료
   TCG스캐너 서버가 포트 5000에서 실행 중입니다.
   ```

## ⚙️ 환경 변수 설정

### 필수 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `PORT` | 백엔드 서버 포트 | `5000` |
| `DB_HOST` | MySQL 호스트 | `localhost` |
| `DB_PORT` | MySQL 포트 | `3306` |
| `DB_NAME` | 데이터베이스 이름 | `cards` |
| `DB_USER` | MySQL 사용자명 | `root` |
| `DB_PASSWORD` | MySQL 비밀번호 | `your_password` |
| `REDIS_HOST` | Redis 호스트 | `localhost` |
| `REDIS_PORT` | Redis 포트 | `6379` |

### 선택적 환경 변수

| 변수명 | 설명 | 용도 |
|--------|------|------|
| `NAVER_CLIENT_ID` | 네이버 API 클라이언트 ID | 네이버 쇼핑 검색 API |
| `NAVER_CLIENT_SECRET` | 네이버 API 클라이언트 시크릿 | 네이버 쇼핑 검색 API |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 | Discord 알림 봇 |
| `DISCORD_CHANNEL_ID` | Discord 채널 ID | Discord 알림 전송 |

## 🤖 Discord 봇 (선택사항)

Discord 봇을 사용하여 에러 알림을 받을 수 있습니다.

### Discord 봇 설정

1. **Discord Developer Portal에서 봇 생성**
   - [Discord Developer Portal](https://discord.com/developers/applications) 접속
   - 새 애플리케이션 생성
   - Bot 섹션에서 토큰 생성

2. **봇을 서버에 초대**
   - OAuth2 섹션에서 권한 설정
   - 생성된 초대 링크로 봇을 서버에 추가

3. **환경 변수에 토큰 추가**
   ```env
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CHANNEL_ID=your_discord_channel_id
   ```

4. **Discord 봇 실행**
   ```bash
   npm run discord-bot
   ```

## 🔧 문제 해결

### 일반적인 문제들

#### 1. 데이터베이스 연결 실패
```
DB 연결 실패: Access denied for user
```
**해결방법:**
- MySQL 사용자명/비밀번호 확인
- MySQL 서버가 실행 중인지 확인
- 데이터베이스가 생성되었는지 확인

#### 2. Redis 연결 실패
```
Redis connection failed
```
**해결방법:**
- Redis 서버가 실행 중인지 확인: `redis-cli ping`
- Redis 설정 확인 (호스트, 포트)

#### 3. 포트 충돌
```
Error: listen EADDRINUSE :::5000
```
**해결방법:**
- 다른 포트 사용: `.env`에서 `PORT=5001` 설정
- 기존 프로세스 종료: `kill -9 $(lsof -t -i:5000)`

#### 4. npm 패키지 설치 실패
```
npm ERR! network timeout
```
**해결방법:**
- npm 캐시 클리어: `npm cache clean --force`
- npm registry 확인: `npm config get registry`
- 네트워크 연결 확인

### 로그 확인

```bash
# 백엔드 로그 (개발 모드)
npm run dev

# 프론트엔드 로그
npm run dev

# Discord 봇 로그
npm run discord-bot
```

### 개발 도구

```bash
# 코드 포맷팅
npm run format

# 코드 포맷팅 체크
npm run format:check
```

## 📚 API 사용법

서버가 정상적으로 실행되면 다음 엔드포인트들을 사용할 수 있습니다:

- `GET /api/cards/rarity-prices?cardName={카드이름}` - 카드 가격 정보 조회
- `POST /api/cards/optimal-purchase` - 최적 구매 조합 계산
- `GET /api/cards/prices-cache/{cacheId}` - 캐시된 가격 정보 조회

### 기본 사용 예시

```javascript
// 카드 가격 조회
const response = await fetch('http://localhost:5000/api/cards/rarity-prices?cardName=블랙 매지션');
const data = await response.json();

// 최적 구매 조합 계산
const optimizeResponse = await fetch('http://localhost:5000/api/cards/optimal-purchase', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    cards: [
      {
        name: '블랙 매지션',
        rarity: '울트라 레어',
        language: '한글판',
        quantity: 3,
        cacheId: 'cache-id-from-previous-call'
      }
    ]
  })
});
```

## 📞 지원

문제가 발생하거나 질문이 있으시면:

1. 먼저 [문제 해결](#문제-해결) 섹션을 확인해보세요
2. 로그를 확인하여 오류 메시지를 파악해보세요
3. 환경 변수 설정이 올바른지 확인해보세요

---

이 프로젝트가 도움이 되셨다면 ⭐ 스타를 눌러주세요!

## **API 상세 문서**

### **1. 레어도별 가격 정보 조회**

#### **1-1. 유희왕 카드 가격 정보 조회**

- **엔드포인트**: GET /api/cards/yugioh-rarity-prices?cardName=카드이름
- **설명**: 유희왕 카드 이름으로 검색하여 카드 정보와 레어도별 가격 데이터를 반환합니다. 네이버 API, TCGShop, CardDC에서 실시간 검색을 시도합니다.

- **파라미터**: cardName: 검색할 카드 이름
- **쿼리 파라미터**: includeUsed: 중고 상품 포함 여부 (기본값: true)

**요청 형식 예시**

**기본 요청:**

GET /api/cards/yugioh-rarity-prices?cardName=블랙 매지션

**중고 상품 제외 옵션:**

GET /api/cards/yugioh-rarity-prices?cardName=블랙 매지션&includeUsed=false

#### **1-2. 뱅가드 카드 가격 정보 조회**

- **엔드포인트**: GET /api/cards/vanguard-rarity-prices?cardName=카드이름
- **설명**: 카드파이트 뱅가드 카드 이름으로 검색하여 카드 정보와 레어도별 가격 데이터를 반환합니다. 네이버 API, TCGShop, CardDC에서 실시간 검색을 시도합니다.

- **파라미터**: cardName: 검색할 카드 이름
- **쿼리 파라미터**: includeUsed: 중고 상품 포함 여부 (기본값: true)

**요청 형식 예시**

**기본 요청:**

GET /api/cards/vanguard-rarity-prices?cardName=블래스터 블레이드

**중고 상품 제외 옵션:**

GET /api/cards/vanguard-rarity-prices?cardName=블래스터 블레이드&includeUsed=false

- **응답 예시**:json

```json
{
  "success": true,
  "source": "naver_api",
  "gameType": "yugioh",
  "data": {
    "cardId": 125,
    "cardName": "블랙 매지션",
    "image": "https://example.com/images/black-magician.jpg",
    "totalProducts": 123
  },
  "rarityPrices": {
    "default": {
      "한글판": {
        "울트라 레어": {
          "image": "https://example.com/images/ultra-rare-default.jpg",
          "prices": [
            {
              "id": 587,
              "price": 12000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/123",
              "condition": "신품",
              "rarity": "울트라 레어",
              "language": "한글판",
              "cardCode": "LDK2-KR001",
              "available": true,
              "lastUpdated": "2023-04-05T07:30:00.000Z",
              "illustration": "default"
            }
          ]
        },
        "시크릿 레어": {
          "image": "https://example.com/images/secret-rare-default.jpg",
          "prices": [
            {
              "id": 588,
              "price": 15000,
              "site": "CardDC",
              "url": "https://carddc.com/product/456",
              "condition": "신품",
              "rarity": "시크릿 레어",
              "language": "한글판",
              "cardCode": "DLCS-KR001",
              "available": true,
              "lastUpdated": "2023-04-05T07:30:00.000Z",
              "illustration": "default"
            }
          ]
        }
      },
      "일본판": {
        "레어": {
          "image": "https://example.com/images/rare-jp-default.jpg",
          "prices": [
            {
              "id": 589,
              "price": 8000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/789",
              "condition": "신품",
              "rarity": "레어",
              "language": "일본판",
              "cardCode": "LDK2-JP001",
              "available": true,
              "lastUpdated": "2023-04-05T07:30:00.000Z",
              "illustration": "default"
            }
          ]
        }
      }
    },
    "another": {
      "한글판": {
        "울트라 레어": {
          "image": "https://example.com/images/ultra-rare-another.jpg",
          "prices": [
            {
              "id": 590,
              "price": 18000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/124",
              "condition": "신품",
              "rarity": "울트라 레어",
              "language": "한글판",
              "cardCode": "LDK2-KRS01",
              "available": true,
              "lastUpdated": "2023-04-05T07:30:00.000Z",
              "illustration": "another"
            }
          ]
        },
        "시크릿 레어": {
          "image": "https://example.com/images/secret-rare-another.jpg",
          "prices": [
            {
              "id": 591,
              "price": 22000,
              "site": "CardDC",
              "url": "https://carddc.com/product/457",
              "condition": "신품",
              "rarity": "시크릿 레어",
              "language": "한글판",
              "cardCode": "DLCS-KR001",
              "available": true,
              "lastUpdated": "2023-04-05T07:30:00.000Z",
              "illustration": "another"
            }
          ]
        }
      }
    }
  },
  "cacheId": "550e8400-e29b-41d4-a716-446655440000",
  "cacheExpiresAt": "2023-04-08T13:45:30.000Z"
}
```

- **오류 응답 예시**:

```json
{
  "success": false,
  "error": "naver 요청 제한 초과로 크롤링을 진행할 수 없습니다."
}
```

### **2. 최적 구매 조합 계산**

- **엔드포인트**: POST /api/cards/optimal-purchase
- **설명**: 여러 장의 카드를 가장 저렴하게 구매할 수 있는 조합을 계산합니다. 다양한 사이트에서 카드 가격을 검색하고, 배송비를 고려하여 최적의 구매 조합을 제안합니다.
- **중요**: 이 API를 사용하기 전에 반드시 각 카드에 대해 /api/cards/rarity-prices/:cardName API를 호출하여 가격 정보와 캐시 ID를 받아야 합니다.
- **요청 본문 예시**:

```json
POST /api/cards/optimal-purchase

{
  "cards": [
    {
      "name": "블랙 매지션",
      "rarity": "울트라 레어",
      "language": "한글판",
      "illustrationType": "default",
      "quantity": 3,
      "cacheId": "550e8400-e29b-41d4-a716-446655440000"
    },
    {
      "name": "푸른 눈의 백룡",
      "rarity": "시크릿 레어",
      "language": "일본판",
      "illustrationType": "another",
      "quantity": 1,
      "cacheId": "71e0d400-c75b-41d4-a986-446655440123"
    },
    {
      "name": "붉은 눈의 흑룡",
      "rarity": "울트라 레어",
      "language": "영문판",
      "illustrationType": "default",
      "quantity": 2,
      "cacheId": "82f1e500-d76c-41d4-b096-446655440456"
    }
  ],
  "shippingRegion": "default",
  "tcgshopPoints": true,
  "carddcPoints": true,
  "naverBasicPoints": true,
  "naverBankbookPoints": false,
  "naverMembershipPoints": false,
  "naverHyundaiCardPoints": false
  
  "excludedProductIds": ["34121", "1463", "123"],
  "excludedStores": ["TCGShop", "Naver_카드킹덤"],
  
  "takeout": [
	  "cardKingdom", // 장한평 카드킹덤
	  "cardNyang",  // 역삼 카드냥
		"cardSquare",  // 신당 카드스퀘어
		"minCGCardMarket",  // 대전 민씨지샵
		"diMarket",  // 전주 디마켓
		"skyscraper",  // 역곡 마천루 카드장터
		"areaZeroStore",  // 석계 에리어제로 스토어
		"blackStone",  // 흑석 블랙스톤
		"dualWinner",  // 대화 듀얼위너
		"tcgKingdom",  // 울산 TCG킹덤
		"tcgPlayer",  // 광주 티씨지 플레이어
  ]
}
```

- **요청 파라미터**:

cards: 구매할 카드 목록 (필수)

- name: 카드 이름 (필수)
- rarity: 원하는 레어도 (필수)
- language: 원하는 언어 (필수, 예: "한글판", "일본판", "영문판")
- quantity: 같은 카드를 몇 장 구매할건지 (필수, 기본값: 1)
- cacheId: 가격 정보 캐시 ID (필수, /api/cards/rarity-prices/:cardName API 호출 시 받은 값)
- shippingRegion: 'default', 'jeju', 'island' (기본값: 'default', 기본 배송비, 제주 지역 배송비, 도서 지역 배송비 적용)

적립금 관련 옵션들: 

- tcgshopPoints: 티씨지샵 적립금(10%)을 고려해서 최저가 조합 계산을 합니다.
- carddcPoints: 카드디씨 적립금(10%)을 고려해서 최저가 조합 계산을 합니다.
- naverBasicPoints: 네이버페이 기본 적립금(2.5%)과 네이버 리뷰 적립금(3000원 이상 제품당 150원)을 고려해서 최저가 조합 계산을 합니다.
- naverBankbookPoints: 네이버 제휴통장(네이버페이 머니 하나통장, 미래에셋증권 CMA-RP 네이버통장) 적립금(0.5%)을 고려해서 최저가 조합 계산을 합니다.
- naverMembershipPoints: 네이버 멤버십 적립금(4%)을 고려해서 최저가 조합 계산을 합니다.
- naverHyundaiCardPoints: 네이버 현대카드 적립금(7%)을 고려해서 최저가 조합 계산을 합니다.

- **오류 응답 예시**:

필수 필드 누락 시:

```json
{
  "success": false,
  "message": "모든 카드는 cacheId와 rarity 필드가 필수입니다.",
  "invalidCards": [
    {
      "name": "블랙 매지션",
      "missingFields": ["cacheId"]
    },
    {
      "name": "푸른 눈의 백룡",
      "missingFields": ["rarity"]
    }
  ]
}
```

캐시 ID 만료 또는 유효하지 않은 경우:

```json
{
  "success": false,
  "message": "'블랙 매지션' 카드의 가격 정보가 만료되었거나 존재하지 않습니다. 다시 /api/cards/rarity-prices/블랙%20매지션 API를 호출하여 새로운 캐시 ID를 얻어주세요.",
  "invalidCacheId": "550e8400-e29b-41d4-a716-446655440000"
}
```

레어도와 언어 조합이 유효하지 않은 경우:

```json
{
  "success": false,
  "message": "일부 카드에 대해 선택한 레어도와 언어 조합의 상품을 찾을 수 없습니다.",
  "invalidCombinations": [
    {
      "name": "블랙 매지션",
      "requestedRarity": "울트라 레어",
      "requestedLanguage": "영문판",
      "availableLanguages": ["한글판", "일본판"]
    }
  ]
}
```

- **응답 예시**:json

```
{
  "success": true,
  "totalCost": 42500,             
  "totalProductCost": 45000,
  "totalShippingCost": 5000,
  "totalPointsEarned": 7500,
  "pointsOptions": {
    "tcgshop": true,
    "carddc": true,
    "naverBasic": true,
    "naverBankbook": true,
    "naverMembership": false,
    "naverHyundaiCard": false
  },
  "shippingRegion": "jeju",
  "cardsOptimalPurchase": {
    "TCGShop": {
      "cards": [
        {
          "cardName": "블랙 매지션",
          "price": 15000,
          "quantity": 3,
          "totalPrice": 45000,
          "product": {
            "id": 123,
            "price": 15000,
            "rarity": "울트라 레어",
            "language": "한글판",
            "site": "TCGShop",
            "url": "https://tcgshop.com/product/123",
            "cardCode": "LDK2-KR001",
            "illustration": "default"
          },
          "image": "https://example.com/images/black-magician-ultra-ko-default.jpg"
        },
        {
          "cardName": "푸른 눈의 백룡",
          "price": 12500,
          "quantity": 1,
          "totalPrice": 12500,
          "product": {
            "id": 321,
            "price": 12500,
            "rarity": "시크릿 레어",
            "language": "일본판",
            "site": "TCGShop",
            "url": "https://tcgshop.com/product/456",
            "cardCode": "SDK-JP001",
            "illustration": "another"
          },
          "image": "https://example.com/images/blue-eyes-secret-jp-another.jpg"
        }
      ],
      "finalPrice": 54250,
      "productCost": 57500,
      "shippingCost": 2500,
      "pointsEarned": 5750
    },
    "CardDC": {
      "cards": [
        {
          "cardName": "붉은 눈의 흑룡",
          "price": 9000,
          "quantity": 1,
          "totalPrice": 9000,
          "product": {
            "id": 789,
            "price": 9000,
            "rarity": "레어",
            "language": "한글판",
            "site": "CardDC",
            "url": "https://carddc.com/product/789",
            "cardCode": "SDK-KR002",
            "illustration": "default"
          },
          "image": "https://example.com/images/red-eyes-rare-ko-default.jpg"
        }
      ],
      "finalPrice": 10100,
      "productCost": 9000,
      "shippingCost": 2000,
      "pointsEarned": 900
    }
  },
  "cardImages": {
    "블랙 매지션": {
      "default": "https://example.com/images/black-magician-default.jpg",
      "another": "https://example.com/images/black-magician-another.jpg"
    },
    "푸른 눈의 백룡": {
      "default": "https://example.com/images/blue-eyes-default.jpg",
      "another": "https://example.com/images/blue-eyes-another.jpg"
    },
    "붉은 눈의 흑룡": {
      "default": "https://example.com/images/red-eyes-default.jpg"
    }
  },
  "excludedFilters": {
    "excludedProductIds": [], 
    "excludedStores": []
  }
}
```

## **오류 응답 형식**

모든 API 엔드포인트는 오류 발생 시 다음과 같은 형식으로 응답합니다:

```json
{
  "success": false,
  "error": "오류 메시지"
}
```

### **3. 캐싱된 가격 정보 조회**

- **엔드포인트**: GET /api/cards/prices-cache/:id
- **설명**: DB에 캐싱된 가격 정보를 가져옵니다.

### **파라미터**

- :id - 캐시 ID (UUID 형식)
- UUID 형식: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (예: 123e4567-e89b-12d3-a456-426614174000)
- 이 캐시 ID는 /api/cards/rarity-prices API를 호출할 때 응답으로 받은 cacheId 값을 사용해야 합니다.

**요청 형식 예시**

GET /api/cards/prices-cache/123e4567-e89b-12d3-a456-426614174000

## **응답 형식**

**성공 응답 (200 OK)**

```json
{
  "success": true,
  "data": {
    "cardName": "푸른 눈의 백룡",
    "image": "https://example.com/images/blue-eyes-default.jpg",
    "totalProducts": 89
  },
  "rarityPrices": {
    "default": {
      "한국어": {
        "울트라 레어": {
          "image": "https://example.com/images/blue-eyes-ultra-ko-default.jpg",
          "prices": [
            {
              "id": "price-001",
              "price": 10000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/123",
              "condition": "신품",
              "rarity": "울트라 레어",
              "language": "한국어",
              "cardCode": "SDK-KR01",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z",
              "illustration": "default"
            }
          ]
        },
        "시크릿 레어": {
          "image": "https://example.com/images/blue-eyes-secret-ko-default.jpg",
          "prices": [
            {
              "id": "price-002",
              "price": 15000,
              "site": "CardDC",
              "url": "https://carddc.com/product/456",
              "condition": "신품",
              "rarity": "시크릿 레어",
              "language": "한국어",
              "cardCode": "SDK-KR01",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z",
              "illustration": "default"
            }
          ]
        }
      },
      "일본어": {
        "울트라 레어": {
          "image": "https://example.com/images/blue-eyes-ultra-jp-default.jpg",
          "prices": [
            {
              "id": "price-003",
              "price": 8000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/789",
              "condition": "신품",
              "rarity": "울트라 레어",
              "language": "일본어",
              "cardCode": "SDK-JP01",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z",
              "illustration": "default"
            }
          ]
        }
      }
    },
    "another": {
      "한국어": {
        "울트라 레어": {
          "image": "https://example.com/images/blue-eyes-ultra-ko-another.jpg",
          "prices": [
            {
              "id": "price-004",
              "price": 18000,
              "site": "TCGShop",
              "url": "https://tcgshop.com/product/124",
              "condition": "신품",
              "rarity": "울트라 레어",
              "language": "한국어",
              "cardCode": "SDK-KR01",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z",
              "illustration": "another"
            }
          ]
        },
        "시크릿 레어": {
          "image": "https://example.com/images/blue-eyes-secret-ko-another.jpg",
          "prices": [
            {
              "id": "price-005",
              "price": 25000,
              "site": "CardDC",
              "url": "https://carddc.com/product/457",
              "condition": "신품",
              "rarity": "시크릿 레어",
              "language": "한국어",
              "cardCode": "SDK-KR01",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z",
              "illustration": "another"
            }
          ]
        }
      }
    }
  },
  "cacheId": "123e4567-e89b-12d3-a456-426614174000",
  "cacheExpiresAt": "2023-01-02T00:00:00Z"
}
```

**오류 응답**

1. **잘못된 캐시 ID (400 Bad Request)**

```json
{
  "success": false,
  "message": "유효하지 않은 캐시 ID입니다."
}
```

1. **캐시 정보를 찾을 수 없음 (404 Not Found)**

```json
{
  "success": false,
  "message": "해당 ID의 가격 정보를 찾을 수 없습니다."
}
```

1. **캐시 만료 (410 Gone)**

```json
{
  "success": false,
  "message": "가격 정보가 만료되었습니다. 새로운 정보를 조회해주세요."
}
```

1. **서버 오류 (500 Internal Server Error)**

```json
{
  "success": false,
  "message": "가격 정보 조회 중 오류가 발생했습니다.",
  "error": "오류 메시지"
}
```

## **상태 코드**

- 200 OK: 요청 성공
- 400 Bad Request: 잘못된 요청 (필수 파라미터 누락 등)
- 404 Not Found: 요청한 자원을 찾을 수 없음
- 500 Internal Server Error: 서버 내부 오류

## **공통 응답 필드**

- success: 요청 성공 여부 (boolean)
- error: 오류 메시지 (오류 발생 시에만 포함)
- data: 응답 데이터 (요청 성공 시)

## **사용 예시 (JavaScript)**

**카드 검색 및 가격 비교**

```jsx
async function searchCard(cardName) {
  try {
    const response = await fetch(`http://localhost:5000/api/cards/${cardName}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`카드명: ${data.data.name}`);
      console.log(`카드 이미지: ${data.data.image}`);
      console.log('가격 정보:');
      data.prices.forEach(price => {
        console.log(`- ${price.site}: ${price.price}원 (레어도: ${price.rarity})`);
      });
    } else {
      console.error(`오류: ${data.error}`);
    }
  } catch (error) {
    console.error('API 요청 실패:', error);
  }
}

searchCard('블랙 매지션');
```

**최적 구매 조합 계산**

```jsx
async function calculateOptimalPurchase(cards) {
  try {
    const response = await fetch('http://localhost:5000/api/cards/optimal-purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cards })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`총 비용: ${data.totalCost}원`);
      console.log(`- 상품 비용: ${data.totalProductCost}원`);
      console.log(`- 배송 비용: ${data.totalShippingCost}원`);
      
      console.log('\n판매처별 구매 목록:');
      data.sellers.forEach(seller => {
        console.log(`\n${seller.name} (${seller.totalPrice}원):`);
        seller.cards.forEach(cardName => {
          console.log(`- ${cardName}`);
        });
      });
    } else {
      console.error(`오류: ${data.error}`);
    }
  } catch (error) {
    console.error('API 요청 실패:', error);
  }
}

const cards = [
  { name: '블랙 매지션', rarity: 'Ultra Rare' },
  { name: '푸른 눈의 백룡', rarity: 'Secret Rare' },
];

calculateOptimalPurchase(cards);
```