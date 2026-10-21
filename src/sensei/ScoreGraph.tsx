import React, { useRef } from 'react';
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
/** The 10-point lines; the scale never shrinks below them, so a close game still reads as close. */
const GUIDE = 10;

/**
 * Score lead over the game, Black above the line and White below, with a dot
 * for every mistake: White's along the top, Black's along the bottom.
 */
export const ScoreGraph: React.FC<Props> = ({ series, verdicts, currentMove, onSelect }) => {
  const last = Math.max(1, series.length - 1);
  const x = (i: number) => (i / last) * W;
  const mid = H / 2;
  // Relative scale: the widest lead of this game fills the height, with a little headroom.
  const widest = Math.max(GUIDE, ...series.map((v) => (v === null ? 0 : Math.abs(v))));
  const span = widest * 1.1;
  const y = (lead: number) => mid - (lead / span) * (mid - PAD);

  const points = series.map((lead, i) => (lead === null ? null : `${x(i)},${y(lead)}`)).filter(Boolean);
  const area = points.length > 1 ? `M0,${mid} L${points.join(' L')} L${x(series.length - 1)},${mid} Z` : '';

  const lastPicked = useRef<number | null>(null);
  const pick = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const n = Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * last)));
    if (n === lastPicked.current && e.type !== 'pointerdown') return;
    lastPicked.current = n;
    onSelect(n);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="sensei-graph"
      role="img"
      aria-label="形勢グラフ"
      // Press and slide sideways: the move follows the finger. Vertical swipes still scroll the page (touch-action: pan-y).
      onPointerDown={(e) => {
        // Move first: on a phone a quick tap can lift before capture is set, and
        // setPointerCapture then throws, which used to swallow the tap.
        pick(e);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the tap still counted */ }
      }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e); }}
      // A plain tap as a backstop, should the browser not deliver the pointer events.
      onClick={(e) => pick(e)}
    >
      <rect width={W} height={H} fill="var(--s-surface-2)" />
      <rect width={W} height={mid} fill="var(--s-surface)" />
      {area && <path d={area} fill="var(--s-text)" opacity={0.78} />}
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="var(--s-border)" strokeWidth={1} />
      {[GUIDE, -GUIDE].map((g) => (
        <g key={g}>
          <line x1={0} y1={y(g)} x2={W} y2={y(g)} stroke="var(--s-muted)" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
          <text x={W - 4} y={y(g) + (g > 0 ? -3 : 10)} fontSize={9} textAnchor="end" fill="var(--s-text)" stroke="var(--s-surface)" strokeWidth={3} paintOrder="stroke">{g > 0 ? '黒+10目' : '白+10目'}</text>
        </g>
      ))}
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
