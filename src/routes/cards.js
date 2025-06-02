const express = require('express');
const router = express.Router();

const cardController = require('../controllers/cardController');
const { createRequestLogger } = require('../utils/requestLogger');

// 각 라우트에 대한 로깅 미들웨어 적용
router.get(
  '/crawl/naver',
  createRequestLogger('crawlNaverStorePrice'),
  cardController.crawlNaverStorePrice
);
router.get(
  '/search/naver-api',
  createRequestLogger('searchNaverShopApi'),
  cardController.searchNaverShopApi
);
router.get('/search/tcgshop', createRequestLogger('searchTCGShop'), cardController.searchTCGShop);
router.get('/search/carddc', createRequestLogger('searchCardDC'), cardController.searchCardDC);
// router.get('/search/onlyyugioh', cardController.searchOnlyYugioh); // 온리유희왕 일시적 영업 중단으로 주석 처리

router.get(
  '/rarity-prices',
  createRequestLogger('getPricesByRarity'),
  cardController.getPricesByRarity
);

router.post(
  '/optimal-purchase',
  createRequestLogger('getOptimalPurchaseCombination'),
  cardController.getOptimalPurchaseCombination
);

router.get(
  '/prices-cache/:id',
  createRequestLogger('getCachedPrices'),
  cardController.getCachedPrices
);

module.exports = router;
