const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/db');

// 카드 가격 정보 캐싱
const CardPriceCache = sequelize.define('CardPriceCache', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cardName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '카드 이름'
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '카드 이미지 URL'
  },
  rarityPrices: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: '레어도별 가격 정보 JSON 객체'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '캐시 만료 시간'
  }
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

module.exports = CardPriceCache; 