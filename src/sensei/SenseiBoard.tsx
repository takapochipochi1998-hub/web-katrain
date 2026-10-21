import React, { memo, useId, useState } from 'react';
import { stoneSprites } from './stoneSprites';
import { useBoardPrefs } from './boardPrefs';
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
  /** A ring around the point, in this colour: the move actually played. */
  ring?: string;
};

type Props = {
  board: BoardState;
  lastMove?: { x: number; y: number } | null;
  markers?: BoardMarker[];
  /** A see-through stone: the move waiting for a second tap to confirm. */
  ghost?: { x: number; y: number; player: Player } | null;
  /**
   * While a finger (or button) is down, show a cross through the point under
   * it and a see-through stone of this colour; the move lands where it lifts.
   * The lines reach the board's edges, so they stay visible past the finger.
   */
  dragPlayer?: Player | null;
  /** Coordinates along the edges; phones leave them off to give the board room. */
  /** Defaults to the 設定 choice. */
  showCoords?: boolean;
  onTap?: (x: number, y: number) => void;
  disabled?: boolean;
  /** Who the engine expects to own each point, -1 (white) to 1 (black); drawn as squares. */
  territory?: number[][] | null;
};

const STAR_POINTS: Record<number, number[]> = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};

const CELL = 40;
const R = CELL * 0.48;
const LINE = '#3a2812';

