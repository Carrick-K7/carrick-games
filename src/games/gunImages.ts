/*
 * Optional real gun side-profile images (public domain / CC0, sources in
 * public/guns/SOURCES.md). When an iconId has a bundled image it is drawn
 * instead of the hand-drawn vector icon. Images lazy-load; the vector icon
 * renders until the image arrives (and permanently if it is missing).
 */

/** iconId → bundled asset path. Only items with a sourced image are listed. */
export const GUN_IMAGES: Record<string, string> = {
  butterfly: '/guns/butterfly.png',
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
  deagle: '/guns/deagle.png',
  p250: '/guns/p250.png',
  fn57: '/guns/fn57.png',
  // karambit / usp: no clean public-domain image passed review — vector icons.
};

const cache = new Map<string, HTMLImageElement | 'loading' | 'missing'>();

/** Returns the loaded image, or null while loading / when unavailable. */
export function getGunImage(iconId: string): HTMLImageElement | null {
  const path = GUN_IMAGES[iconId];
  if (!path) return null;
  const hit = cache.get(iconId);
  if (hit === 'loading' || hit === 'missing') return null;
  if (hit) return hit;
  const img = new Image();
  cache.set(iconId, 'loading');
  img.onload = () => cache.set(iconId, img);
  img.onerror = () => cache.set(iconId, 'missing');
  img.src = path;
  return null;
}

/**
 * Draw the item's art centered at (cx, cy) within a `size`-tall box.
 * Prefers the real photo; falls back to the vector icon. When `plate` is
 * set, a soft light plate is drawn behind photos so dark guns stay readable
 * on dark themes.
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
