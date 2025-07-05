const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/db');

const CardPriceCache = sequelize.define(
  'CardPriceCache',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cardName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rarityPrices: {
      // 레어도별 가격 정보 JSON 객체, 자세한 객체 형식은 Notion API 문서 참조
      type: DataTypes.JSON,
      allowNull: false,
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

module.exports = CardPriceCache;
