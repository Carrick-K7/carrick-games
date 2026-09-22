// Original, asset-free utility symbols. Firearms use offline-derived inventory SVGs.
export type HudIconKind = 'health' | 'armor';
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
  drawArt(ctx, ART[kind], x, y, w, h, color);
}

/** Original shield / double-chevron motifs; team labels remain the HUD's responsibility. */
export function drawTeamBadge(ctx: CanvasRenderingContext2D, team: 'ct' | 't',
  x: number, y: number, size: number, color: string): void {
  drawArt(ctx, BADGES[team], x, y, size, size, color);
}
