import { describe, expect, it } from 'vitest';
import { classifyMove, gradeThresholds, judgeScaleFor } from '../src/sensei/moveQuality';
import { RANKS } from '../src/sensei/rankLadder';

describe('judging by level', () => {
  it('uses the base thresholds at 5 kyu and stretches them toward either end', () => {
    expect(judgeScaleFor('5k')).toBe(1);
    expect(judgeScaleFor('30k')).toBe(3);
    expect(judgeScaleFor('9d')).toBeCloseTo(0.3);
  });

  it('gets stricter with every step up the ladder', () => {
    const scales = RANKS.map(judgeScaleFor);
    for (let i = 1; i < scales.length; i++) expect(scales[i]!).toBeLessThanOrEqual(scales[i - 1]!);
  });

  it('calls the same loss a blunder for a dan player but not for a beginner', () => {
    expect(classifyMove(8, judgeScaleFor('3d'))).toBe('blunder');
    expect(classifyMove(8, judgeScaleFor('25k'))).toBe('inaccuracy');
    expect(gradeThresholds(1)).toEqual({ good: 0.5, inaccuracy: 3, mistake: 6, blunder: 10 });
  });
});
