// Original, asset-free utility symbols. Weapons use offline-derived inventory SVGs.
export type HudIconKind = 'health' | 'armor' | 'headshot' | 'grenade' | 'bomb';
type Art = { w: number; h: number; paths: readonly (readonly number[])[] };

// Filled contours avoid stroke overshoot. Inner contours are transparent holes;
// a single fill retains caller opacity without stacking overlapping primitives.
const ART: Record<HudIconKind, Art> = {
  health: { w: 16, h: 16, paths: [
    [5, 1, 11, 1, 11, 5, 15, 5, 15, 11, 11, 11, 11, 15, 5, 15, 5, 11, 1, 11, 1, 5, 5, 5],
  ] },
  armor: { w: 16, h: 16, paths: [
    [2, 1, 14, 1, 14, 8, 12, 12, 8, 15, 4, 12, 2, 8],
    [4, 3, 12, 3, 12, 7.5, 10.5, 10.5, 8, 12.5, 5.5, 10.5, 4, 7.5],
  ] },
  // Profile + impact aperture/rays, not a copied skull or team insignia.
  headshot: { w: 16, h: 16, paths: [
    [4, 2, 8, 2, 10, 4, 10, 6, 12, 8, 10, 9, 10, 11, 7, 11, 7, 14, 2, 14, 2, 10, 1, 8, 1, 5],
    [6, 4, 8, 6, 6, 8, 4, 6],
    [11, 3, 13, 1, 14, 2, 12, 4],
    [12, 5, 15, 5, 15, 6.5, 12, 6.5],
    [12, 10, 14, 12, 13, 13, 11, 11],
  ] },
  // Segmented canister, pin ring and lever; an original utility pictogram.
  grenade: { w: 16, h: 16, paths: [
    [4, 6, 11, 6, 13, 9, 13, 12, 10, 15, 5, 15, 2, 12, 2, 9],
    [4, 9, 6, 9, 6, 12, 4, 12],
    [8, 9, 10, 9, 10, 12, 8, 12],
    [5, 3, 9, 3, 9, 5, 5, 5],
    [5, 1, 11, 1, 14, 6, 12.5, 7, 10, 3, 5, 3],
    [1, 1, 4, 1, 4, 4, 1, 4],
    [2, 2, 3, 2, 3, 3, 2, 3],
  ] },
  // Wired rectangular device with a screen and keys; no proprietary markings.
  bomb: { w: 16, h: 16, paths: [
    [2, 5, 14, 5, 14, 15, 2, 15],
    [4, 7, 12, 7, 12, 10, 4, 10],
    [4, 12, 6, 12, 6, 13.5, 4, 13.5],
    [8, 12, 12, 12, 12, 13.5, 8, 13.5],
    [4, 5, 4, 1, 9, 1, 11, 3, 11, 5, 9, 5, 9, 3, 6, 3, 6, 5],
  ] },
};
const BADGES: Record<'ct' | 't', Art> = {
  ct: { w: 20, h: 20, paths: [
    [2, 2, 18, 2, 18, 10, 15, 15, 10, 19, 5, 15, 2, 10],
    [4, 4, 16, 4, 16, 9.5, 13.5, 13.5, 10, 16.5, 6.5, 13.5, 4, 9.5],
    [8.5, 6, 11.5, 6, 11.5, 12, 10, 13.5, 8.5, 12],
  ] },
  t: { w: 20, h: 20, paths: [
    [2, 2, 10, 7, 18, 2, 18, 6, 10, 11, 2, 6],
    [2, 10, 10, 15, 18, 10, 18, 14, 10, 19, 2, 14],
  ] },
};

function drawArt(ctx: CanvasRenderingContext2D, art: Art, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0 || ![x, y, w, h, x + w, y + h].every(Number.isFinite)) return;
  const scale = Math.min(w / art.w, h / art.h);
  if (scale <= 0) return;
  const left = x + (w - art.w * scale) / 2, top = y + (h - art.h * scale) / 2;
  ctx.save();
  try {
    ctx.fillStyle = color;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    // Path2D leaves even the caller's current path untouched. The immediate-path
    // branch supports minimal CPU recorder contexts without a browser Path2D.
    const path = typeof Path2D === 'undefined' ? null : new Path2D(), pen = path || ctx;
    if (!path) ctx.beginPath();
    for (const points of art.paths) {
      pen.moveTo(left + points[0] * scale, top + points[1] * scale);
      for (let i = 2; i < points.length; i += 2) pen.lineTo(left + points[i] * scale, top + points[i + 1] * scale);
      pen.closePath();
    }
    if (path) ctx.fill(path, 'evenodd');
    else ctx.fill('evenodd');
  } finally {
    ctx.restore();
  }
}

/** Contain-fit inside logical bounds; retains the caller's transform and alpha. */
export function drawHudIcon(ctx: CanvasRenderingContext2D, kind: HudIconKind,
  x: number, y: number, w: number, h: number, color: string): void {
  if (Object.prototype.hasOwnProperty.call(ART, kind)) drawArt(ctx, ART[kind], x, y, w, h, color);
}

/** Original shield / double-chevron motifs; team labels remain the HUD's responsibility. */
export function drawTeamBadge(ctx: CanvasRenderingContext2D, team: 'ct' | 't',
  x: number, y: number, size: number, color: string): void {
  drawArt(ctx, BADGES[team], x, y, size, size, color);
}
