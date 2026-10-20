import React, { useId } from 'react';
import type { BoardState, Player } from '../types';
import { kanjiRow } from './coords';

export type BoardMarker = {
  x: number;
  y: number;
  /** Text drawn on the point: a candidate letter, a move number, a loss. */
  label?: string;
  /** Fill of the disc behind the label; omit for a bare label. */
  fill?: string;
  textColor?: string;
};

type Props = {
  board: BoardState;
  lastMove?: { x: number; y: number } | null;
  markers?: BoardMarker[];
  /** A see-through stone: the move waiting for a second tap to confirm. */
  ghost?: { x: number; y: number; player: Player } | null;
  onTap?: (x: number, y: number) => void;
  disabled?: boolean;
};

const STAR_POINTS: Record<number, number[]> = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};

const CELL = 40;
const MARGIN = 32;

/** Board in Japanese coordinates: 1… across the top, 一… down the side. */
export const SenseiBoard: React.FC<Props> = ({ board, lastMove, markers = [], ghost, onTap, disabled }) => {
  const uid = useId().replace(/:/g, '');
  const size = board.length;
  const span = CELL * (size - 1);
  const total = span + MARGIN * 2;
  const at = (i: number) => MARGIN + i * CELL;
  const stars = STAR_POINTS[size] ?? [];
  const r = CELL * 0.48;

  const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = total / rect.width;
    const x = Math.round(((e.clientX - rect.left) * scale - MARGIN) / CELL);
    const y = Math.round(((e.clientY - rect.top) * scale - MARGIN) / CELL);
    return x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null;
  };

  const stone = (x: number, y: number, player: Player, opacity = 1, key?: string) => (
    <circle
      key={key}
      cx={at(x)}
      cy={at(y)}
      r={r}
      fill={`url(#${uid}-${player})`}
      filter={opacity === 1 ? `url(#${uid}-shadow)` : undefined}
      opacity={opacity}
    />
  );

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className="sensei-board"
      role="img"
      aria-label="碁盤"
      onPointerUp={(e) => {
        if (disabled || !onTap) return;
        const p = pointFromEvent(e);
        if (p) onTap(p.x, p.y);
      }}
    >
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecc987" />
          <stop offset="55%" stopColor="#dfb36a" />
          <stop offset="100%" stopColor="#d4a35a" />
        </linearGradient>
        <radialGradient id={`${uid}-black`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#6a6a6a" />
          <stop offset="45%" stopColor="#1c1c1c" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <radialGradient id={`${uid}-white`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#ebe8e2" />
          <stop offset="100%" stopColor="#c9c5bd" />
        </radialGradient>
        <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.2" dy="1.8" stdDeviation="1.4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect width={total} height={total} fill={`url(#${uid}-wood)`} />
      <g stroke="#5a4220" strokeWidth={1} strokeLinecap="square">
        {Array.from({ length: size }, (_, i) => (
          <g key={i}>
            <line x1={at(0)} y1={at(i)} x2={at(size - 1)} y2={at(i)} strokeWidth={i === 0 || i === size - 1 ? 1.8 : 1} />
            <line x1={at(i)} y1={at(0)} x2={at(i)} y2={at(size - 1)} strokeWidth={i === 0 || i === size - 1 ? 1.8 : 1} />
          </g>
        ))}
      </g>
      <g fill="#5a4220" fontSize={12} fontWeight={600} textAnchor="middle" opacity={0.75}>
        {Array.from({ length: size }, (_, i) => (
          <g key={i}>
            <text x={at(i)} y={MARGIN / 2 + 4}>{i + 1}</text>
            <text x={MARGIN / 2 - 2} y={at(i) + 4} fontSize={i >= 9 ? 9 : 12}>{kanjiRow(i)}</text>
          </g>
        ))}
      </g>
      {stars.flatMap((sy) => stars.map((sx) => (
        <circle key={`${sx}-${sy}`} cx={at(sx)} cy={at(sy)} r={3.6} fill="#5a4220" />
      )))}
      {board.flatMap((row, y) => row.map((s, x) => s && stone(x, y, s, 1, `s${x}-${y}`)))}
      {ghost && !board[ghost.y]?.[ghost.x] && stone(ghost.x, ghost.y, ghost.player, 0.55)}
      {lastMove && board[lastMove.y]?.[lastMove.x] && (
        <circle
          cx={at(lastMove.x)}
          cy={at(lastMove.y)}
          r={CELL * 0.18}
          fill="none"
          stroke={board[lastMove.y]![lastMove.x] === 'black' ? '#fff' : '#111'}
          strokeWidth={2.4}
        />
      )}
      {markers.map((m) => {
        const onStone = board[m.y]?.[m.x];
        const color = m.textColor ?? (onStone === 'black' ? '#fff' : '#111');
        return (
          <g key={`m${m.x}-${m.y}`} pointerEvents="none">
            {m.fill && <circle cx={at(m.x)} cy={at(m.y)} r={CELL * 0.4} fill={m.fill} stroke="#fff" strokeWidth={1.5} />}
            {m.label && (
              <text x={at(m.x)} y={at(m.y) + 6} textAnchor="middle" fontSize={m.label.length > 2 ? 13 : 17} fontWeight={800} fill={color}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
