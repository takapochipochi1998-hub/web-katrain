/**
 * An SGF holding only the way to one position: the root's setup and the moves
 * that led there. Used to start a fresh game from a position under review.
 */
import type { GameNode } from '../types';
import { coordinateToSgf, escapeSgfValue } from '../utils/sgf';

/** Root properties worth carrying into a game that starts from this position. */
const CARRIED = ['SZ', 'KM', 'HA', 'AB', 'AW', 'RU'] as const;

export function sgfForPath(node: GameNode): string {
  const path: GameNode[] = [];
  let root = node;
  for (let n: GameNode | null = node; n; n = n.parent) {
    if (n.parent) path.unshift(n);
    else root = n;
  }
  const props = root.properties ?? {};
  let head = '(;GM[1]FF[4]CA[UTF-8]';
  for (const key of CARRIED) {
    const values = props[key];
    if (values?.length) head += `${key}${values.map((v) => `[${escapeSgfValue(v)}]`).join('')}`;
  }
  if (!props.SZ) head += `SZ[${root.gameState.board.length}]`;
  if (!props.KM) head += `KM[${root.gameState.komi}]`;
  const moves = path
    .filter((n) => n.move)
    .map((n) => {
      const m = n.move!;
      const color = m.player === 'black' ? 'B' : 'W';
      return `;${color}[${m.x < 0 ? '' : coordinateToSgf(m.x, m.y)}]`;
    })
    .join('');
  return `${head}${moves})`;
}
