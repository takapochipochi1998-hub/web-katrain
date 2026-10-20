import React from 'react';
import type { BoardState } from '../types';

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
  onTap?: (x: number, y: number) => void;
  /** Hovered point is reported so a candidate can show its loss. */
  onHover?: (point: { x: number; y: number } | null) => void;
  disabled?: boolean;
};

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];

const STAR_POINTS: Record<number, number[]> = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};

const CELL = 40;
const MARGIN = 34;

/** Board in Japanese coordinates: 1… across the top, 一… down the side. */
export const SenseiBoard: React.FC<Props> = ({ board, lastMove, markers = [], onTap, onHover, disabled }) => {
  const size = board.length;
  const span = CELL * (size - 1);
  const total = span + MARGIN * 2;
  const at = (i: number) => MARGIN + i * CELL;
  const stars = STAR_POINTS[size] ?? [];

  const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = total / rect.width;
    const x = Math.round(((e.clientX - rect.left) * scale - MARGIN) / CELL);
    const y = Math.round(((e.clientY - rect.top) * scale - MARGIN) / CELL);
    return x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null;
  };

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
      onPointerMove={onHover ? (e) => onHover(pointFromEvent(e)) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <defs>
        <radialGradient id="sb-black" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="100%" stopColor="#0b0b0b" />
        </radialGradient>
        <radialGradient id="sb-white" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cfcfcf" />
        </radialGradient>
      </defs>
      <rect width={total} height={total} fill="#dcb46c" />
      {Array.from({ length: size }, (_, i) => (
        <g key={i}>
          <line x1={at(0)} y1={at(i)} x2={at(size - 1)} y2={at(i)} stroke="#3b2a14" strokeWidth={1} />
          <line x1={at(i)} y1={at(0)} x2={at(i)} y2={at(size - 1)} stroke="#3b2a14" strokeWidth={1} />
          <text x={at(i)} y={MARGIN / 2 + 5} textAnchor="middle" fontSize={14} fill="#3b2a14">{i + 1}</text>
          <text x={MARGIN / 2} y={at(i) + 5} textAnchor="middle" fontSize={size > 9 && i >= 9 ? 9 : 13} fill="#3b2a14">{KANJI[i]}</text>
        </g>
      ))}
      {stars.flatMap((sy) => stars.map((sx) => (
        <circle key={`${sx}-${sy}`} cx={at(sx)} cy={at(sy)} r={3.5} fill="#3b2a14" />
      )))}
      {board.flatMap((row, y) => row.map((stone, x) => stone && (
        <circle
          key={`s${x}-${y}`}
          cx={at(x)}
          cy={at(y)}
          r={CELL * 0.47}
          fill={stone === 'black' ? 'url(#sb-black)' : 'url(#sb-white)'}
          stroke={stone === 'white' ? '#8a8a8a' : 'none'}
          strokeWidth={0.6}
        />
      )))}
      {lastMove && board[lastMove.y]?.[lastMove.x] && (
        <circle
          cx={at(lastMove.x)}
          cy={at(lastMove.y)}
          r={CELL * 0.22}
          fill="none"
          stroke={board[lastMove.y]![lastMove.x] === 'black' ? '#fff' : '#000'}
          strokeWidth={2.5}
        />
      )}
      {markers.map((m) => {
        const stone = board[m.y]?.[m.x];
        const color = m.textColor ?? (stone === 'black' ? '#fff' : '#111');
        return (
          <g key={`m${m.x}-${m.y}`} pointerEvents="none">
            {m.fill && <circle cx={at(m.x)} cy={at(m.y)} r={CELL * 0.42} fill={m.fill} opacity={0.92} />}
            {m.label && (
              <text x={at(m.x)} y={at(m.y) + 6} textAnchor="middle" fontSize={m.label.length > 2 ? 13 : 18} fontWeight={700} fill={color}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
