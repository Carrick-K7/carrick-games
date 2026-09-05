/*
 * Weapon icons for the Gacha game — real CS:GO/CS2 silhouettes, no image
 * assets at runtime.
 *
 * drawWeaponIcon(ctx, iconId, cx, cy, opts) renders the orthographic front
 * view — the 正视图 (principal view) — of an actual Counter-Strike weapon,
 * traced from Valve's official inventory renders (see
 * gachaWeaponSilhouettes.ts for the tracing pipeline). Muzzle points +x,
 * magazines and grips hang +y. The path data is normalized to fit x in
 * [-0.52, 0.52], y in [-0.36, 0.36] around the silhouette's bounding-box
 * center, so every weapon keeps its true aspect ratio: an AWP is long and
 * low, a pistol compact.
 *
 * Every icon id has its own traced silhouette; unknown ids fall back to a
 * same-family weapon, and the family ids themselves (knife/gloves/sniper/
 * rifle/smg/pistol/shotgun/mg) resolve to their most iconic representative,
 * so the old `item.kind` call path keeps working.
 *
 * Rendering: the path is filled as a refined single-shape silhouette —
 * `mono:true` uses a flat `color` (the stats page's faded icon lists);
 * `mono:false` shades `color` with a soft vertical gradient plus a hairline
 * edge, which reads like an anodized metal cut-out on both rarity-tinted
 * reel cards and the result card's blueprint panel. Every profile is
 * supersampled into a cached offscreen canvas and smoothly reduced, so the
 * same art stays crisp from tiny reel thumbnails up to large result cards.
 */

import { WEAPON_SILHOUETTES, WEAPON_SILHOUETTE_DIMS, resolveSilhouetteId } from './gachaWeaponSilhouettes.js';

export interface WeaponIconOptions {
  color: string;
  /** Maximum width in logical pixels (height follows aspect). */
  size: number;
  alpha?: number;
  /** Flip horizontally (e.g. grip-left). */
  mirror?: boolean;
  /** true → single-colour silhouette in `color`; false → shaded cut-out. */
  mono?: boolean;
}

const PROFILE_WIDTH = 1.2;
const PROFILE_HEIGHT = 1.0;
const profileCache = new Map<string, HTMLCanvasElement>();
const pathCache = new Map<string, Path2D>();

function silhouettePath(iconId: string): Path2D | undefined {
  const cached = pathCache.get(iconId);
  if (cached) return cached;
  const key = resolveSilhouetteId(iconId);
  const d = key ? WEAPON_SILHOUETTES[key] : undefined;
  if (!d) return undefined;
  const path = new Path2D(d);
  pathCache.set(iconId, path);
  return path;
}

/**
 * Draw size that makes the silhouette of `iconId` fit inside
 * `maxWidth` × `maxHeight` logical pixels (each weapon keeps its true
 * aspect ratio). Use this wherever an icon must stay inside a card or
 * cell: `drawWeaponIcon(ctx, id, x, y, { size: weaponIconFitSize(id, w, h), ... })`.
 */
export function weaponIconFitSize(iconId: string, maxWidth: number, maxHeight: number): number {
  const key = resolveSilhouetteId(iconId);
  const dims = key ? WEAPON_SILHOUETTE_DIMS[key] : undefined;
  if (!dims) return Math.max(1, Math.min(maxWidth, maxHeight));
  return Math.max(1, Math.min(maxWidth / dims[0], maxHeight / dims[1]));
}

/* ─── colour shading ──────────────────────────────────────────────────── */

function hexToRgb(color: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return undefined;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** amount > 0 lightens toward white, < 0 darkens toward black. */
function shade(color: string, amount: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const target = amount > 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const [r, g, b] = rgb.map((v) => Math.round(v + (target - v) * k));
  return `rgb(${r},${g},${b})`;
}

/* ─── sprite cache ────────────────────────────────────────────────────── */

function profileSprite(iconId: string, size: number, color: string, mono: boolean): HTMLCanvasElement | undefined {
  const cacheColor = mono ? color : `shaded:${color}`;
  const key = `${resolveSilhouetteId(iconId)}|${size.toFixed(2)}|${cacheColor}`;
  const cached = profileCache.get(key);
  if (cached) return cached;

  const path = silhouettePath(iconId);
  if (!path) return undefined;

  const logicalWidth = size * PROFILE_WIDTH;
  const logicalHeight = size * PROFILE_HEIGHT;
  const supersample = size >= 180 ? 3 : 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(logicalWidth * supersample));
  canvas.height = Math.max(1, Math.ceil(logicalHeight * supersample));
  const spriteCtx = canvas.getContext('2d');
  if (!spriteCtx) return canvas;

  spriteCtx.scale(supersample, supersample);
  spriteCtx.translate(logicalWidth / 2, logicalHeight / 2);
  spriteCtx.imageSmoothingEnabled = true;
  spriteCtx.imageSmoothingQuality = 'high';
  spriteCtx.lineJoin = 'round';
  spriteCtx.scale(size, size); // path data is normalized around the origin

  if (mono) {
    spriteCtx.fillStyle = color;
    spriteCtx.fill(path);
  } else {
    // Metal cut-out: soft top light over the caller's base tone, darker at
    // the bottom, with a hairline edge for definition on tinted cards.
    const grad = spriteCtx.createLinearGradient(0, -0.32, 0, 0.32);
    grad.addColorStop(0, shade(color, 0.22));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, -0.3));
    spriteCtx.fillStyle = grad;
    spriteCtx.fill(path);
    spriteCtx.globalAlpha = 0.45;
    spriteCtx.strokeStyle = shade(color, -0.55);
    spriteCtx.lineWidth = 0.014;
    spriteCtx.stroke(path);
    spriteCtx.globalAlpha = 1;
  }

  profileCache.set(key, canvas);
  return canvas;
}

