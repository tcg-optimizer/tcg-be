import { GAME_TYPES, SUPPORTED_GAME_TYPES } from '../constants/game-types';

export function normalizeGameType(gameType: unknown, fallback: string = GAME_TYPES.YUGIOH): string {
  if (!gameType || typeof gameType !== 'string') {
    return fallback;
  }

  const normalized = gameType.trim().toLowerCase();
  if (SUPPORTED_GAME_TYPES.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

export function isValidGameType(gameType: unknown): boolean {
  if (!gameType || typeof gameType !== 'string') {
    return false;
  }

  return SUPPORTED_GAME_TYPES.includes(gameType.trim().toLowerCase());
}
