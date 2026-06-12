import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { CardsModule } from './cards/cards.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { AppController } from './app.controller';

@Module({
  imports: [RedisModule, DatabaseModule, CardsModule, CleanupModule],
  controllers: [AppController],
})
export class AppModule {}
