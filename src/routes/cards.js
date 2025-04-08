const express = require('express');
const router = express.Router();

// 컨트롤러 불러오기
const cardController = require('../controllers/cardController');

// 카드 라우트
router.get('/', cardController.getAllCards);
router.get('/crawl/naver/:cardName', cardController.crawlNaverStorePrice);
router.get('/search/naver-api/:cardName', cardController.searchNaverShopApi);
router.get('/search/tcgshop/:cardName', cardController.searchTCGShop);
router.get('/search/carddc/:cardName', cardController.searchCardDC);
router.get('/search/onlyyugioh/:cardName', cardController.searchOnlyYugioh);
router.get('/test-api/:cardName', cardController.testNaverApi);
router.get('/lowest/:cardName', cardController.getLowestPrice);

// 카드 가격 검색 - 특정 사이트
router.get('/prices/naver/:cardName', cardController.searchNaver);
router.get('/prices/tcgshop/:cardName', cardController.searchTCGShop);
router.get('/prices/carddc/:cardName', cardController.searchCardDC);
router.get('/prices/onlyyugioh/:cardName', cardController.searchOnlyYugioh);

// 카드 가격 검색 - 모든 사이트
router.get('/prices/:cardName', cardController.getCardPrices);

// 레어도별 가격 검색
router.get('/rarity-prices/:cardName', cardController.getPricesByRarity);

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