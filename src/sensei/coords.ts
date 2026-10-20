/** Japanese board coordinates: column number then row kanji, e.g. "4の三". */
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];

export const kanjiRow = (y: number): string => KANJI[y] ?? String(y + 1);

export function pointLabel(x: number, y: number): string {
  return x < 0 ? 'パス' : `${x + 1}の${kanjiRow(y)}`;
}

/** GTP coordinates ("D4", "Q16") as used in engine PVs, back to x/y. Row 1 is the bottom. */
export function gtpToPoint(gtp: string, size: number): { x: number; y: number } | null {
  const m = /^([A-HJ-T])(\d{1,2})$/i.exec(gtp.trim());
  if (!m) return null;
  let col = m[1]!.toUpperCase().charCodeAt(0) - 65;
  if (col >= 8) col -= 1; // GTP skips I
  const row = Number(m[2]);
  if (col < 0 || col >= size || row < 1 || row > size) return null;
  return { x: col, y: size - row };
}

export function gtpLineLabel(pv: readonly string[] | undefined, size: number, firstColor: 'black' | 'white', limit = 8): string {
  if (!pv?.length) return '';
  let color = firstColor;
  const parts: string[] = [];
  for (const move of pv.slice(0, limit)) {
    const p = gtpToPoint(move, size);
    parts.push(`${color === 'black' ? '黒' : '白'}${p ? pointLabel(p.x, p.y) : 'パス'}`);
    color = color === 'black' ? 'white' : 'black';
  }
  return parts.join('→');
}
