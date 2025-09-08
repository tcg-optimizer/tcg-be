const { Card, CardPrice } = require('../models/Card');
const CardPriceCache = require('../models/CardPriceCache');
const { Op } = require('sequelize');

async function cleanupExpiredCardPriceCache() {
  try {
    const deletedCount = await CardPriceCache.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(),
        },
      },
    });

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] CardPriceCache 정리 중 오류 발생:', error);
    return 0;
  }
}


async function cleanupExpiredCardPrice() {
  try {
    const deletedCount = await CardPrice.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(),
        },
      },
    });

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] CardPrice 정리 중 오류 발생:', error);
    return 0;
  }
}


async function cleanupExpiredCard() {
  try {
    const deletedCount = await Card.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(),
        },
      },
    });

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] Card 정리 중 오류 발생:', error);
    return 0;
  }
}


async function cleanupAllExpiredData() {
  console.log('[CLEANUP] 만료된 데이터 정리 시작...');
  
  const startTime = new Date();

  try {
    const cardPriceCache = await cleanupExpiredCardPriceCache();
    const cardPrice = await cleanupExpiredCardPrice();
    const card = await cleanupExpiredCard();

    const endTime = new Date();
    const duration = endTime - startTime;

    console.log(`[CLEANUP] 정리 완료: Card(${card}), CardPrice(${cardPrice}), CardPriceCache(${cardPriceCache}), 소요시간: ${duration}ms`);
  } catch (error) {
    console.error('[ERROR] 데이터 정리 중 전체 오류 발생:', error);
  }
}


function startPeriodicCleanup(intervalMinutes = 60) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[CLEANUP] 정기 데이터 정리 시작 (${intervalMinutes}분마다 실행)`);
  
  cleanupAllExpiredData();
  
  // 정기적으로 실행
  const cleanupInterval = setInterval(() => {
    cleanupAllExpiredData();
  }, intervalMs);

  return cleanupInterval;
}

module.exports = {
  cleanupExpiredCardPriceCache, // startPeriodicCleanup 이외는 테스트 이후 삭제 고려 가능
  cleanupExpiredCardPrice,
  cleanupExpiredCard,
  cleanupAllExpiredData,
  startPeriodicCleanup,
};