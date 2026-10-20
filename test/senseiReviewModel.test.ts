import { describe, expect, it } from 'vitest';
import type { GameNode, Player } from '../src/types';
import { branchPoint, isOnMainLine, judgeLine, judgeMove, mainLine, scoreSeries } from '../src/sensei/reviewModel';

const node = (parent: GameNode | null, move: { x: number; y: number; player: Player } | null, scoreLead?: number): GameNode => {
  const n = {
    id: Math.random().toString(36),
    parent,
    children: [],
    move,
    gameState: {} as GameNode['gameState'],
    analysis: scoreLead === undefined ? undefined : { rootWinRate: 0.5, rootScoreLead: scoreLead, moves: [], territory: [] },
  } as GameNode;
  parent?.children.push(n);
  return n;
};

describe('review model', () => {
  // root -> B(0,0) -> W(1,1) -> B(2,2); a try-out W(3,3) hangs off the first move.
  const root = node(null, null, 0.5);
  const b1 = node(root, { x: 0, y: 0, player: 'black' }, 1);
  const w2 = node(b1, { x: 1, y: 1, player: 'white' }, 8);
  const b3 = node(w2, { x: 2, y: 2, player: 'black' }, 7.5);
  const trial = node(b1, { x: 3, y: 3, player: 'white' });
  const trialNext = node(trial, { x: 4, y: 4, player: 'black' });

  it('follows the first child as the game that was played', () => {
    expect(mainLine(root)).toEqual([root, b1, w2, b3]);
    expect(isOnMainLine(b3)).toBe(true);
    expect(isOnMainLine(trialNext)).toBe(false);
  });

  it('finds where a try-out left the game', () => {
    expect(branchPoint(trialNext)).toBe(b1);
    expect(branchPoint(b3)).toBe(b3);
  });

  it('grades each move from the score before and after it', () => {
    const verdicts = judgeLine(mainLine(root));
    expect(verdicts.map((v) => v.moveNumber)).toEqual([1, 2, 3]);
    // White let Black's lead grow from 1 to 8: a 7-point mistake.
    expect(verdicts[1]).toMatchObject({ player: 'white', pointsLost: 7, quality: 'mistake' });
    expect(verdicts[2]).toMatchObject({ player: 'black', pointsLost: 0.5, quality: 'good' });
  });

  it('keeps an unanalysed move apart from a perfect one', () => {
    expect(judgeMove(trial, 2)).toMatchObject({ pointsLost: null, quality: null });
    expect(scoreSeries([root, trial])).toEqual([0.5, null]);
  });
});
