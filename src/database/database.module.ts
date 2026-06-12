import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardPriceCache } from '../entities/card-price-cache.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql' as const,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [CardPriceCache],
        synchronize: false,
        logging: false,
        timezone: '+09:00',
        extra: {
          connectionLimit: 5,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
