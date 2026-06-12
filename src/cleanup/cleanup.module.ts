import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardPriceCache])],
  providers: [CleanupService],
})
export class CleanupModule {}
