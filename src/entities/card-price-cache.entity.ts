import { BeforeInsert, BeforeUpdate, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { GAME_TYPES } from '../common/constants/game-types';

// Sequelize가 생성한 기존 테이블(CardPriceCaches)을 그대로 사용한다. synchronize: false.
@Entity({ name: 'CardPriceCaches' })
@Index(['cardName', 'gameType', 'expiresAt'])
export class CardPriceCache {
  // strict 모드(strictPropertyInitialization)에서 TypeORM 엔티티는 `!` 한정자 필요
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  cardName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image!: string | null;

  @Column({ type: 'varchar', length: 255, default: GAME_TYPES.YUGIOH })
  gameType!: string;

  // 레어도별 가격 정보 JSON 객체
  @Column({ type: 'json' })
  rarityPrices!: any;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  // Create/UpdateDateColumn을 쓰지 않는다: 기존 테이블은 Sequelize가 DEFAULT 없이
  // NOT NULL로 생성했고(타임스탬프를 앱에서 채움), TypeORM의 날짜 데코레이터는 INSERT 시
  // DB 기본값(DEFAULT)에 의존해 ER_NO_DEFAULT_FOR_FIELD로 실패한다.
  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime' })
  updatedAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  // Sequelize의 timestamps: true 동작 재현 — INSERT/UPDATE 시 앱에서 타임스탬프 설정
  @BeforeInsert()
  setInsertTimestamps() {
    const now = new Date();
    if (!this.createdAt) {
      this.createdAt = now;
    }
    this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdateTimestamp() {
    this.updatedAt = new Date();
  }
}
