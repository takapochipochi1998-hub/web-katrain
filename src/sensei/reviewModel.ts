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
  for (let node = root.children[0]; node; node = node.children[0]) line.push(node);
  return line;
}

export function isOnMainLine(node: GameNode): boolean {
  for (let n: GameNode = node; n.parent; n = n.parent) {
    if (n.parent.children[0] !== n) return false;
  }
  return true;
}

/** The last ancestor (or the node itself) that is part of the game as played. */
export function branchPoint(node: GameNode): GameNode {
  let candidate = node;
  for (let n: GameNode = node; n.parent; n = n.parent) {
    if (n.parent.children[0] !== n) candidate = n.parent;
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

export function judgeMove(node: GameNode, moveNumber: number): MoveVerdict | null {
  if (!node.move) return null;
  const pointsLost = node.move.x < 0 ? null : computeNodePointsLost(node);
  return {
    node,
    moveNumber,
    player: node.move.player,
    pointsLost,
    quality: pointsLost === null ? null : classifyMove(pointsLost),
  };
}

export function judgeLine(line: readonly GameNode[]): MoveVerdict[] {
  const verdicts: MoveVerdict[] = [];
  line.forEach((node, index) => {
    const verdict = judgeMove(node, index);
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

/** Points lost at which a candidate is drawn at its palest. */
const PALEST_AT = 5;

/**
 * One colour for every candidate, deeper the better: the best move is solid,
 * and the more a move gives away the paler it gets.
 */
export function candidateShade(pointsLost: number): { fill: string; text: string; alpha: number } {
  const t = Math.min(1, Math.max(0, pointsLost) / PALEST_AT);
  const alpha = Math.round((1 - 0.78 * t) * 100) / 100;
  // Mixed toward a pale blue rather than made see-through, so grid lines stay hidden behind the number.
  const mix = (deep: number, pale: number) => Math.round(pale + (deep - pale) * alpha);
  return { fill: `rgb(${mix(36, 226)}, ${mix(84, 233)}, ${mix(200, 248)})`, text: alpha >= 0.5 ? '#ffffff' : '#173a8f', alpha };
}
