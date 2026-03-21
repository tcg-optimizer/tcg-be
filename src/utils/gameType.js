const { GAME_TYPES, SUPPORTED_GAME_TYPES } = require('../constants/gameTypes');

function normalizeGameType(gameType, fallback = GAME_TYPES.YUGIOH) {
  if (!gameType || typeof gameType !== 'string') {
    return fallback;
  }

  const normalized = gameType.trim().toLowerCase();
  if (SUPPORTED_GAME_TYPES.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function isValidGameType(gameType) {
  if (!gameType || typeof gameType !== 'string') {
    return false;
  }

  return SUPPORTED_GAME_TYPES.includes(gameType.trim().toLowerCase());
}

module.exports = {
  normalizeGameType,
  isValidGameType,
};