/** Render a supersampled weapon silhouette centered at (cx, cy). */
export function drawWeaponIcon(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  options: WeaponIconOptions,
) {
  const size = Math.max(1, options.size);
  const mono = options.mono ?? false;
  const sprite = profileSprite(iconId, size, options.color, mono);
  if (!sprite) return;
  const width = size * PROFILE_WIDTH;
  const height = size * PROFILE_HEIGHT;
  ctx.save();
  ctx.translate(cx, cy);
  if (options.mirror) ctx.scale(-1, 1);
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/* ─── real weapon renders (photos) ──────────────────────────────────────
 * The prize-pool weapons also ship the official inventory render as a WebP
 * photo under `gacha/weapons/<id>.webp` (traced silhouette and photo share
 * the same source render and the same muzzle-right convention). Owned pulls
 * and the opening interface show the real texture; locked gallery entries
 * stay silhouettes. While a photo is still arriving the silhouette stands
 * in, so first frames never look empty.
 */

/** Natural width/height aspect of each shipped photo render. */
const WEAPON_PHOTO_ASPECTS: Record<string, number> = {
  ak47: 1.9512,
  awp: 2.4903,
  butterfly: 1.2008,
  deagle: 1.1896,
  fn57: 1.2053,
  g3sg1: 1.8391,
  glock: 1.2648,
  karambit: 1.4035,
  m4a1s: 2.4521,
  m4a4: 1.7204,
  mac10: 0.795,
  mp5: 1.6,
  p250: 1.0095,
  p90: 1.604,
  ump45: 1.3913,
  usp: 1.9048,
};

const photoCache = new Map<string, HTMLImageElement | 'error'>();

export function weaponPhotoAspect(iconId: string): number | undefined {
  const key = resolveSilhouetteId(iconId);
  return key ? WEAPON_PHOTO_ASPECTS[key] : undefined;
}

function weaponPhoto(iconId: string): HTMLImageElement | undefined {
  const key = resolveSilhouetteId(iconId);
  if (!key || !(key in WEAPON_PHOTO_ASPECTS)) return undefined;
  let entry = photoCache.get(key);
  if (entry === 'error') return undefined;
  if (!entry) {
    const img = new Image();
    img.decoding = 'async';
    img.src = `gacha/weapons/${key}.webp`; // relative: the SPA always serves from root
    img.onerror = () => photoCache.set(key, 'error');
    photoCache.set(key, img);
    entry = img;
  }
  return entry.complete && entry.naturalWidth > 0 ? entry : undefined;
}

/** Start loading every available photo render (call when the game boots). */
export function preloadWeaponPhotos(): void {
  for (const key of Object.keys(WEAPON_PHOTO_ASPECTS)) weaponPhoto(key);
}

/**
 * Draw the real weapon render contain-fitted inside `maxWidth` × `maxHeight`
 * centered at (cx, cy). Returns false when the photo is unavailable and the
 * silhouette fallback was drawn instead.
 */
export function drawWeaponPhoto(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight: number,
  options: { alpha?: number; mirror?: boolean; fallbackColor?: string } = {},
): boolean {
  const img = weaponPhoto(iconId);
  const aspect = weaponPhotoAspect(iconId);
  if (img && aspect) {
    const width = Math.min(maxWidth, maxHeight * aspect);
    const height = width / aspect;
    ctx.save();
    ctx.translate(cx, cy);
    if (options.mirror) ctx.scale(-1, 1);
    ctx.globalAlpha *= options.alpha ?? 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }
  drawWeaponIcon(ctx, iconId, cx, cy, {
    size: weaponIconFitSize(iconId, maxWidth, maxHeight),
    color: options.fallbackColor ?? '#5c6672',
    alpha: options.alpha,
    mirror: options.mirror,
  });
  return false;
}
