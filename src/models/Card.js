const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/db');

const Card = sequelize.define(
  'Card',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
);

const CardPrice = sequelize.define(
  'CardPrice',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '검색 결과 고유의 ID',
    },
    site: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    condition: {
      type: DataTypes.STRING,
      defaultValue: '일반',
    },
    rarity: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '가격 정보에 연결된 카드의 레어도',
    },
    language: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '카드 언어 (한글판, 일본판, 영문판)',
    },
    cardCode: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '카드 코드 (예: ROTA-KR024)',
    },
    available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastUpdated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    productId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '연결된 상품 ID (최저가 조합 계산에 사용)',
    },
    illustration: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'default',
      comment: '일러스트 타입 (default: 기본 일러스트, another: 다른 일러스트)',
    },
  },
  {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
);

// 관계 설정
Card.hasMany(CardPrice, { foreignKey: 'cardId', as: 'prices' });
CardPrice.belongsTo(Card, { foreignKey: 'cardId' });

module.exports = { Card, CardPrice };
