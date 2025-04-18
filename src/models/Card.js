const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/db');

const Card = sequelize.define('Card', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// 가격 정보를 위한 모델
const CardPrice = sequelize.define('CardPrice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  site: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  condition: {
    type: DataTypes.STRING,
    defaultValue: '일반'
  },
  rarity: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '가격 정보에 연결된 카드의 레어도'
  },
  language: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '카드 언어 (한글판, 일본판, 영문판)'
  },
  cardCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '카드 코드 (예: ROTA-KR024)'
  },
  available: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastUpdated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// 관계 설정
Card.hasMany(CardPrice, { foreignKey: 'cardId', as: 'prices' });
CardPrice.belongsTo(Card, { foreignKey: 'cardId' });

// 최저가 계산 메소드
Card.prototype.getLowestPrice = async function() {
  try {
    const prices = await CardPrice.findAll({
      where: {
        cardId: this.id,
        available: true
      },
      order: [['price', 'ASC']]
    });
    
    if (prices.length === 0) {
      return null;
    }
    
    return prices[0];
  } catch (error) {
    console.error('최저가 조회 오류:', error);
    return null;
  }
};

module.exports = { Card, CardPrice };   