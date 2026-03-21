const GAME_TYPES = Object.freeze({
  YUGIOH: 'yugioh',
  VANGUARD: 'vanguard',
  ONEPIECE: 'onepiece',
});

const SUPPORTED_GAME_TYPES = Object.freeze(Object.values(GAME_TYPES));

const GAME_TYPE_LABELS = Object.freeze({
  [GAME_TYPES.YUGIOH]: '유희왕',
  [GAME_TYPES.VANGUARD]: '뱅가드',
  [GAME_TYPES.ONEPIECE]: '원피스 카드게임',
});

module.exports = {
  GAME_TYPES,
  SUPPORTED_GAME_TYPES,
  GAME_TYPE_LABELS,
};
