import { describe, expect, it } from 'vitest';
import { candidateShade, shadeSteps } from '../src/sensei/reviewModel';

describe('candidate shading', () => {
  it('runs from the best (0) to the palest (1) when the last loses a lot', () => {
    const steps = shadeSteps([0, 0.5, 1, 2, 6]);
    expect(steps[0]).toBe(0);
    expect(steps[4]).toBe(1);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  it('keeps moves that lose almost nothing deep, and equal losses equal', () => {
    const steps = shadeSteps([0, 0.1, 0.1]);
    expect(steps[1]).toBe(steps[2]);
    expect(steps[1]!).toBeLessThan(0.2);
  });

  it('uses white numbers on deep shades and dark numbers on pale ones', () => {
    expect(candidateShade(0).text).toBe('#ffffff');
    expect(candidateShade(1).text).not.toBe('#ffffff');
  });
});
