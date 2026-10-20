/**
 * The five grades AI Sensei gives a move, from the points it lost against the
 * engine's best. Thresholds follow docs/requirements.md and are provisional.
 */
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

export function classifyMove(pointsLost: number): MoveQuality {
  for (const [min, quality] of THRESHOLDS) {
    if (pointsLost >= min) return quality;
  }
  return 'best';
}

/** Mistakes worth stopping at when stepping through a review. */
export function isReviewStop(quality: MoveQuality): boolean {
  return quality === 'mistake' || quality === 'blunder';
}
