export const GAME_TYPES = Object.freeze({
  YUGIOH: 'yugioh',
  VANGUARD: 'vanguard',
  ONEPIECE: 'onepiece',
} as const);

export type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

export const SUPPORTED_GAME_TYPES: readonly string[] = Object.freeze(Object.values(GAME_TYPES));

export const GAME_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  [GAME_TYPES.YUGIOH]: '유희왕',
  [GAME_TYPES.VANGUARD]: '뱅가드',
  [GAME_TYPES.ONEPIECE]: '원피스',
});
