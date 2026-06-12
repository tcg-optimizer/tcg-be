import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';

@Injectable()
export class CleanupService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(CardPriceCache)
    private readonly cacheRepo: Repository<CardPriceCache>
  ) {}

  onApplicationBootstrap() {
    // 기존 app.js: startPeriodicCleanup(60)
    this.startPeriodicCleanup(60);
  }

  async cleanupExpiredCardPriceCache(): Promise<number> {
    try {
      const result = await this.cacheRepo.delete({ expiresAt: LessThan(new Date()) });
      return result.affected ?? 0;
    } catch (error) {
      console.error('[ERROR] CardPriceCache 정리 중 오류 발생:', error);
      return 0;
    }
  }

  async cleanupAllExpiredData(): Promise<void> {
    console.log('[CLEANUP] 만료된 데이터 정리 시작...');
    const startTime = new Date();
    try {
      const cardPriceCache = await this.cleanupExpiredCardPriceCache();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(
        `[CLEANUP] 정리 완료: CardPriceCache(${cardPriceCache}), 소요시간: ${duration}ms`
      );
    } catch (error) {
      console.error('[ERROR] 데이터 정리 중 전체 오류 발생:', error);
    }
  }

  startPeriodicCleanup(intervalMinutes = 60): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`[CLEANUP] 정기 데이터 정리 시작 (${intervalMinutes}분마다 실행)`);
    this.cleanupAllExpiredData();
    const cleanupInterval = setInterval(() => {
      this.cleanupAllExpiredData();
    }, intervalMs);
    return cleanupInterval;
  }
}
