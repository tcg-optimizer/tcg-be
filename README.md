# **유희왕 카드 가격 비교 API 문서**

## **개요**

이 문서는 유희왕 카드 가격 비교 API의 사용 방법을 설명합니다. 이 API는 여러 사이트(네이버, TCGShop, CardDC, OnlyYugioh)에서 유희왕 카드의 가격 정보를 수집하고 비교하는 기능을 제공합니다.

## **기본 정보**

- 기본 URL: /api/cards
- 서버 포트: 5000 (기본값, 환경 변수로 변경 가능)

## **API 엔드포인트**

### **1. 레어도별 가격 정보 조회**

- **엔드포인트**: GET /api/cards/rarity-prices?cardName=카드이름
- **설명**: 카드 이름으로 검색하여 카드 정보와 레어도별 가격 데이터를 반환합니다. 네이버 API, TCGShop, CardDC, OnlyYugioh에서 실시간 검색을 시도합니다.

- **파라미터**: cardName: 검색할 카드 이름
- **쿼리 파라미터**: includeUsed: 중고 상품 포함 여부 (기본값: true)

**요청 형식 예시**

**기본 요청:**

GET /api/cards/rarity-prices?cardName=블랙 매지션

**중고 상품 제외 옵션:**

GET /api/cards/rarity-prices?cardName=블랙 매지션&includeUsed=false

- **응답 예시**:json

```json
{
  "success": true,
  "source": "naver_api",
  "data": {
    "cardId": 125,
    "cardName": "블랙 매지션",
    "image": "https://example.com/images/black-magician.jpg(기본 이미지 url)",
    "totalProducts": 123
  },
  "rarityPrices": {
    "한글판": {
      "울트라 레어": {
        "image": "https://example.com/images/ultra-rare.jpg(울트라 레어 이미지 url)",
        "prices": [
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
        ]
      },
      "시크릿 레어": {
        "image": "https://example.com/images/secret-rare.jpg(시크릿 레어 이미지 url)",
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
            "lastUpdated": "2023-04-05T07:30:00.000Z"
          }
        ]
      }
    },
    "일본판": {
      "레어": {
        "image": "https://example.com/images/rare-jp.jpg(레어 일본판 이미지 url)",
        "prices": [
          {
            "id": 589,
            "price": 8000,
            "site": "TCGShop",
            "url": "https://tcgshop.com/product/789",
            "condition": "신품",
            "rarity": "레어",
            "language": "일본판",
            "cardCode": "LDK2-JPS01",
            "available": true,
            "lastUpdated": "2023-04-05T07:30:00.000Z"
          }
        ]
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
      "language": "영문판",
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
  "excludedStores": ["TCGShop", "Naver_카드킹덤"]
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
      "name": "블루아이즈 화이트 드래곤",
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

```json
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
            "cardCode": "LDK2-KRS01"
          },
          "image": "https://example.com/images/black-magician-ultra-ko.jpg"
        },
        {
          "cardName": "블루아이즈 화이트 드래곤",
          "price": 12500,
          "quantity": 1,
          "totalPrice": 12500,
          "product": {
            "id": 321
            "price": 12500,
            "rarity": "시크릿 레어",
            "language": "일본판",
            "site": "TCGShop",
            "url": "https://tcgshop.com/product/456",
            "cardCode": "SDK-JP01"
          },
          "image": "https://example.com/images/blue-eyes-secret-jp.jpg"
        }
      ],
      "finalPrice": 54250,
      "productCost": 57500,
      "shippingCost": 2500,
      "pointsEarned": 5750
    },
    "CardDC": {
      "cards": [
        // CardDC에서 구매할 카드 목록
      ],
      "finalPrice": 10100,
      "productCost": 9000,
      "shippingCost": 2000,
      "pointsEarned": 900
    }
  },
  "cardImages": {
    "블랙 매지션": "https://example.com/images/black-magician.jpg",
    "블루아이즈 화이트 드래곤": "https://example.com/images/blue-eyes.jpg",
    "레드아이즈 블랙 드래곤": "https://example.com/images/red-eyes.jpg"
  }
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
    "cardName": "블루아이즈 화이트 드래곤",
    "rarityPrices": {
      // 언어별, 레어도별 가격 정보
      "한국어": {
        "울트라 레어": {
          "image": "이미지URL",
          "prices": [
            {
              "id": "가격ID",
              "price": 10000,
              "site": "사이트명",
              "url": "상품URL",
              "condition": "상품상태",
              "rarity": "울트라 레어",
              "language": "한국어",
              "cardCode": "카드코드",
              "available": true,
              "lastUpdated": "2023-01-01T00:00:00Z"
            }
            // ...
          ]
        }
        // 다른 레어도들...
      },
      // 다른 언어들...
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
  { name: '블루아이즈 화이트 드래곤', rarity: 'Secret Rare' },
  { name: '레드아이즈 블랙 드래곤' }
];

calculateOptimalPurchase(cards);
```