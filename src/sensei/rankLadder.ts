/**
 * Ranked play: one rating per board size, moved by each result the Elo way.
 * The rating maps onto ranks from 30k to 9d, 100 points a rank (30k = 1000,
 * 10k = 3000, 1d = 4000), and the bot is always the rank the rating stands at. KataGo's human SL net knows 20k to
 * 9d; below that the bot plays the 20k profile, loosened (see humanWeaknessFor).
 */
import type { BoardSize } from '../types';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';

export const RANKS = [
  '30k', '29k', '28k', '27k', '26k', '25k', '24k', '23k', '22k', '21k',
  '20k', '19k', '18k', '17k', '16k', '15k', '14k', '13k', '12k', '11k',
  '10k', '9k', '8k', '7k', '6k', '5k', '4k', '3k', '2k', '1k',
  '1d', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d',
] as const;
export type Rank = (typeof RANKS)[number];

export const RANKED_BOARD_SIZES = [9, 13, 19] as const satisfies readonly BoardSize[];
export type RankedBoardSize = (typeof RANKED_BOARD_SIZES)[number];

export type GameOutcome = 'win' | 'loss' | 'draw';

export type RankHistoryEntry = {
  at: number; // epoch ms
  outcome: GameOutcome;
  before: Rank;
  after: Rank;
  /** Absent in games from before ratings; derive them from the ranks. */
  ratingBefore?: number;
  ratingAfter?: number;
  /** The bot's rank in that game. */
  opponent?: Rank;
};

export type RankState = {
  /** null until the player sets a starting rank for this board size. */
  rank: Rank | null;
  /** The rating; the rank above is the rank it is equivalent to. Absent in books from before ratings. */
  rating?: number;
  /** Ranked games played, for the larger early steps. */
  games?: number;
  history: RankHistoryEntry[];
  /** When the rank last changed, by a result or by hand; decides which copy wins in a sync. */
  changedAt?: number;
};

export type RankBook = Record<RankedBoardSize, RankState>;

export const emptyRankBook = (): RankBook => ({
  9: { rank: null, history: [] },
  13: { rank: null, history: [] },
  19: { rank: null, history: [] },
});

export function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && (RANKS as readonly string[]).includes(value);
}

/** Move `steps` along the ladder (positive = stronger), stopping at either end. */
export function shiftRank(rank: Rank, steps: number): Rank {
  const index = RANKS.indexOf(rank) + steps;
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, index))]!;
}

const RATING_BASE = 1000;
const RATING_PER_RANK = 100;
/** Larger steps for the first games, so a misjudged starting rank settles quickly. */
const PROVISIONAL_GAMES = 10;
const K_PROVISIONAL = 40;
const K_SETTLED = 24;

export const ratingForRank = (rank: Rank): number => RATING_BASE + RANKS.indexOf(rank) * RATING_PER_RANK;

export function rankForRating(rating: number): Rank {
  const index = Math.round((rating - RATING_BASE) / RATING_PER_RANK);
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, index))]!;
}

/** The player's rating for a board size, or null before a starting rank is chosen. */
export const ratingOf = (state: RankState): number | null =>
  state.rating ?? (state.rank ? ratingForRank(state.rank) : null);

/** The rating after one game against a bot of `opponent`'s rank (Elo). */
export function nextRating(rating: number, opponent: Rank, outcome: GameOutcome, gamesPlayed: number): number {
  const expected = 1 / (1 + 10 ** ((ratingForRank(opponent) - rating) / 400));
  const score = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;
  const k = gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_SETTLED;
  return Math.round(rating + k * (score - expected));
}

export function recordResult(book: RankBook, size: RankedBoardSize, outcome: GameOutcome, at: number, opponent?: Rank): RankBook {
  const state = book[size];
  const ratingBefore = ratingOf(state);
  if (!state.rank || ratingBefore === null) return book;
  const games = state.games ?? state.history.length;
  const ratingAfter = nextRating(ratingBefore, opponent ?? rankForRating(ratingBefore), outcome, games);
  const after = rankForRating(ratingAfter);
  return {
    ...book,
    [size]: {
      rank: after,
      rating: ratingAfter,
      games: games + 1,
      history: [...state.history, { at, outcome, before: state.rank, after, ratingBefore, ratingAfter, ...(opponent ? { opponent } : {}) }],
      changedAt: at,
    },
  };
}

/** The starting point: a rating at the chosen rank, counted as a fresh start. */
export function setRank(book: RankBook, size: RankedBoardSize, rank: Rank, at: number = Date.now()): RankBook {
  return { ...book, [size]: { ...book[size], rank, rating: ratingForRank(rank), games: 0, changedAt: at } };
}

const WEAKEST_HUMAN_KYU = 20;
const kyuOf = (rank: Rank): number | null => (rank.endsWith('k') ? Number.parseInt(rank, 10) : null);

/** KataGo's human SL profile for a rank, e.g. '5k' -> 'rank_5k'; 21k-30k use rank_20k. */
export function humanProfileFor(rank: Rank): string {
  const kyu = kyuOf(rank);
  return kyu !== null && kyu > WEAKEST_HUMAN_KYU ? `rank_${WEAKEST_HUMAN_KYU}k` : `rank_${rank}`;
}

/** 0 at 20k and stronger, rising to 1 at 30k. */
export function humanWeaknessFor(rank: Rank): number {
  const kyu = kyuOf(rank);
  return kyu !== null && kyu > WEAKEST_HUMAN_KYU ? (kyu - WEAKEST_HUMAN_KYU) / 10 : 0;
}

/** '5k' -> '5級', '1d' -> '初段', '3d' -> '3段'. */
export function rankLabel(rank: Rank): string {
  const n = Number.parseInt(rank, 10);
  if (rank.endsWith('k')) return `${n}級`;
  return n === 1 ? '初段' : `${n}段`;
}

/** Read whatever localStorage held, keeping only what still makes sense. */
export function parseRankBook(raw: unknown): RankBook {
  const book = emptyRankBook();
  if (!raw || typeof raw !== 'object') return book;
  for (const size of RANKED_BOARD_SIZES) {
    const entry = (raw as Record<string, unknown>)[String(size)];
    if (!entry || typeof entry !== 'object') continue;
    const { rank, history, changedAt, rating, games } = entry as { rank?: unknown; history?: unknown; changedAt?: unknown; rating?: unknown; games?: unknown };
    book[size] = {
      ...(typeof changedAt === 'number' ? { changedAt } : {}),
      ...(typeof rating === 'number' && Number.isFinite(rating) ? { rating } : {}),
      ...(typeof games === 'number' && Number.isFinite(games) ? { games } : {}),
      rank: isRank(rank) ? rank : null,
      history: Array.isArray(history)
        ? history.filter((h): h is RankHistoryEntry =>
            !!h && typeof h === 'object'
            && typeof (h as RankHistoryEntry).at === 'number'
            && ['win', 'loss', 'draw'].includes((h as RankHistoryEntry).outcome)
            && isRank((h as RankHistoryEntry).before)
            && isRank((h as RankHistoryEntry).after))
        : [],
    };
  }
  return book;
}

const STORAGE_KEY = 'web-katrain:sensei-ranks:v1';

export function loadRankBook(): RankBook {
  try {
    return parseRankBook(JSON.parse(readLocalStorage(STORAGE_KEY) ?? 'null'));
  } catch {
    return emptyRankBook();
  }
}

export function saveRankBook(book: RankBook): void {
  // Private mode or a full quota: the ladder just will not survive a reload.
  writeLocalStorage(STORAGE_KEY, JSON.stringify(book));
}
