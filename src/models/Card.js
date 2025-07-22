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
      // 카드 이미지 URL
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    //사실 timestamps가 true면 자동으로 createdAt, updatedAt 생성되서 아래 두 줄은 필요없긴함
    //그렇지만 프론트와의 원활한 협업을 위해 남겨둠
  }
);

const CardPrice = sequelize.define(
  'CardPrice',
  {
    id: {
      // 검색 결과 고유의 ID
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    site: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    condition: {
      // 카드의 상태 (신품, 중고)
      type: DataTypes.STRING,
      defaultValue: '신품',
    },
    rarity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    language: {
      // 카드 언어 (한글판, 일본판, 영문판)
      type: DataTypes.STRING,
      allowNull: true,
    },
    cardCode: {
      // 카드 코드 (예: ROTA-KR024)
      type: DataTypes.STRING,
      allowNull: true,
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
    },
    illustration: {
      // 일러스트 타입 (default: 기본 일러스트, another: 어나더 일러스트)
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'default',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
);

Card.hasMany(CardPrice, { foreignKey: 'cardId', as: 'prices' });
CardPrice.belongsTo(Card, { foreignKey: 'cardId' });

module.exports = { Card, CardPrice };
