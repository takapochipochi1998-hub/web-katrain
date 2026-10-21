import React, { useMemo } from 'react';
import type { BoardState } from '../types';
import { applyCapturesInPlace } from '../utils/gameLogic';
import { parseSgf } from '../utils/sgf';

/** The final position of a game record, or null if it cannot be read. */
function finalBoard(sgf: string): BoardState | null {
  try {
    const parsed = parseSgf(sgf);
    const board = parsed.initialBoard.map((row) => [...row]);
    for (const m of parsed.moves) {
      if (m.x < 0 || m.y < 0 || board[m.y]?.[m.x] !== null) continue;
      board[m.y]![m.x] = m.player;
      applyCapturesInPlace(board, m.x, m.y, m.player);
    }
    return board;
  } catch {
    return null;
  }
}

/** A thumbnail of how a game ended, for the game list. */
export const MiniBoard: React.FC<{ sgf: string; size?: number }> = ({ sgf, size = 64 }) => {
  const board = useMemo(() => finalBoard(sgf), [sgf]);
  if (!board) return null;
  const n = board.length;
  const cell = 1;
  const pad = 0.6;
  const extent = (n - 1) * cell + pad * 2;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const p = pad + i * cell;
    lines.push(<line key={`h${i}`} x1={pad} y1={p} x2={extent - pad} y2={p} />);
    lines.push(<line key={`v${i}`} x1={p} y1={pad} x2={p} y2={extent - pad} />);
  }
  const stones: React.ReactNode[] = [];
  board.forEach((row, y) => row.forEach((c, x) => {
    if (c) stones.push(<circle key={`${x},${y}`} cx={pad + x} cy={pad + y} r={0.48} className={`sensei-mini-${c}`} />);
  }));
  return (
    <svg className="sensei-mini" width={size} height={size} viewBox={`0 0 ${extent} ${extent}`} aria-hidden>
      <rect width={extent} height={extent} className="sensei-mini-wood" />
      <g className="sensei-mini-grid">{lines}</g>
      {stones}
    </svg>
  );
};
