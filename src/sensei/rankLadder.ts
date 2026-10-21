/**
 * Ranked play: one rank per board size, moved one step by each result.
 * The ladder runs 30k to 9d like AI Sensei. KataGo's human SL net knows 20k to
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
};

export type RankState = {
  /** null until the player sets a starting rank for this board size. */
  rank: Rank | null;
  history: RankHistoryEntry[];
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

/** The rank to play next after this result: a win steps up, a loss steps down. */
export function rankAfter(rank: Rank, outcome: GameOutcome): Rank {
  if (outcome === 'win') return shiftRank(rank, 1);
  if (outcome === 'loss') return shiftRank(rank, -1);
  return rank;
}

export function recordResult(book: RankBook, size: RankedBoardSize, outcome: GameOutcome, at: number): RankBook {
  const state = book[size];
  if (!state.rank) return book;
  const after = rankAfter(state.rank, outcome);
  return {
    ...book,
    [size]: { rank: after, history: [...state.history, { at, outcome, before: state.rank, after }] },
  };
}

export function setRank(book: RankBook, size: RankedBoardSize, rank: Rank): RankBook {
  return { ...book, [size]: { ...book[size], rank } };
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
    const { rank, history } = entry as { rank?: unknown; history?: unknown };
    book[size] = {
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
