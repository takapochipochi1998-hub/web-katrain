/**
 * The simple mode's own game list: every game against the bot, kept as SGF
 * with the facts SGF has no place for (ranked or free, which colour was the
 * player, the bot's rank, whether the ladder already moved).
 */
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import { isRank } from './rankLadder';
import type { SessionMeta } from './session';

export type SavedGame = {
  id: string;
  meta: SessionMeta;
  sgf: string;
  /** SGF result such as "W+R", or null while the game is still on. */
  result: string | null;
  moveCount: number;
  updatedAt: number;
};

const STORAGE_KEY = 'web-katrain:sensei-games:v1';
/** Oldest games beyond this fall off; a few hundred SGFs fit easily in storage. */
export const MAX_SAVED_GAMES = 300;

export const gameIdFor = (meta: Pick<SessionMeta, 'startedAt'>): string => String(meta.startedAt);

function isSavedGame(value: unknown): value is SavedGame {
  if (!value || typeof value !== 'object') return false;
  const g = value as SavedGame;
  return typeof g.id === 'string'
    && typeof g.sgf === 'string'
    && typeof g.updatedAt === 'number'
    && typeof g.moveCount === 'number'
    && (g.result === null || typeof g.result === 'string')
    && !!g.meta && isRank(g.meta.aiRank)
    && (g.meta.humanColor === 'black' || g.meta.humanColor === 'white')
    && [9, 13, 19].includes(g.meta.size);
}

export function parseSavedGames(raw: unknown): SavedGame[] {
  return Array.isArray(raw) ? raw.filter(isSavedGame) : [];
}

export function loadSavedGames(): SavedGame[] {
  try {
    return parseSavedGames(JSON.parse(readLocalStorage(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** Replace any earlier copy of the same game; newest game first by when it started. */
export function upsertGame(games: readonly SavedGame[], game: SavedGame): SavedGame[] {
  return [game, ...games.filter((g) => g.id !== game.id)]
    .sort((a, b) => b.meta.startedAt - a.meta.startedAt)
    .slice(0, MAX_SAVED_GAMES);
}

export function removeGame(games: readonly SavedGame[], id: string): SavedGame[] {
  return games.filter((g) => g.id !== id);
}

export function storeSavedGames(games: readonly SavedGame[]): boolean {
  return writeLocalStorage(STORAGE_KEY, JSON.stringify(games));
}
