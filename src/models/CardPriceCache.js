const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/db');
const { v7: uuidv7 } = require('uuid');
const { GAME_TYPES } = require('../constants/gameTypes');

const CardPriceCache = sequelize.define(
  'CardPriceCache',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv7(),
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
    gameType: {
      // 게임 타입 (yugioh: 유희왕, vanguard: 뱅가드, onepiece: 원피스 카드게임)
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: GAME_TYPES.YUGIOH,
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
    indexes: [
      {
        fields: ['cardName', 'gameType', 'expiresAt'],
      },
    ],
  }
);

module.exports = CardPriceCache;
