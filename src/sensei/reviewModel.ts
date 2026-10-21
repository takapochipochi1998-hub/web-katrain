/**
 * What the review screen reads off the game tree. The game as played is the
 * first child at every step: a try-out move is added as a later child, so it
 * never displaces the real line.
 */
import type { GameNode, Player } from '../types';
import { computeNodePointsLost } from '../utils/nodeAnalysis';
import { classifyMove, type MoveQuality } from './moveQuality';

export function mainLine(root: GameNode): GameNode[] {
  const line: GameNode[] = [root];
  // The game ends where its result was recorded; anything tried after that is a try-out.
  for (let node = root.children[0]; node && !line[line.length - 1]!.endState; node = node.children[0]) line.push(node);
  return line;
}

/** Whether a node lies on the game as played: first children all the way, not past the end. */
export function isOnMainLine(node: GameNode): boolean {
  for (let n: GameNode = node; n.parent; n = n.parent) {
    if (n.parent.children[0] !== n || n.parent.endState) return false;
  }
  return true;
}

/** The last ancestor (or the node itself) that is part of the game as played. */
export function branchPoint(node: GameNode): GameNode {
  let candidate = node;
  for (let n: GameNode = node; n.parent; n = n.parent) {
    if (n.parent.children[0] !== n || n.parent.endState) candidate = n.parent;
  }
  return candidate;
}

export type MoveVerdict = {
  node: GameNode;
  moveNumber: number;
  player: Player;
  /** null until both this position and the one before it are analysed. */
  pointsLost: number | null;
  quality: MoveQuality | null;
};

/** `scale` stretches the grade thresholds for the player's level (see judgeScaleFor). */
export function judgeMove(node: GameNode, moveNumber: number, scale = 1): MoveVerdict | null {
  if (!node.move) return null;
  const pointsLost = node.move.x < 0 ? null : computeNodePointsLost(node);
  return {
    node,
    moveNumber,
    player: node.move.player,
    pointsLost,
    quality: pointsLost === null ? null : classifyMove(pointsLost, scale),
  };
}

export function judgeLine(line: readonly GameNode[], scale = 1): MoveVerdict[] {
  const verdicts: MoveVerdict[] = [];
  line.forEach((node, index) => {
    const verdict = judgeMove(node, index, scale);
    if (verdict) verdicts.push(verdict);
  });
  return verdicts;
}

export const isMistake = (v: MoveVerdict): boolean => v.quality === 'mistake' || v.quality === 'blunder';

/** Black's score lead after each move, or null where the position is not analysed yet. */
export function scoreSeries(line: readonly GameNode[]): Array<number | null> {
  return line.map((node) => {
    const lead = node.analysis?.rootScoreLead;
    return typeof lead === 'number' && Number.isFinite(lead) ? lead : null;
  });
}

/** Candidate letters A, B, C… for the engine's top moves. */
export const candidateLabel = (index: number): string => String(index + 1);

/**
 * One colour for every candidate, deeper the better: `t` runs from 0 (the best,
 * solid) to 1 (the last one shown, palest).
 */
export function candidateShade(t: number): { fill: string; text: string } {
  const k = 1 - Math.min(1, Math.max(0, t));
  // Mixed toward a very pale blue rather than made see-through, so grid lines stay hidden.
  const mix = (deep: number, pale: number) => Math.round(pale + (deep - pale) * k);
  return { fill: `rgb(${mix(30, 238)}, ${mix(76, 242)}, ${mix(196, 251)})`, text: k >= 0.45 ? '#ffffff' : '#1d3f94' };
}

/**
 * Each candidate's place on the shade scale: by rank, so lower places get paler,
 * but scaled by the loss, so a move that gives away almost nothing stays nearly
 * as deep as the best. Equal losses share a shade.
 */
export function shadeSteps(losses: readonly number[]): number[] {
  const n = losses.length;
  if (n <= 1) return losses.map(() => 0);
  return losses.map((loss, i) => {
    const first = losses.findIndex((l) => Math.abs(l - loss) < 0.05);
    const rank = (first === -1 ? i : first) / (n - 1);
    return rank * Math.min(1, 0.25 + Math.max(0, loss) / 3);
  });
}