/** Board in Japanese coordinates: 1… across the top, 一… down the side. */
export const SenseiBoard: React.FC<Props> = ({ board, lastMove, markers = [], ghost, dragPlayer, showCoords: showCoordsProp, onTap, disabled, territory }) => {
  const prefs = useBoardPrefs();
  const showCoords = showCoordsProp ?? prefs.showCoords;
  const uid = useId().replace(/:/g, '');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const size = board.length;
  const margin = showCoords ? 32 : CELL * 0.62;
  const total = CELL * (size - 1) + margin * 2;
  const at = (i: number) => margin + i * CELL;
  const stars = STAR_POINTS[size] ?? [];

  const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = total / rect.width;
    const x = Math.round(((e.clientX - rect.left) * scale - margin) / CELL);
    const y = Math.round(((e.clientY - rect.top) * scale - margin) / CELL);
    return x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null;
  };

  const guiding = !disabled && !!dragPlayer;
  const shownGhost = drag && dragPlayer && !board[drag.y]?.[drag.x] ? { ...drag, player: dragPlayer } : ghost;

  return (
    <div className="sensei-board" style={{ aspectRatio: '1 / 1' }}>
      <WoodLayer />
      <svg
        viewBox={`0 0 ${total} ${total}`}
        className="sensei-board-svg"
        role="img"
        aria-label="碁盤"
        onPointerDown={(e) => {
          if (!guiding) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setDrag(pointFromEvent(e));
        }}
        onPointerMove={(e) => { if (drag || (guiding && e.buttons)) setDrag(pointFromEvent(e)); }}
        onPointerCancel={() => setDrag(null)}
        onPointerUp={(e) => {
          const p = pointFromEvent(e);
          setDrag(null);
          if (disabled || !onTap || !p) return;
          onTap(p.x, p.y);
        }}
      >
        <defs>
          <radialGradient id={`${uid}-black`} cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#5a5a5c" />
            <stop offset="35%" stopColor="#262628" />
            <stop offset="80%" stopColor="#0b0b0c" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <radialGradient id={`${uid}-white`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f1eee7" />
            <stop offset="92%" stopColor="#d9d3c8" />
            <stop offset="100%" stopColor="#c4bdb0" />
          </radialGradient>
          <radialGradient id={`${uid}-shine`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#000" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g stroke={LINE} strokeLinecap="square">
          {Array.from({ length: size }, (_, i) => {
            const edge = i === 0 || i === size - 1;
            return (
              <g key={i} strokeWidth={edge ? 1.8 : 0.95}>
                <line x1={at(0)} y1={at(i)} x2={at(size - 1)} y2={at(i)} />
                <line x1={at(i)} y1={at(0)} x2={at(i)} y2={at(size - 1)} />
              </g>
            );
          })}
        </g>
        {showCoords && (
          <g fill={LINE} fontSize={12} fontWeight={600} textAnchor="middle" opacity={0.7}>
            {Array.from({ length: size }, (_, i) => (
              <g key={i}>
                <text x={at(i)} y={margin / 2 + 4}>{i + 1}</text>
                <text x={margin / 2 - 2} y={at(i) + 4} fontSize={i >= 9 ? 9 : 12}>{kanjiRow(i)}</text>
              </g>
            ))}
          </g>
        )}
        {stars.flatMap((sy) => stars.map((sx) => (
          <circle key={`${sx}-${sy}`} cx={at(sx)} cy={at(sy)} r={3.6} fill={LINE} />
        )))}

        {drag && guiding && (
          <g pointerEvents="none" stroke="#d2333f" strokeWidth={1.6} opacity={0.85}>
            <line x1={at(0)} y1={at(drag.y)} x2={at(size - 1)} y2={at(drag.y)} />
            <line x1={at(drag.x)} y1={at(0)} x2={at(drag.x)} y2={at(size - 1)} />
          </g>
        )}

        {territory && (
          <g pointerEvents="none">
            {/* Each side's expected area, whole cells tinted by how sure the engine is. */}
            {territory.flatMap((row, y) => row.map((v, x) => {
              const sure = Math.abs(v);
              if (sure < 0.15) return null;
              const black = v > 0;
              return (
                <rect key={`t${x}-${y}`} x={at(x) - CELL / 2} y={at(y) - CELL / 2} width={CELL} height={CELL}
                  fill={black ? '#000' : '#fff'} opacity={black ? 0.12 + sure * 0.45 : 0.25 + sure * 0.6} />
              );
            }))}
          </g>
        )}
        {board.flatMap((row, y) => row.map((s, x) => s && (
          <Stone key={`s${x}-${y}`} uid={uid} cx={at(x)} cy={at(y)} player={s} variant={(x * 7 + y * 3) % 6} />
        )))}
        {shownGhost && !board[shownGhost.y]?.[shownGhost.x] && (
          <g opacity={0.55} pointerEvents="none">
            <Stone uid={uid} cx={at(shownGhost.x)} cy={at(shownGhost.y)} player={shownGhost.player} variant={0} flat />
          </g>
        )}
        {territory && (
          <g pointerEvents="none">
            {/* Dead stones: a square of the owner's colour on the stone. */}
            {territory.flatMap((row, y) => row.map((v, x) => {
              const stone = board[y]?.[x];
              const owner = v > 0 ? 'black' : 'white';
              if (!stone || stone === owner || Math.abs(v) < 0.4) return null;
              const side = CELL * 0.36;
              return (
                <rect key={`d${x}-${y}`} x={at(x) - side / 2} y={at(y) - side / 2} width={side} height={side}
                  fill={owner === 'black' ? '#141414' : '#f7f6f2'} stroke={owner === 'black' ? '#f7f6f2' : '#141414'} strokeWidth={0.8} />
              );
            }))}
          </g>
        )}
        {lastMove && board[lastMove.y]?.[lastMove.x] && (
          <circle
            cx={at(lastMove.x)}
            cy={at(lastMove.y)}
            r={CELL * 0.17}
            fill="none"
            stroke={board[lastMove.y]![lastMove.x] === 'black' ? '#f4f1ea' : '#1a1a1a'}
            strokeWidth={2.4}
          />
        )}
        {markers.map((m) => {
          const onStone = board[m.y]?.[m.x];
          const color = m.textColor ?? (onStone === 'black' ? '#fff' : '#111');
          return (
            <g key={`m${m.x}-${m.y}`} pointerEvents="none">
              {m.fill && <circle cx={at(m.x)} cy={at(m.y)} r={CELL * 0.4} fill={m.fill} stroke="#fff" strokeWidth={1.5} />}
              {m.ring && <circle cx={at(m.x)} cy={at(m.y)} r={CELL * 0.47} fill="none" stroke={m.ring} strokeWidth={3.2} />}
              {m.label && (
                <text x={at(m.x)} y={at(m.y) + 6} textAnchor="middle" fontSize={m.label.length > 2 ? 13 : 17} fontWeight={800} fill={color}>
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/** One stone: a soft shadow, the body, a highlight, and shell lines on white. */
const Stone: React.FC<{ uid: string; cx: number; cy: number; player: Player; variant: number; flat?: boolean }> = ({ uid, cx, cy, player, variant, flat }) => {
  const sprites = stoneSprites();
  if (sprites) {
    const set = sprites[player];
    return (
      <g pointerEvents="none">
        {!flat && <circle cx={cx + R * 0.1} cy={cy + R * 0.16} r={R * 1.08} fill={`url(#${uid}-shadow)`} />}
        {/* A plain body under the picture, so the stone shows even before the image is decoded. */}
        <circle cx={cx} cy={cy} r={R * 0.98} fill={`url(#${uid}-${player})`} />
        <image href={set[variant % set.length]} x={cx - R} y={cy - R} width={R * 2} height={R * 2} />
      </g>
    );
  }
  return <PlainStone uid={uid} cx={cx} cy={cy} player={player} variant={variant} flat={flat} />;
};

/** Where no canvas paints sprites: gradients only. */
const PlainStone: React.FC<{ uid: string; cx: number; cy: number; player: Player; variant: number; flat?: boolean }> = ({ uid, cx, cy, player, variant, flat }) => (
  <g pointerEvents="none">
    {!flat && <circle cx={cx + R * 0.1} cy={cy + R * 0.16} r={R * 1.08} fill={`url(#${uid}-shadow)`} />}
    <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-${player})`} />
    {player === 'white' && <ShellLines cx={cx} cy={cy} angle={[-18, 8, 27][variant % 3] ?? 0} />}
    <ellipse cx={cx - R * 0.32} cy={cy - R * 0.38} rx={R * 0.42} ry={R * 0.26} fill={`url(#${uid}-shine)`} opacity={player === 'black' ? 0.5 : 0.8} transform={`rotate(-30 ${cx - R * 0.32} ${cy - R * 0.38})`} />
  </g>
);

/** Clamshell stones: faint, slightly uneven growth lines across the face. */
const SHELL_OFFSETS = [-0.62, -0.4, -0.2, 0.02, 0.22, 0.43, 0.63];
const ShellLines: React.FC<{ cx: number; cy: number; angle: number }> = ({ cx, cy, angle }) => (
  <g transform={`rotate(${angle} ${cx} ${cy})`} stroke="#b4ac9d" strokeWidth={0.5} strokeOpacity={0.5}>
    {SHELL_OFFSETS.map((o) => {
      const d = o * R;
      const half = Math.sqrt(R * R - d * d) * 0.9;
      return <line key={o} x1={cx - half} y1={cy + d} x2={cx + half} y2={cy + d} />;
    })}
  </g>
);

/**
 * The kaya board: straight grain from layered noise. Drawn once and kept apart
 * from the stones so moves do not repaint the (comparatively costly) filter.
 */
const WoodLayer = memo(function WoodLayer() {
  const uid = useId().replace(/:/g, '');
  return (
    <svg className="sensei-board-wood" viewBox="0 0 400 400" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="1" y2="1">
          {/* Kaya: a bright golden yellow, warmer toward the bottom right. */}
          <stop offset="0%" stopColor="#f3c27a" />
          <stop offset="50%" stopColor="#e6ab60" />
          <stop offset="100%" stopColor="#dc9f52" />
        </linearGradient>
        <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.12 0.004" numOctaves="3" seed="11" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.25  0 0 0 0 0.08  0 0 0 1.6 -0.7" />
        </filter>
        <filter id={`${uid}-fibre`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.02" numOctaves="2" seed="4" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.3  0 0 0 0 0.1  0 0 0 0.9 -0.42" />
        </filter>
      </defs>
      <rect width="400" height="400" fill={`url(#${uid}-base)`} />
      {/* Fine, low-contrast grain: kaya is even, not streaky. */}
      <rect width="400" height="400" filter={`url(#${uid}-grain)`} opacity={0.28} />
      <rect width="400" height="400" filter={`url(#${uid}-fibre)`} opacity={0.22} />
    </svg>
  );
});
