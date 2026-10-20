/**
 * Reading and writing game results as SGF RE values ("B+R", "W+3.5", "0").
 */
import type { Player } from '../types';
import type { GameOutcome } from './rankLadder';

export type ParsedResult = { winner: Player | null; margin: 'resign' | 'time' | number | null };

export function parseResult(endState: string | null | undefined): ParsedResult | null {
  if (!endState) return null;
  const value = endState.trim();
  if (value === '0' || /^(draw|jigo|void)$/i.test(value)) return { winner: null, margin: null };
  const m = /^([BW])\+(.*)$/i.exec(value);
  if (!m) return null;
  const winner: Player = m[1]!.toUpperCase() === 'B' ? 'black' : 'white';
  const rest = m[2]!.trim();
  if (/^r(esign)?$/i.test(rest)) return { winner, margin: 'resign' };
  if (/^t(ime)?$/i.test(rest)) return { winner, margin: 'time' };
  const points = Number.parseFloat(rest);
  return { winner, margin: Number.isFinite(points) ? points : null };
}

export function outcomeFor(endState: string | null | undefined, player: Player): GameOutcome | null {
  const result = parseResult(endState);
  if (!result) return null;
  if (!result.winner) return 'draw';
  return result.winner === player ? 'win' : 'loss';
}

/** "白 中押し勝ち", "黒 3.5目勝ち", "持碁". */
export function resultLabel(endState: string | null | undefined): string {
  const result = parseResult(endState);
  if (!result) return '';
  if (!result.winner) return '持碁';
  const side = result.winner === 'black' ? '黒' : '白';
  if (result.margin === 'resign') return `${side} 中押し勝ち`;
  if (result.margin === 'time') return `${side} 時間勝ち`;
  if (typeof result.margin === 'number') return `${side} ${result.margin}目勝ち`;
  return `${side} 勝ち`;
}

/**
 * Turn the engine's final score lead (Black's view) into a result.
 * Komi ends in .5, so a counted game cannot tie; round onto the half point.
 */
export function resultFromScoreLead(scoreLead: number): string {
  const margin = Math.max(0.5, Math.round(Math.abs(scoreLead) - 0.5) + 0.5);
  return `${scoreLead >= 0 ? 'B' : 'W'}+${margin}`;
}
