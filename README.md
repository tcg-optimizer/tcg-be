# 카드 가격 비교 API 사용 가이드

## API 사용 플로우 (중요)

1. 각 카드별로 `/api/cards/rarity-prices/{cardName}` API를 호출하여 가격 정보와 캐시 ID를 받습니다.
2. 사용자가 각 카드에 대해 원하는 레어도와 언어(한글판, 일본판, 영문판 등)를 선택합니다.
3. 선택한 레어도, 언어, 그리고 캐시 ID를 포함하여 `/api/cards/optimal-purchase` API를 호출합니다.

## 1. 레어도별 가격 정보 조회 API

### 요청 형식
```
GET /api/cards/rarity-prices/{cardName}
```

**URL 파라미터:**
- `cardName`: 조회할 카드 이름 (필수)

**쿼리 파라미터:**
- `includeUsed`: 중고 상품 포함 여부 (선택, 기본값: true)
  - 'true' 또는 'false' 값 사용

### 응답 형식
```json
{
  "success": true,
  "source": "naver_api",
  "data": {
    "cardId": 123,
    "cardName": "블랙 마제스틱",
    "image": "https://example.com/images/black-magician.jpg",
    "allPrices": [
      {
        "id": 587,
        "price": 12000,
        "site": "TCGShop",
        "url": "https://tcgshop.com/product/123",
        "condition": "신품",
        "rarity": "울트라 레어",
        "language": "한글판",
        "cardCode": "LDK2-KRS01",
        "available": true,
        "lastUpdated": "2023-04-05T07:30:00.000Z"
      },
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
        "lastUpdated": "2023-04-05T07:30:00.000Z"
      }
    ],
    "rarityPrices": {
      "울트라 레어": [
        {
          "id": 587,
          "price": 12000,
          "site": "TCGShop",
          "url": "https://tcgshop.com/product/123",
          "condition": "신품",
          "rarity": "울트라 레어",
          "language": "한글판",
          "cardCode": "LDK2-KRS01",
          "available": true,
          "lastUpdated": "2023-04-05T07:30:00.000Z"
        }
      ],
      "시크릿 레어": [
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
          "lastUpdated": "2023-04-05T07:30:00.000Z"
        }
      ]
    }
  },
  "cacheId": "550e8400-e29b-41d4-a716-446655440000",
  "cacheExpiresAt": "2023-04-08T13:45:30.000Z"
}
```

**응답 필드 설명:**
- `success`: 요청 성공 여부
- `source`: 데이터 출처 (naver_api, database 등)
- `data`: 카드 정보와 가격 데이터
  - `cardId`: 카드 고유 ID
  - `cardName`: 카드 이름
  - `image`: 카드 이미지 URL
  - `allPrices`: 모든 가격 정보를 가격 오름차순으로 정렬한 배열
  - `rarityPrices`: 레어도별로 그룹화된 가격 정보
- `cacheId`: 가격 정보 캐시 ID (24시간 유효)
- `cacheExpiresAt`: 캐시 만료 시간

## 2. 캐시된 가격 정보 조회 API

### 요청 형식
```
GET /api/cards/prices-cache/{cacheId}
```

**URL 파라미터:**
- `cacheId`: 가격 정보 캐시 ID (필수)

### 응답 형식
```json
{
  "success": true,
  "data": {
    "cardName": "블랙 마제스틱",
    "rarityPrices": {
      "울트라 레어": [
        {
          "id": 587,
          "price": 12000,
          "site": "TCGShop",
          "url": "https://tcgshop.com/product/123",
          "condition": "신품",
          "rarity": "울트라 레어",
          "language": "한글판",
          "cardCode": "LDK2-KRS01",
          "available": true,
          "lastUpdated": "2023-04-05T07:30:00.000Z"
        }
      ],
      "시크릿 레어": [
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
          "lastUpdated": "2023-04-05T07:30:00.000Z"
        }
      ]
    }
  },
  "cacheId": "550e8400-e29b-41d4-a716-446655440000",
  "cacheExpiresAt": "2023-04-08T13:45:30.000Z"
}
```

**응답 필드 설명:**
- `success`: 요청 성공 여부
- `data`: 캐시된 데이터
  - `cardName`: 카드 이름
  - `rarityPrices`: 레어도별로 그룹화된 가격 정보
- `cacheId`: 가격 정보 캐시 ID
- `cacheExpiresAt`: 캐시 만료 시간

## 3. 최적 구매 조합 계산 API

### 설명
여러 장의 카드를 가장 저렴하게 구매할 수 있는 조합을 계산합니다. 다양한 사이트에서 카드 가격을 검색하고, 배송비를 고려하여 최적의 구매 조합을 제안합니다.

> **중요**: 이 API를 사용하기 전에 반드시 각 카드에 대해 `/api/cards/rarity-prices/:cardName` API를 호출하여 가격 정보와 캐시 ID를 받아야 합니다.

### 요청 형식
```
POST /api/cards/optimal-purchase
```

