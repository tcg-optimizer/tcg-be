# 카드 최적 구매 알고리즘 사용 가이드

## 알고리즘 옵션

카드 가격 비교 시스템에서는 최적 구매 조합을 찾기 위해 두 가지 알고리즘을 지원합니다:

1. **그리디 알고리즘 (Greedy Algorithm)** - 기본값
   - 빠른 계산 속도
   - 많은 수의 카드 처리 가능
   - 최적해를 보장하지는 않음

2. **브루트 포스 알고리즘 (Brute Force Algorithm)**
   - 모든 가능한 조합을 검색
   - 항상 최적해 보장
   - 카드 수가 많을 경우 계산 시간이 매우 오래 걸림 (12개 이하 권장)

3. **알고리즘 비교 (Compare)**
   - 두 알고리즘의 결과를 비교하여 그리디 알고리즘의 정확도 평가
   - 비교 결과를 상세 정보와 함께 반환

## API 사용법

### 최적 구매 조합 계산 API

**엔드포인트:** `POST /api/cards/optimal-purchase`

**요청 예시:**
```json
{
  "cards": [
    {
      "cardName": "Blue-Eyes White Dragon",
      "language": "KOR",
      "rarity": "UR",
      "quantity": 2,
      "cacheId": "abc123"
    },
    {
      "cardName": "Dark Magician",
      "language": "JPN",
      "rarity": "SR",
      "quantity": 1,
      "cacheId": "def456" 
    }
  ],
  "algorithm": "greedy",  // "greedy", "brute_force", "compare" 중 선택
  "shippingRegion": "default",
  "tcgshopPoints": true,
  "carddcPoints": true
}
```

**알고리즘 지정:**
- `algorithm` 필드를 사용하여 알고리즘 지정:
  - `"greedy"` - 그리디 알고리즘 사용 (기본값)
  - `"brute_force"` - 브루트 포스 알고리즘 사용
  - `"compare"` - 두 알고리즘 모두 실행하여 결과 비교

**응답 형식:**
```json
{
  "totalCost": 15000,
  "sellers": [
    {
      "sellerId": "TCGShop",
      "cards": [...],
      "subtotal": 12000,
      "shippingFee": 3000,
      "points": 0,
      "total": 15000
    }
  ],
  "cardsOptimalPurchase": [...],
  "algorithm": "greedy",
  "comparison": {  // algorithm이 "compare"인 경우에만 포함
    "greedy": {
      "totalCost": 15000,
      "sellers": ["TCGShop"]
    },
    "bruteForce": {
      "totalCost": 14500,
      "sellers": ["CardDC", "TCGShop"]
    },
    "comparison": {
      "costDifference": 500,
      "percentageDifference": 3.45,
      "isOptimal": false,
      "sameSellerComposition": false
    },
    "message": "그리디 알고리즘은 최적해보다 500원 비쌉니다 (3.45% 차이)."
  }
}
```

## 성능 고려사항

1. **브루트 포스 알고리즘 제한사항**:
   - 계산 복잡도: O(s^n), 여기서 s는 판매처 수, n은 카드 수
   - 최대 12개 카드로 제한됨 (그 이상은 자동으로 잘림)
   - 카드 수가 많을 경우 계산 시간이 지수적으로 증가

2. **비교 모드 제한사항**:
   - 비교 모드에서는 최대 8개 카드로 제한됨
   - 카드 수가 많을 경우 자동으로 처음 8개만 비교

## 사용 예시 (JavaScript)

```javascript
// 최적 구매 조합 요청 (그리디 알고리즘 사용)
const response = await fetch('/api/cards/optimal-purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cards: [...],
    algorithm: 'greedy',
    shippingRegion: 'default'
  })
});

// 브루트 포스 알고리즘으로 계산
const responseBF = await fetch('/api/cards/optimal-purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cards: [...],
    algorithm: 'brute_force',
    shippingRegion: 'default'
  })
});

// 두 알고리즘 비교 요청
const responseCompare = await fetch('/api/cards/optimal-purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cards: [...],
    algorithm: 'compare',
    shippingRegion: 'default'
  })
});
``` 