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
};

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

/** Least practised first, then the ones missed most. */
export function nextProblem(problems: readonly Problem[]): Problem | null {
  if (!problems.length) return null;
  return [...problems].sort((a, b) => a.attempts - b.attempts || (a.solved / Math.max(1, a.attempts)) - (b.solved / Math.max(1, b.attempts)) || a.createdAt - b.createdAt)[0]!;
}

export function recordAttempt(problems: readonly Problem[], id: string, correct: boolean): Problem[] {
  return problems.map((p) => (p.id === id ? { ...p, attempts: p.attempts + 1, solved: p.solved + (correct ? 1 : 0) } : p));
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
