/*
 * Detailed SVG silhouettes auto-traced from official CS2/CS:GO inventory art.
 * The app renders only the vectors — never the source raster images. The same
 * SVG can be drawn with its steel gradient (gallery/result) or used as an
 * alpha mask and tinted (stats/recent pulls).
 */

export const GUN_VECTORS: Record<string, string> = Object.fromEntries(
  [
    'butterfly', 'karambit', 'awp', 'g3sg1', 'ak47', 'm4a4', 'm4a1s', 'p90',
    'mp5', 'ump45', 'mac10', 'glock', 'usp', 'deagle', 'p250', 'fn57',
  ].map((id) => [id, `/guns/svg/${id}.svg`]),
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

function getGunVector(iconId: string): HTMLImageElement | null {
  const path = GUN_VECTORS[iconId];
  if (!path) return null;
  return loadImage(path, `svg:${iconId}`);
}

/** Draw the official-shape silhouette tinted with `color`. */
export function drawGunSilhouette(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha = 1,
): boolean {
  const img = getGunVector(iconId);
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
 * Draw the steel-gradient SVG centered at (cx, cy). `maxW` keeps long rifles
 * inside cards; no image plate or photo chrome is added.
 */
export function drawItemArt(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  size: number,
  opts: { alpha?: number; maxW?: number; glow?: string },
): boolean {
  const img = getGunVector(iconId);
  if (!img) return false;
  let h = size;
  let w = (img.width / img.height) * size;
  if (opts.maxW && w > opts.maxW) {
    w = opts.maxW;
    h = (img.height / img.width) * w;
  }
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = Math.max(8, size * 0.18);
  }
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return true;
}
