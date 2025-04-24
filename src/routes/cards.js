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


// 레어도별 가격 검색
router.get('/rarity-prices', cardController.getPricesByRarity);
 
// 최적 구매 조합 계산
router.post('/optimal-purchase', cardController.getOptimalPurchaseCombination);

// 캐시된 가격 정보 조회
router.get('/prices-cache/:id', cardController.getCachedPrices);


module.exports = router; 