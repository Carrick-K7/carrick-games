/*
 * Official CS2/CS:GO item art (Valve renders — via the Counter-Strike Wiki and
 * the Steam economy CDN; sources in public/guns/SOURCES.md). When an iconId
 * has bundled art it is drawn instead of the hand-drawn vector icon. Images
 * lazy-load; the vector icon renders until the image arrives (and permanently
 * if it is missing).
 */

/** iconId → bundled official art. */
export const GUN_IMAGES: Record<string, string> = {
  butterfly: '/guns/butterfly.png',
  karambit: '/guns/karambit.png',
  awp: '/guns/awp.png',
  g3sg1: '/guns/g3sg1.png',
  ak47: '/guns/ak47.png',
  m4a4: '/guns/m4a4.png',
  m4a1s: '/guns/m4a1s.png',
  p90: '/guns/p90.png',
  mp5: '/guns/mp5.png',
  ump45: '/guns/ump45.png',
  mac10: '/guns/mac10.png',
  glock: '/guns/glock.png',
  usp: '/guns/usp.png',
  deagle: '/guns/deagle.png',
  p250: '/guns/p250.png',
  fn57: '/guns/fn57.png',
};

/** White silhouettes derived from the official art (alpha mask) — tinted at draw time. */
const GUN_SILHOUETTES: Record<string, string> = Object.fromEntries(
  Object.keys(GUN_IMAGES).map((id) => [id, `/guns/sil/${id}.png`]),
);

const cache = new Map<string, HTMLImageElement | 'loading' | 'missing'>();

function loadImage(path: string, key: string): HTMLImageElement | null {
  const hit = cache.get(key);
  if (hit === 'loading' || hit === 'missing') return null;
  if (hit) return hit;
  const img = new Image();
  cache.set(key, 'loading');
  img.onload = () => cache.set(key, img);
  img.onerror = () => cache.set(key, 'missing');
  img.src = path;
  return null;
}

/** Returns the loaded official image, or null while loading / when unavailable. */
export function getGunImage(iconId: string): HTMLImageElement | null {
  const path = GUN_IMAGES[iconId];
  if (!path) return null;
  return loadImage(path, `img:${iconId}`);
}

/**
 * Official-art silhouette tinted with `color` (alpha mask → source-in fill).
 * Returns false until the silhouette loads, so callers fall back to vectors.
 */
export function drawGunSilhouette(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha = 1,
): boolean {
  const path = GUN_SILHOUETTES[iconId];
  if (!path) return false;
  const img = loadImage(path, `sil:${iconId}`);
  if (!img) return false;
  const h = size;
  const w = (img.width / img.height) * size;
  const off = document.createElement('canvas');
  off.width = Math.ceil(w);
  off.height = Math.ceil(h);
  const octx = off.getContext('2d');
  if (!octx) return false;
  octx.drawImage(img, 0, 0, w, h);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(off, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return true;
}

/**
 * Draw the item's art centered at (cx, cy) within a `size`-tall box.
 * Prefers the official art; returns false so callers can fall back to the
 * vector icon. When `plate` is set, a soft light plate is drawn behind the
 * art so dark guns stay readable on dark themes.
 */
export function drawItemArt(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  size: number,
  opts: { alpha?: number; plate?: boolean; maxW?: number },
): boolean {
  const img = getGunImage(iconId);
  if (!img) return false;
  let h = size;
  let w = (img.width / img.height) * size;
  if (opts.maxW && w > opts.maxW) {
    w = opts.maxW;
    h = (img.height / img.width) * w;
  }
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.plate) {
    const pw = w + size * 0.18;
    const ph = h + size * 0.14;
    const g = ctx.createLinearGradient(cx, cy - ph / 2, cx, cy + ph / 2);
    g.addColorStop(0, 'rgba(236,242,248,0.96)');
    g.addColorStop(1, 'rgba(203,213,225,0.92)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 10);
    ctx.fill();
  }
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return true;
}
