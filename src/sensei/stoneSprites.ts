/**
 * Stone pictures, painted once on a canvas and reused as images: a slate black
 * with a fine grain and soft sheen, and clamshell whites whose curved growth
 * bands differ from stone to stone. Gradients alone looked like plastic, and
 * per-stone SVG filters are too slow for a full 19x19 board.
 */

const SIZE = 160; // px; drawn larger than any cell on a phone, scaled down.
export const WHITE_VARIANTS = 6;
export const BLACK_VARIANTS = 2;

export type StoneSprites = { black: string[]; white: string[] };

let cached: StoneSprites | null | undefined;
/** Held so the decoded pictures stay in memory. */
const decoded: HTMLImageElement[] = [];

/** Deterministic noise, so a stone looks the same on every render. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

const C = SIZE / 2;
const R = SIZE / 2 - 1;

function clipCircle(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.clip();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, squash = 1, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** Nachiguro slate: blue-black, a fine grain, a dull sheen top left and a rim light bottom right. */
function paintBlack(seed: number): string | null {
  const made = canvas();
  if (!made) return null;
  const [c, ctx] = made;
  ctx.save();
  clipCircle(ctx);
  const base = ctx.createRadialGradient(C - R * 0.3, C - R * 0.35, R * 0.05, C, C, R);
  base.addColorStop(0, '#3b4651');
  base.addColorStop(0.35, '#1d252c');
  base.addColorStop(0.8, '#0a0e12');
  base.addColorStop(1, '#05070a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  glow(ctx, C - R * 0.4, C - R * 0.5, R * 0.42, '170,200,222', 0.42, 0.7, -0.6);
  glow(ctx, C + R * 0.32, C + R * 0.66, R * 0.36, '140,175,198', 0.32, 0.45, -0.5);
  ctx.restore();

  // Grain: tiny per-pixel speckle, strongest where the light falls.
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const rand = rng(seed * 9973 + 17);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (img.data[i + 3] === 0) continue;
      const lum = img.data[i]! + img.data[i + 1]! + img.data[i + 2]!;
      const n = (rand() - 0.5) * (8 + lum * 0.12);
      img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n * 1.05));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n * 1.15));
    }
  }
  ctx.putImageData(img, 0, 0);
  edge(ctx, 'rgba(0,0,0,0.5)');
  return c.toDataURL('image/png');
}

/** Clamshell white: off-white with curved growth bands of uneven width and spacing. */
function paintWhite(seed: number): string | null {
  const made = canvas();
  if (!made) return null;
  const [c, ctx] = made;
  const rand = rng(seed * 7919 + 3);
  ctx.save();
  clipCircle(ctx);
  const base = ctx.createRadialGradient(C - R * 0.25, C - R * 0.3, R * 0.05, C, C, R * 1.02);
  base.addColorStop(0, '#fbfbf9');
  base.addColorStop(0.6, '#efefec');
  base.addColorStop(0.9, '#dcdcd8');
  base.addColorStop(1, '#c9c9c5');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Bands run across the stone at a slant, each a gentle arc of a large circle.
  ctx.translate(C, C);
  ctx.rotate((8 + rand() * 26) * (Math.PI / 180));
  const bend = R * (2.6 + rand() * 1.6);
  ctx.filter = 'blur(0.7px)';
  let off = -R * (0.95 + rand() * 0.1);
  while (off < R) {
    const width = R * (0.015 + rand() * rand() * 0.11);
    ctx.strokeStyle = `rgba(150,150,156,${0.08 + rand() * 0.14})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, off + bend, bend, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
    off += R * (0.11 + rand() * 0.2);
  }
  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  glow(ctx, C - R * 0.38, C - R * 0.45, R * 0.5, '255,255,255', 0.85, 0.65, -0.6);
  glow(ctx, C + R * 0.3, C + R * 0.68, R * 0.32, '255,255,255', 0.55, 0.45, -0.5);
  ctx.restore();
  edge(ctx, 'rgba(90,90,90,0.35)');
  return c.toDataURL('image/png');
}

/** A thin darker rim, so the stone's edge reads against the board. */
function edge(ctx: CanvasRenderingContext2D, color: string) {
  ctx.beginPath();
  ctx.arc(C, C, R - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** The sprites, or null where there is no canvas (tests); the board then draws plain stones. */
export function stoneSprites(): StoneSprites | null {
  if (cached !== undefined) return cached;
  try {
    const black = Array.from({ length: BLACK_VARIANTS }, (_, i) => paintBlack(i + 1));
    const white = Array.from({ length: WHITE_VARIANTS }, (_, i) => paintWhite(i + 1));
    cached = black.every(Boolean) && white.every(Boolean) ? { black: black as string[], white: white as string[] } : null;
    // Decode every picture now, not when the first stone of its kind is placed.
    if (cached && typeof Image !== 'undefined') {
      for (const src of [...cached.black, ...cached.white]) {
        const img = new Image();
        img.src = src;
        void img.decode?.().catch(() => undefined);
        decoded.push(img);
      }
    }
  } catch {
    cached = null;
  }
  return cached;
}
