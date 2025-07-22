const { Card, CardPrice } = require('../models/Card');
const CardPriceCache = require('../models/CardPriceCache');
const { Op } = require('sequelize');

/**
 * 만료된 CardPriceCache 데이터를 삭제하는 함수
 * @returns {Promise<number>} 삭제된 레코드 수
 */
async function cleanupExpiredCardPriceCache() {
  try {
    const deletedCount = await CardPriceCache.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(), // 현재 시간보다 이전인 것들
        },
      },
    });

    if (deletedCount > 0) {
      console.log(`[CLEANUP] 만료된 CardPriceCache ${deletedCount}개 삭제됨`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] CardPriceCache 정리 중 오류 발생:', error);
    return 0;
  }
}

/**
 * 만료된 CardPrice 데이터를 삭제하는 함수
 * @returns {Promise<number>} 삭제된 레코드 수
 */
async function cleanupExpiredCardPrice() {
  try {
    const deletedCount = await CardPrice.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(), // 현재 시간보다 이전인 것들
        },
      },
    });

    if (deletedCount > 0) {
      console.log(`[CLEANUP] 만료된 CardPrice ${deletedCount}개 삭제됨`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] CardPrice 정리 중 오류 발생:', error);
    return 0;
  }
}

/**
 * 만료된 Card 데이터를 삭제하는 함수 (연관된 CardPrice도 함께 삭제됨)
 * @returns {Promise<number>} 삭제된 레코드 수
 */
async function cleanupExpiredCard() {
  try {
    const deletedCount = await Card.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date(), // 현재 시간보다 이전인 것들
        },
      },
    });

    if (deletedCount > 0) {
      console.log(`[CLEANUP] 만료된 Card ${deletedCount}개 삭제됨 (연관된 CardPrice도 함께 삭제)`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[ERROR] Card 정리 중 오류 발생:', error);
    return 0;
  }
}

/**
 * 모든 만료된 데이터를 정리하는 함수
 * @returns {Promise<Object>} 삭제된 레코드 수 통계
 */
async function cleanupAllExpiredData() {
  console.log('[CLEANUP] 만료된 데이터 정리 시작...');
  
  const stats = {
    cardPriceCache: 0,
    cardPrice: 0,
    card: 0,
    startTime: new Date(),
  };

  try {
    // 1. CardPriceCache 정리
    stats.cardPriceCache = await cleanupExpiredCardPriceCache();

    // 2. CardPrice 정리
    stats.cardPrice = await cleanupExpiredCardPrice();

    // 3. Card 정리 (이것이 연관된 CardPrice도 함께 삭제할 수 있음)
    stats.card = await cleanupExpiredCard();

    stats.endTime = new Date();
    stats.duration = stats.endTime - stats.startTime;

    console.log(`[CLEANUP] 정리 완료: Card(${stats.card}), CardPrice(${stats.cardPrice}), CardPriceCache(${stats.cardPriceCache}), 소요시간: ${stats.duration}ms`);

    return stats;
  } catch (error) {
    console.error('[ERROR] 데이터 정리 중 전체 오류 발생:', error);
    stats.error = error.message;
    return stats;
  }
}

/**
 * 정기적인 데이터 정리를 시작하는 함수
 * @param {number} intervalMinutes 정리 간격 (분 단위, 기본값: 60분)
 */
function startPeriodicCleanup(intervalMinutes = 60) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[CLEANUP] 정기 데이터 정리 시작 (${intervalMinutes}분마다 실행)`);
  
  // 즉시 한 번 실행
  cleanupAllExpiredData();
  
  // 정기적으로 실행
  const cleanupInterval = setInterval(() => {
    cleanupAllExpiredData();
  }, intervalMs);

  return cleanupInterval;
}

module.exports = {
  cleanupExpiredCardPriceCache,
  cleanupExpiredCardPrice,
  cleanupExpiredCard,
  cleanupAllExpiredData,
  startPeriodicCleanup,
};