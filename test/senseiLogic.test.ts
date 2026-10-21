import { describe, expect, it } from 'vitest';
import { classifyMove } from '../src/sensei/moveQuality';
import { outcomeFor, parseResult, resultFromScoreLead, resultLabel } from '../src/sensei/gameResult';
import {
  emptyRankBook,
  humanProfileFor,
  humanWeaknessFor,
  parseRankBook,
  nextRating,
  rankForRating,
  ratingForRank,
  ratingOf,
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
  it('maps ratings onto ranks, 100 points a rank, clamped at the ends', () => {
    expect(ratingForRank('30k')).toBe(1000);
    expect(ratingForRank('10k')).toBe(3000);
    expect(ratingForRank('1d')).toBe(4000);
    expect(rankForRating(3049)).toBe('10k');
    expect(rankForRating(3051)).toBe('9k');
    expect(rankForRating(-500)).toBe('30k');
    expect(rankForRating(99999)).toBe('9d');
  });

  it('moves the rating the Elo way: more for an upset, more while provisional', () => {
    expect(nextRating(3000, '10k', 'win', 0)).toBe(3020);
    expect(nextRating(3000, '10k', 'win', 20)).toBe(3012);
    expect(nextRating(3000, '10k', 'loss', 20)).toBe(2988);
    expect(nextRating(3000, '10k', 'draw', 20)).toBe(3000);
    expect(nextRating(3000, '8k', 'win', 20)).toBeGreaterThan(3012);
  });

  it('keeps each board size apart and logs the change', () => {
    let book = setRank(emptyRankBook(), 9, '10k', 1);
    book = recordResult(book, 9, 'win', 1000, '10k');
    expect(book[9].rating).toBe(3020);
    expect(book[9].rank).toBe('10k');
    expect(book[9].history).toEqual([{ at: 1000, outcome: 'win', before: '10k', after: '10k', ratingBefore: 3000, ratingAfter: 3020, opponent: '10k' }]);
    expect(book[19].rank).toBeNull();
  });

  it('reads an old rank-only book as the rating of that rank', () => {
    expect(ratingOf({ rank: '5k', history: [] })).toBe(3500);
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
    expect(humanProfileFor('25k')).toBe('rank_20k');
    expect(humanWeaknessFor('20k')).toBe(0);
    expect(humanWeaknessFor('25k')).toBe(0.5);
    expect(humanWeaknessFor('30k')).toBe(1);
  });

  it('drops stored values that no longer make sense', () => {
    const book = parseRankBook({ 9: { rank: '5k', history: [{ at: 1, outcome: 'win', before: '6k', after: '5k' }, { bad: true }] }, 13: { rank: '31k' } });
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
