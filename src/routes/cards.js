const express = require('express');
const router = express.Router();

const cardController = require('../controllers/cardController');
const { createRequestLogger } = require('../utils/requestLogger');

router.get(
  '/search/naver-api',
  createRequestLogger('searchNaverShopApi'),
  cardController.searchNaverShopApi
);
router.get('/search/tcgshop', createRequestLogger('searchTCGShop'), cardController.searchTCGShop);
router.get('/search/carddc', createRequestLogger('searchCardDC'), cardController.searchCardDC);

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
