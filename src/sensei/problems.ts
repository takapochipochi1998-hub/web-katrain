/**
 * "次の一手" problems: a position from a reviewed game and the moves the engine
 * thought were good enough there. Stored as a board snapshot so practising one
 * never touches the game in the store.
 */
import type { BoardState, CandidateMove, Player } from '../types';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';

export type Problem = {
  id: string;
  board: BoardState;
  toPlay: Player;
  /** Moves accepted as correct; the first is the engine's best. */
  answers: Array<{ x: number; y: number }>;
  /** The move actually played in the game, shown after an attempt. */
  played: { x: number; y: number } | null;
  createdAt: number;
  attempts: number;
  solved: number;
  /** Spaced repetition (Anki's SM-2, simplified). Absent on problems from before it: due now. */
  dueAt?: number;
  /** Days until the next review after the last right answer. */
  interval?: number;
  /** How fast the interval grows (Anki's ease, 1.3 to 3.0). */
  ease?: number;
  /** Right answers in a row. */
  streak?: number;
};

const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER = 10 * 60 * 1000;
const EASE_START = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 3.0;

/**
 * The next review, the way Anki spaces them: a right answer waits 1 day, then
 * 3, then grows by the ease each time; a wrong one comes back in 10 minutes
 * and makes the problem's growth slower.
 */
export function schedule(problem: Problem, correct: boolean, now: number): Problem {
  const ease = problem.ease ?? EASE_START;
  const streak = problem.streak ?? 0;
  const base = { ...problem, attempts: problem.attempts + 1, solved: problem.solved + (correct ? 1 : 0) };
  if (!correct) {
    return { ...base, streak: 0, interval: 0, ease: Math.max(EASE_MIN, ease - 0.2), dueAt: now + RETRY_AFTER };
  }
  const nextStreak = streak + 1;
  const interval = nextStreak === 1 ? 1 : nextStreak === 2 ? 3 : Math.round((problem.interval ?? 3) * ease);
  return { ...base, streak: nextStreak, interval, ease: Math.min(EASE_MAX, ease + 0.05), dueAt: now + interval * DAY };
}

export const isDue = (problem: Problem, now: number): boolean => (problem.dueAt ?? 0) <= now;

/** A candidate within this many points of the best counts as a right answer. */
export const ANSWER_TOLERANCE = 1;
/** Openings have many equal moves; a problem with a dozen answers teaches nothing. */
export const MAX_ANSWERS = 5;

export function answersFrom(moves: readonly CandidateMove[]): Array<{ x: number; y: number }> {
  const playable = moves.filter((m) => m.x >= 0);
  if (!playable.length) return [];
  return playable
    .filter((m, i) => i === 0 || Math.max(0, m.pointsLost) <= ANSWER_TOLERANCE)
    .slice(0, MAX_ANSWERS)
    .map(({ x, y }) => ({ x, y }));
}

export function isCorrect(problem: Problem, x: number, y: number): boolean {
  return problem.answers.some((a) => a.x === x && a.y === y);
}

export function createProblem(opts: {
  board: BoardState;
  toPlay: Player;
  moves: readonly CandidateMove[];
  played: { x: number; y: number } | null;
  now: number;
}): Problem | null {
  const answers = answersFrom(opts.moves);
  if (!answers.length) return null;
  return {
    id: `${opts.now}-${Math.random().toString(36).slice(2, 8)}`,
    board: opts.board.map((row) => [...row]),
    toPlay: opts.toPlay,
    answers,
    played: opts.played,
    createdAt: opts.now,
    attempts: 0,
    solved: 0,
  };
}

/** Same board and same side to play: adding it again would only duplicate it. */
export function sameProblem(a: Pick<Problem, 'board' | 'toPlay'>, b: Pick<Problem, 'board' | 'toPlay'>): boolean {
  return a.toPlay === b.toPlay && JSON.stringify(a.board) === JSON.stringify(b.board);
}

/** The problem due longest ago; with `ahead`, the one due soonest even if not due yet. */
export function nextProblem(problems: readonly Problem[], now: number, ahead = false): Problem | null {
  const pool = ahead ? problems : problems.filter((p) => isDue(p, now));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.createdAt - b.createdAt)[0]!;
}

/** When the next problem falls due, or null when there are none. */
export function nextDueAt(problems: readonly Problem[]): number | null {
  return problems.length ? Math.min(...problems.map((p) => p.dueAt ?? 0)) : null;
}

export function recordAttempt(problems: readonly Problem[], id: string, correct: boolean, now: number = Date.now()): Problem[] {
  return problems.map((p) => (p.id === id ? schedule(p, correct, now) : p));
}

const STORAGE_KEY = 'web-katrain:sensei-problems:v1';

function isProblem(value: unknown): value is Problem {
  if (!value || typeof value !== 'object') return false;
  const p = value as Problem;
  return typeof p.id === 'string'
    && Array.isArray(p.board) && p.board.length > 0
    && (p.toPlay === 'black' || p.toPlay === 'white')
    && Array.isArray(p.answers) && p.answers.length > 0
    && typeof p.createdAt === 'number'
    && typeof p.attempts === 'number'
    && typeof p.solved === 'number';
}

export function loadProblems(): Problem[] {
  try {
    const raw = JSON.parse(readLocalStorage(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter(isProblem) : [];
  } catch {
    return [];
  }
}

export function storeProblems(problems: readonly Problem[]): boolean {
  return writeLocalStorage(STORAGE_KEY, JSON.stringify(problems));
}
