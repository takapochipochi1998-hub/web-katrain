import React from 'react';
import type { MoveVerdict } from './reviewModel';

type Props = {
  /** Black's lead after each move of the game, index = move number. */
  series: ReadonlyArray<number | null>;
  verdicts: readonly MoveVerdict[];
  currentMove: number;
  onSelect: (moveNumber: number) => void;
};

const W = 320;
const H = 120;
const PAD = 12; // room for the mistake dots above and below
const CLAMP = 20; // points; a runaway lead would flatten the rest

/**
 * Score lead over the game, Black above the line and White below, with a dot
 * for every mistake: White's along the top, Black's along the bottom.
 */
export const ScoreGraph: React.FC<Props> = ({ series, verdicts, currentMove, onSelect }) => {
  const last = Math.max(1, series.length - 1);
  const x = (i: number) => (i / last) * W;
  const mid = H / 2;
  const y = (lead: number) => mid - (Math.max(-CLAMP, Math.min(CLAMP, lead)) / CLAMP) * (mid - PAD);

  const points = series.map((lead, i) => (lead === null ? null : `${x(i)},${y(lead)}`)).filter(Boolean);
  const area = points.length > 1 ? `M0,${mid} L${points.join(' L')} L${x(series.length - 1)},${mid} Z` : '';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="sensei-graph"
      role="img"
      aria-label="形勢グラフ"
      // A click, not pointerup: on a phone a tap that drifts becomes a scroll and never lifts here.
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSelect(Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * last))));
      }}
    >
      <rect width={W} height={H} fill="var(--s-surface-2)" />
      <rect width={W} height={mid} fill="var(--s-surface)" />
      {area && <path d={area} fill="var(--s-text)" opacity={0.78} />}
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="var(--s-border)" strokeWidth={1} />
      <text x={6} y={14} fontSize={10} fill="var(--s-muted)">黒リード</text>
      <text x={6} y={H - 16} fontSize={10} fill="var(--s-muted)">白リード</text>
      {verdicts.filter((v) => v.quality === 'mistake' || v.quality === 'blunder').map((v) => (
        <circle
          key={v.moveNumber}
          cx={x(v.moveNumber)}
          cy={v.player === 'white' ? 6 : H - 6}
          r={4}
          fill={v.quality === 'blunder' ? '#d7263d' : '#f08a4b'}
          stroke="#fff"
          strokeWidth={0.8}
        />
      ))}
      <line x1={x(currentMove)} y1={0} x2={x(currentMove)} y2={H} stroke="var(--s-accent)" strokeWidth={1.6} />
    </svg>
  );
};
