const express = require('express');
const router = express.Router();

const cardController = require('../controllers/cardController');

router.get('/crawl/naver', cardController.crawlNaverStorePrice);
router.get('/search/naver-api', cardController.searchNaverShopApi);
router.get('/search/tcgshop', cardController.searchTCGShop);
router.get('/search/carddc', cardController.searchCardDC);
// router.get('/search/onlyyugioh', cardController.searchOnlyYugioh); // 온리유희왕 일시적 영업 중단으로 주석 처리

router.get('/rarity-prices', cardController.getPricesByRarity);
 
router.post('/optimal-purchase', cardController.getOptimalPurchaseCombination);

router.get('/prices-cache/:id', cardController.getCachedPrices);


module.exports = router; 