**요청 본문:**
```json
{
  "cards": [
    {
      "name": "블랙 매지션",
      "rarity": "울트라 레어",
      "language": "한글판",
      "quantity": 3,
      "cacheId": "550e8400-e29b-41d4-a716-446655440000"
    },
    {
      "name": "블루아이즈 화이트 드래곤",
      "rarity": "시크릿 레어",
      "language": "일본판",
      "quantity": 1,
      "cacheId": "71e0d400-c75b-41d4-a986-446655440123"
    },
    {
      "name": "레드아이즈 블랙 드래곤",
      "rarity": "울트라 레어",
      "quantity": 2,
      "cacheId": "82f1e500-d76c-41d4-b096-446655440456"
    }
  ],
  "shippingRegion": "jeju"
}
```

**요청 필드 설명:**
- `cards`: 구매할 카드 목록 (필수)
  - `name`: 카드 이름 (필수)
  - `rarity`: 원하는 레어도 (필수)
  - `language`: 원하는 언어 (선택, 예: "한글판", "일본판", "영문판") - 지정하지 않으면 모든 언어 고려
  - `quantity`: 수량 (선택, 기본값: 1)
  - `cacheId`: 가격 정보 캐시 ID (필수) - `/api/cards/rarity-prices/{cardName}` API 호출 시 받은 값
- `shippingRegion`: 배송 지역 (선택, 기본값: 'default')
  - 'default', 'jeju', 'island' 중 하나 (기본 배송비, 제주 지역 배송비, 도서 지역 배송비 적용)

### 오류 응답

#### 필수 필드 누락 시
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
      "name": "블루아이즈 화이트 드래곤",
      "missingFields": ["rarity"]
    }
  ]
}
```

#### 캐시 ID 만료 또는 유효하지 않은 경우
```json
{
  "success": false,
  "message": "'블랙 매지션' 카드의 가격 정보가 만료되었거나 존재하지 않습니다. 다시 /api/cards/rarity-prices/블랙%20매지션 API를 호출하여 새로운 캐시 ID를 얻어주세요.",
  "invalidCacheId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 레어도와 언어 조합이 유효하지 않은 경우
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

### 응답 형식
```json
{
  "success": true,
  "totalPrice": 75000,
  "totalShippingCost": 4500,
  "finalPrice": 79500,
  "shippingRegion": "jeju",
  "sellers": [
    {
      "name": "TCGShop",
      "cards": [
        "블랙 매지션", 
        "블루아이즈 화이트 드래곤"
      ],
      "subtotal": 57500,
      "shippingCost": 2500
    },
    {
      "name": "CardDC",
      "cards": [
        "레드아이즈 블랙 드래곤"
      ],
      "subtotal": 17500,
      "shippingCost": 2000
    }
  ],
  "cardsOptimalPurchase": [
    {
      "cardName": "블랙 매지션",
      "seller": "TCGShop",
      "price": 15000,
      "quantity": 3,
      "totalPrice": 45000,
      "product": {
        "price": 15000,
        "rarity": "울트라 레어",
        "language": "한글판",
        "site": "TCGShop",
        "url": "https://tcgshop.com/product/123",
        "cardCode": "LDK2-KRS01"
      }
    },
    {
      "cardName": "블루아이즈 화이트 드래곤",
      "seller": "TCGShop",
      "price": 12500,
      "quantity": 1,
      "totalPrice": 12500,
      "product": {
        "price": 12500,
        "rarity": "시크릿 레어",
        "language": "일본판",
        "site": "TCGShop",
        "url": "https://tcgshop.com/product/456",
        "cardCode": "SDK-JP01"
      }
    },
    {
      "cardName": "레드아이즈 블랙 드래곤",
      "seller": "CardDC",
      "price": 8750,
      "quantity": 2,
      "totalPrice": 17500,
      "product": {
        "price": 8750,
        "rarity": "울트라 레어",
        "language": "한글판",
        "site": "CardDC",
        "url": "https://carddc.com/product/789",
        "cardCode": "SDJ-KR01"
      }
    }
  ],
  "cardImages": {
    "블랙 매지션": "https://example.com/images/black-magician.jpg",
    "블루아이즈 화이트 드래곤": "https://example.com/images/blue-eyes.jpg",
    "레드아이즈 블랙 드래곤": "https://example.com/images/red-eyes.jpg"
  },
  "notFoundCards": []
}
```

**응답 필드 설명:**
- `success`: 요청 성공 여부
- `totalPrice`: 카드 구매 총액 (배송비 제외)
- `totalShippingCost`: 총 배송비
- `finalPrice`: 최종 가격 (카드 구매 총액 + 배송비)
- `shippingRegion`: 적용된 배송 지역 정보
- `sellers`: 판매자별 구매 정보
  - `name`: 판매자/사이트 이름
  - `cards`: 해당 판매자에서 구매할 카드 목록
  - `subtotal`: 해당 판매자에서의 구매 소계
  - `shippingCost`: 해당 판매자의 배송비
- `cardsOptimalPurchase`: 각 카드별 최적 구매 정보
  - `cardName`: 카드 이름
  - `seller`: 판매자/사이트
  - `price`: 단가
  - `quantity`: 수량
  - `totalPrice`: 총 가격 (단가 × 수량)
  - `product`: 제품 상세 정보
    - `price`: 제품 가격
    - `rarity`: 레어도
    - `language`: 언어 정보
    - `site`: 판매 사이트
    - `url`: 제품 URL
    - `cardCode`: 카드 코드
- `cardImages`: 카드별 이미지 URL
- `notFoundCards`: 정보를 찾지 못한 카드 목록