import { describe, expect, it } from 'vitest';
import type { BoardState, CandidateMove, GameNode } from '../src/types';
import { answersFrom, createProblem, isCorrect, nextProblem, recordAttempt, sameProblem } from '../src/sensei/problems';
import { parsePreferences } from '../src/sensei/preferences';
import { parseSavedGames, removeGame, upsertGame, type SavedGame } from '../src/sensei/savedGames';
import { sgfForPath } from '../src/sensei/sgfPath';

const cand = (x: number, y: number, pointsLost: number): CandidateMove =>
  ({ x, y, pointsLost, winRate: 0.5, scoreLead: 0, visits: 10, order: 0 });
const empty = (n: number): BoardState => Array.from({ length: n }, () => Array<null>(n).fill(null));

describe('problems', () => {
  it('accepts the best move and anything within a point of it', () => {
    expect(answersFrom([cand(2, 2, 0), cand(3, 3, 0.8), cand(4, 4, 1.5), cand(-1, -1, 0)])).toEqual([{ x: 2, y: 2 }, { x: 3, y: 3 }]);
  });

  it('builds a problem only when there is an answer', () => {
    expect(createProblem({ board: empty(9), toPlay: 'black', moves: [], played: null, now: 1 })).toBeNull();
    const p = createProblem({ board: empty(9), toPlay: 'black', moves: [cand(4, 4, 0)], played: { x: 0, y: 0 }, now: 1 })!;
    expect(isCorrect(p, 4, 4)).toBe(true);
    expect(isCorrect(p, 0, 0)).toBe(false);
    expect(sameProblem(p, { board: empty(9), toPlay: 'black' })).toBe(true);
    expect(sameProblem(p, { board: empty(9), toPlay: 'white' })).toBe(false);
  });

  it('serves the least practised problem next and counts attempts', () => {
    const a = createProblem({ board: empty(9), toPlay: 'black', moves: [cand(4, 4, 0)], played: null, now: 1 })!;
    const b = createProblem({ board: empty(9), toPlay: 'white', moves: [cand(4, 4, 0)], played: null, now: 2 })!;
    const after = recordAttempt([a, b], a.id, true);
    expect(after[0]).toMatchObject({ attempts: 1, solved: 1 });
    expect(nextProblem(after)!.id).toBe(b.id);
  });
});

describe('saved games', () => {
  const game = (id: string, updatedAt: number): SavedGame => ({
    id,
    meta: { kind: 'free', size: 9, aiRank: '5k', humanColor: 'black', startedAt: Number(id), rankRecorded: false },
    sgf: '(;SZ[9])',
    result: null,
    moveCount: 0,
    updatedAt,
  });

  it('keeps one copy per game, the latest started first', () => {
    const list = upsertGame(upsertGame([game('1', 1)], game('2', 2)), game('1', 3));
    expect(list.map((g) => g.id)).toEqual(['2', '1']);
    expect(list[1]!.updatedAt).toBe(3);
    expect(removeGame(list, '1').map((g) => g.id)).toEqual(['2']);
  });

  it('drops stored entries that are not games', () => {
    expect(parseSavedGames([game('1', 1), { id: 3 }, null])).toHaveLength(1);
    expect(parseSavedGames('x')).toEqual([]);
  });
});

describe('preferences', () => {
  it('fills in defaults and keeps valid values', () => {
    expect(parsePreferences(null).confirmMoves).toBe(true);
    expect(parsePreferences({ confirmMoves: false, geminiApiKey: ' k ', geminiModel: '' })).toMatchObject({ confirmMoves: false, geminiApiKey: 'k', geminiModel: 'gemini-3.1-flash-lite-preview' });
  });
});

describe('sgfForPath', () => {
  it('writes the root setup and the moves up to the node', () => {
    const board = empty(9);
    const root = { id: 'r', parent: null, children: [], move: null, gameState: { board, currentPlayer: 'black', moveHistory: [], capturedBlack: 0, capturedWhite: 0, komi: 6.5 }, properties: { SZ: ['9'], KM: ['6.5'] } } as unknown as GameNode;
    const a = { id: 'a', parent: root, children: [], move: { x: 2, y: 3, player: 'black' }, gameState: root.gameState } as unknown as GameNode;
    const b = { id: 'b', parent: a, children: [], move: { x: -1, y: -1, player: 'white' }, gameState: root.gameState } as unknown as GameNode;
    expect(sgfForPath(b)).toBe('(;GM[1]FF[4]CA[UTF-8]SZ[9]KM[6.5];B[cd];W[])');
  });
});

describe('problem answers', () => {
  it('keeps at most five answers', () => {
    const many = Array.from({ length: 9 }, (_, i) => cand(i, 0, 0));
    expect(answersFrom(many)).toHaveLength(5);
  });
});
