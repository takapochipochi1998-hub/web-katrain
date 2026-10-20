import { describe, expect, it } from 'vitest';
import { classifyMove } from '../src/sensei/moveQuality';
import { outcomeFor, parseResult, resultFromScoreLead, resultLabel } from '../src/sensei/gameResult';
import {
  emptyRankBook,
  humanProfileFor,
  parseRankBook,
  rankAfter,
  rankLabel,
  recordResult,
  setRank,
} from '../src/sensei/rankLadder';

describe('classifyMove', () => {
  it('grades by points lost at the threshold edges', () => {
    expect(classifyMove(0)).toBe('best');
    expect(classifyMove(0.49)).toBe('best');
    expect(classifyMove(0.5)).toBe('good');
    expect(classifyMove(3)).toBe('inaccuracy');
    expect(classifyMove(6)).toBe('mistake');
    expect(classifyMove(10)).toBe('blunder');
  });

  it('treats a move better than the engine expected as best', () => {
    expect(classifyMove(-1.2)).toBe('best');
  });
});

describe('rank ladder', () => {
  it('steps one rank per result and stops at the ends', () => {
    expect(rankAfter('5k', 'win')).toBe('4k');
    expect(rankAfter('1k', 'win')).toBe('1d');
    expect(rankAfter('5k', 'loss')).toBe('6k');
    expect(rankAfter('5k', 'draw')).toBe('5k');
    expect(rankAfter('9d', 'win')).toBe('9d');
    expect(rankAfter('20k', 'loss')).toBe('20k');
  });

  it('keeps each board size apart and logs the change', () => {
    let book = setRank(emptyRankBook(), 9, '10k');
    book = recordResult(book, 9, 'win', 1000);
    expect(book[9].rank).toBe('9k');
    expect(book[9].history).toEqual([{ at: 1000, outcome: 'win', before: '10k', after: '9k' }]);
    expect(book[19].rank).toBeNull();
  });

  it('ignores a result for a board size with no rank set yet', () => {
    const book = emptyRankBook();
    expect(recordResult(book, 13, 'win', 1)).toBe(book);
  });

  it('labels ranks the Japanese way and names the human profile', () => {
    expect(rankLabel('5k')).toBe('5級');
    expect(rankLabel('1d')).toBe('初段');
    expect(rankLabel('3d')).toBe('3段');
    expect(humanProfileFor('1d')).toBe('rank_1d');
  });

  it('drops stored values that no longer make sense', () => {
    const book = parseRankBook({ 9: { rank: '5k', history: [{ at: 1, outcome: 'win', before: '6k', after: '5k' }, { bad: true }] }, 13: { rank: '30k' } });
    expect(book[9].rank).toBe('5k');
    expect(book[9].history).toHaveLength(1);
    expect(book[13].rank).toBeNull();
    expect(parseRankBook('garbage')).toEqual(emptyRankBook());
  });
});

describe('game results', () => {
  it('reads SGF results', () => {
    expect(parseResult('B+R')).toEqual({ winner: 'black', margin: 'resign' });
    expect(parseResult('W+3.5')).toEqual({ winner: 'white', margin: 3.5 });
    expect(parseResult('0')).toEqual({ winner: null, margin: null });
    expect(parseResult('')).toBeNull();
  });

  it('says who won from the player\'s side', () => {
    expect(outcomeFor('W+R', 'black')).toBe('loss');
    expect(outcomeFor('W+R', 'white')).toBe('win');
    expect(outcomeFor('0', 'black')).toBe('draw');
    expect(outcomeFor(null, 'black')).toBeNull();
  });

  it('labels results in Japanese', () => {
    expect(resultLabel('W+R')).toBe('白 中押し勝ち');
    expect(resultLabel('B+3.5')).toBe('黒 3.5目勝ち');
  });

  it('rounds a counted score onto the half point', () => {
    expect(resultFromScoreLead(3.2)).toBe('B+3.5');
    expect(resultFromScoreLead(-0.1)).toBe('W+0.5');
    expect(resultFromScoreLead(-7.9)).toBe('W+7.5');
  });
});
