const express = require('express');
const router = express.Router();

// 컨트롤러 불러오기
const cardController = require('../controllers/cardController');

// 카드 라우트
router.get('/crawl/naver', cardController.crawlNaverStorePrice);
router.get('/search/naver-api', cardController.searchNaverShopApi);
router.get('/search/tcgshop', cardController.searchTCGShop);
router.get('/search/carddc', cardController.searchCardDC);
router.get('/search/onlyyugioh', cardController.searchOnlyYugioh);
router.get('/test-api', cardController.testNaverApi);
router.get('/lowest', cardController.getLowestPrice);

// 카드 가격 검색 - 특정 사이트 (아직 구현되지 않은 함수는 주석 처리)
// router.get('/prices/naver', cardController.searchNaver);
// router.get('/prices/tcgshop', cardController.searchTCGShop);
// router.get('/prices/carddc', cardController.searchCardDC);
// router.get('/prices/onlyyugioh', cardController.searchOnlyYugioh);

// 카드 가격 검색 - 모든 사이트
// router.get('/prices', cardController.getCardPrices);

// 레어도별 가격 검색
router.get('/rarity-prices', cardController.getPricesByRarity);

// 레어도 파싱 테스트
router.post('/test-rarity-parsing', cardController.testRarityParsing);

// 최적 구매 조합 계산
router.post('/optimal-purchase', cardController.getOptimalPurchaseCombination);

// 캐시된 가격 정보 조회
router.get('/prices-cache/:id', cardController.getCachedPrices);

// 가장 일반적인 라우트는 마지막에 배치
// router.get('/:cardName', cardController.getCardByName);

// GET /api/cards/:name - 카드 정보 가져오기
// router.get('/:name', cardController.getCardInfo);

module.exports = router; 