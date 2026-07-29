"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGameType = normalizeGameType;
exports.isValidGameType = isValidGameType;
const game_types_1 = require("../constants/game-types");
function normalizeGameType(gameType, fallback = game_types_1.GAME_TYPES.YUGIOH) {
    if (!gameType || typeof gameType !== 'string') {
        return fallback;
    }
    const normalized = gameType.trim().toLowerCase();
    if (game_types_1.SUPPORTED_GAME_TYPES.includes(normalized)) {
        return normalized;
    }
    return fallback;
}
function isValidGameType(gameType) {
    if (!gameType || typeof gameType !== 'string') {
        return false;
    }
    return game_types_1.SUPPORTED_GAME_TYPES.includes(gameType.trim().toLowerCase());
}
//# sourceMappingURL=game-type.js.map