/**
 * The five grades AI Sensei gives a move, from the points it lost against the
 * engine's best. The base thresholds are for a 5-kyu player and are provisional;
 * weaker players get more lenient ones and stronger players stricter ones, the
 * way AI Sensei judges by level.
 */
import { RANKS, type Rank } from './rankLadder';

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const MOVE_QUALITY_LABEL: Record<MoveQuality, string> = {
  best: '最善手',
  good: '好手',
  inaccuracy: '凡手',
  mistake: '悪手',
  blunder: '敗着',
};

/** Points lost at or above which a move falls into the grade. */
const THRESHOLDS: ReadonlyArray<readonly [number, MoveQuality]> = [
  [10, 'blunder'],
  [6, 'mistake'],
  [3, 'inaccuracy'],
  [0.5, 'good'],
];

export function classifyMove(pointsLost: number, scale = 1): MoveQuality {
  for (const [min, quality] of THRESHOLDS) {
    if (pointsLost >= min * scale) return quality;
  }
  return 'best';
}

/** How far a rank stretches the 5-kyu thresholds: 3x at 30 kyu down to 0.3x at 9 dan. */
const STRICTNESS: ReadonlyArray<readonly [Rank, number]> = [
  ['30k', 3.0],
  ['20k', 2.0],
  ['10k', 1.4],
  ['5k', 1.0],
  ['1d', 0.7],
  ['5d', 0.45],
  ['9d', 0.3],
];

export function judgeScaleFor(rank: Rank): number {
  const at = RANKS.indexOf(rank);
  for (let i = 1; i < STRICTNESS.length; i++) {
    const [r0, s0] = STRICTNESS[i - 1]!;
    const [r1, s1] = STRICTNESS[i]!;
    const i0 = RANKS.indexOf(r0);
    const i1 = RANKS.indexOf(r1);
    if (at <= i1) return s0 + ((s1 - s0) * Math.max(0, at - i0)) / (i1 - i0);
  }
  return STRICTNESS[STRICTNESS.length - 1]![1];
}

/** The points lost at which each grade starts, for this scale, rounded for display. */
export function gradeThresholds(scale: number): Record<Exclude<MoveQuality, 'best'>, number> {
  const out = {} as Record<Exclude<MoveQuality, 'best'>, number>;
  for (const [min, quality] of THRESHOLDS) out[quality as Exclude<MoveQuality, 'best'>] = Math.round(min * scale * 10) / 10;
  return out;
}

/** Mistakes worth stopping at when stepping through a review. */
export function isReviewStop(quality: MoveQuality): boolean {
  return quality === 'mistake' || quality === 'blunder';
}
