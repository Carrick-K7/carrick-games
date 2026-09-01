/*
 * Hand-drawn per-weapon icons for the Gacha game — no image assets.
 *
 * drawWeaponIcon(ctx, iconId, cx, cy, opts) renders one orthographic side
 * profile: no three-quarter camera angle and no perspective foreshortening.
 * Multi-tone steel, wood, polymer, mounts, sights, magazines, and controls
 * keep each weapon recognizable while preserving a clean outer silhouette.
 * Coordinates are normalized to -0.5..0.5 (gun points +x). Every profile is
 * supersampled into a cached offscreen canvas and smoothly reduced, so the
 * same art stays crisp from tiny reel thumbnails up to large result cards.
 *
 * The first argument was broadened from the coarse WeaponKind to a free
 * `iconId` string: every weapon has its own id, unknown ids fall back to a
 * same-family silhouette, and the family ids themselves (knife/gloves/sniper/
 * rifle/smg/pistol/shotgun/mg) still render their generic profile so the old
 * `item.kind` call path keeps working.
 *
 * Modes: by default the icon is drawn in fixed realistic tones (`mono:false`),
 * ignoring the `color` argument except as a fallback. Passing `mono:true`
 * renders the same shapes as a single-color silhouette in `color` (used by
 * the stats page's faded icon lists).
 */

export interface WeaponIconOptions {
  color: string;
  /** Maximum width in logical pixels (height follows aspect). */
  size: number;
  alpha?: number;
  /** Flip horizontally (e.g. grip-left). */
  mirror?: boolean;
  /** true → single-colour silhouette in `color`; false → realistic tones. */
  mono?: boolean;
}

const PROFILE_WIDTH = 1.18;
const PROFILE_HEIGHT = 0.88;
const profileCache = new Map<string, HTMLCanvasElement>();

function profileSprite(iconId: string, size: number, color: string, mono: boolean): HTMLCanvasElement {
  const cacheColor = mono ? color : 'full-color';
  const key = `${iconId}|${size.toFixed(2)}|${cacheColor}`;
  const cached = profileCache.get(key);
  if (cached) return cached;

  const logicalWidth = size * PROFILE_WIDTH;
  const logicalHeight = size * PROFILE_HEIGHT;
  const supersample = size >= 180 ? 3 : 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(logicalWidth * supersample));
  canvas.height = Math.max(1, Math.ceil(logicalHeight * supersample));
  const spriteCtx = canvas.getContext('2d');
  if (spriteCtx) {
    spriteCtx.scale(supersample, supersample);
    spriteCtx.translate(logicalWidth / 2, logicalHeight / 2);
    spriteCtx.imageSmoothingEnabled = true;
    spriteCtx.imageSmoothingQuality = 'high';
    spriteCtx.lineJoin = 'round';
    spriteCtx.lineCap = 'round';
    drawIcon(spriteCtx, iconId, size, color, mono);
  }
  profileCache.set(key, canvas);
  return canvas;
}

/** Render a supersampled flat side profile centered at (cx, cy). */
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

/* ─── tones / palette ─────────────────────────────────────────────────── */

interface Org {
  body: string;      // main dark steel
  bodyLight: string; // top highlight
  barrel: string;    // barrel / muzzle steel
  barrelLight: string;
  wood: string;      // wooden furniture
  woodLight: string;
  poly: string;      // dark polymer
  polyLight: string;
  olive: string;     // olive composite (AWP / Scout)
  oliveLight: string;
  glass: string;     // scope body / glass
  glint: string;     // scope lens glint
  grip: string;      // grip rubber
  metal: string;     // small metal parts / sights
  edge: string;      // outline
}

const BASE: Org = {
  body: '#2b3038', bodyLight: '#4d5562',
  barrel: '#39465e', barrelLight: '#54688b',
  wood: '#8a5a34', woodLight: '#a96f43',
  poly: '#232930', polyLight: '#444d5b',
  olive: '#6b7a4e', oliveLight: '#85905f',
  glass: '#5f7d94', glint: '#d3e6f2',
  grip: '#20242b', metal: '#7d8794',
  edge: '#13161b',
};

/** Resolve the tone palette for a draw; mono maps every tone to `color`. */
function tone(color: string, mono: boolean, o: Partial<Org> = {}): Org {
  if (mono) {
    return {
      body: color, bodyLight: color, barrel: color, barrelLight: color,
      wood: color, woodLight: color, poly: color, polyLight: color,
      olive: color, oliveLight: color, glass: color, glint: color,
      grip: color, metal: color, edge: color,
    };
  }
  return { ...BASE, ...o };
}

/* ─── drawing helpers ─────────────────────────────────────────────────── */

interface Norm {
  /** Normalized → absolute px. */
  p: (x: number, y: number) => [number, number];
  /** Normalized rect → absolute [x, y, w, h]. */
  r: (x: number, y: number, w: number, h: number) => [number, number, number, number];
}

function norm(size: number): Norm {
  return {
    p: (x, y) => [x * size, y * size],
    r: (x, y, w, h) => [x * size, y * size, w * size, h * size],
  };
}

/** Fill a rect with an explicit colour (used only for small accessories). */
function rect(ctx: CanvasRenderingContext2D, n: Norm, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(...n.r(x, y, w, h));
}

/** Fill (+ optional outline) a polygon given in normalized coords. */
function fillPoly(
  ctx: CanvasRenderingContext2D, n: Norm, pts: [number, number][],
  color: string, edge?: string,
) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = n.p(...pts[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = n.p(1, 0)[0] * 0.014;
    ctx.stroke();
  }
}

/** Fill a horizontal beam / rect-ish body with a top highlight strip. */
function beam(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x0: number, x1: number, y0: number, y1: number) {
  fillPoly(ctx, n, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], t.body, t.edge);
  const hh = Math.min(0.03, (y1 - y0) * 0.42);
  fillPoly(ctx, n, [[x0, y0], [x1, y0], [x1, y0 + hh], [x0, y0 + hh]], t.bodyLight);
}

/** Stroke a line between normalized points with an explicit colour + width. */
function lineN(
  ctx: CanvasRenderingContext2D, n: Norm, color: string, w: number,
  x1: number, y1: number, x2: number, y2: number,
) {
  ctx.beginPath();
  ctx.moveTo(...n.p(x1, y1));
  ctx.lineTo(...n.p(x2, y2));
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Stroke a circle ring (finger ring, sling loop) with an explicit colour. */
function ringN(
  ctx: CanvasRenderingContext2D, n: Norm, color: string,
  cx: number, cy: number, radius: number, width: number,
) {
  const px = n.p(1, 0)[0];
  ctx.beginPath();
  ctx.arc(cx * px, cy * px, Math.abs(radius) * px, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.abs(width) * px;
  ctx.stroke();
}

/** Side-view trigger bow and trigger, kept open so it reads at thumbnail size. */
function triggerAssembly(
  ctx: CanvasRenderingContext2D,
  n: Norm,
  t: Org,
  cx: number,
  top: number,
  width = 0.15,
  height = 0.15,
) {
  const { p } = n;
  const left = cx - width / 2;
  const right = cx + width / 2;
  ctx.beginPath();
  ctx.moveTo(...p(left, top));
  ctx.lineTo(...p(right, top));
  ctx.quadraticCurveTo(...p(right + width * 0.08, top + height), ...p(cx, top + height));
  ctx.quadraticCurveTo(...p(left - width * 0.08, top + height), ...p(left, top));
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = Math.max(0.9, n.p(0.018, 0)[0]);
  ctx.stroke();
  lineN(ctx, n, t.metal, Math.max(0.8, n.p(0.012, 0)[0]), cx + width * 0.08, top + 0.025, cx - width * 0.03, top + height * 0.68);
}

/** Fine vertical slide/receiver serrations. */
function serrations(
  ctx: CanvasRenderingContext2D,
  n: Norm,
  color: string,
  x: number,
  y0: number,
  y1: number,
  count = 3,
  step = 0.022,
) {
  for (let i = 0; i < count; i++) {
    lineN(ctx, n, color, Math.max(0.55, n.p(0.007, 0)[0]), x + i * step, y0, x + i * step, y1);
  }
}

/** Fill a crescent between two normalized polylines (curved magazine). */
function curvedBlock(
  ctx: CanvasRenderingContext2D, n: Norm, t: Org,
  top: [number, number][], bottom: [number, number][], color: string,
) {
  ctx.beginPath();
  for (let i = 0; i < top.length; i++) {
    const [x, y] = n.p(...top[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = bottom.length - 1; i >= 0; i--) {
    const [x, y] = n.p(...bottom[i]);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = n.p(1, 0)[0] * 0.012;
  ctx.stroke();
}

/* ─── dispatch ────────────────────────────────────────────────────────── */

function drawIcon(ctx: CanvasRenderingContext2D, iconId: string, size: number, color: string, mono: boolean) {
  const n = norm(size);
  switch (iconId) {
    /* knives */
    case 'karambit': return drawKarambit(ctx, n, color, mono);
    case 'butterfly': return drawButterfly(ctx, n, color, mono);
    case 'knife': return drawKnife(ctx, n, color, mono);
    /* snipers */
    case 'awp': return drawAwp(ctx, n, color, mono);
    case 'scout': return drawScout(ctx, n, color, mono);
    case 'g3sg1': return drawAutoSniper(ctx, n, color, mono, 0);
    case 'sg550': return drawAutoSniper(ctx, n, color, mono, 1);
    /* rifles */
    case 'ak47': return drawAk(ctx, n, color, mono);
    case 'm4a4': return drawM4(ctx, n, color, mono, false);
    case 'm4a1': return drawM4(ctx, n, color, mono, false);
    case 'm4a1s': return drawM4(ctx, n, color, mono, true);
    case 'famas': return drawFamas(ctx, n, color, mono);
    case 'galil': return drawGalil(ctx, n, color, mono);
    case 'sg552': return drawSg552(ctx, n, color, mono);
    case 'aug': return drawAug(ctx, n, color, mono);
    /* SMGs */
    case 'p90': return drawP90(ctx, n, color, mono);
    case 'mp5': return drawMp5(ctx, n, color, mono);
    case 'ump45': return drawUmp45(ctx, n, color, mono);
    case 'mac10': return drawMac10(ctx, n, color, mono);
    case 'tmp': return drawTmp(ctx, n, color, mono);
    case 'mp7': return drawMp7(ctx, n, color, mono);
    case 'mp9': return drawMp9(ctx, n, color, mono);
    /* pistols */
    case 'glock': return drawGlock(ctx, n, color, mono);
    case 'usp': return drawUsp(ctx, n, color, mono);
    case 'p250': return drawP250(ctx, n, color, mono);
    case 'p228': return drawP228(ctx, n, color, mono);
    case 'deagle': return drawDeagle(ctx, n, color, mono);
    case 'fn57': return drawFn57(ctx, n, color, mono);
    case 'fiveseven': return drawFn57(ctx, n, color, mono);
    case 'tec9': return drawTec9(ctx, n, color, mono);
    case 'cz75': return drawCz75(ctx, n, color, mono);
    case 'elite': return drawElite(ctx, n, color, mono);
    /* shotguns */
    case 'm3': return drawM3(ctx, n, color, mono);
    case 'xm1014': return drawXm1014(ctx, n, color, mono);
    /* MG */
    case 'm249': return drawM249(ctx, n, color, mono);
    /* gloves */
    case 'gloves': return drawGloves(ctx, n, color, mono);
    /* generic family silhouettes */
    case 'sniper': return drawSniper(ctx, n, color, mono);
    case 'rifle': return drawRifle(ctx, n, color, mono);
    case 'smg': return drawSmg(ctx, n, color, mono);
    case 'pistol': return drawPistol(ctx, n, color, mono);
    case 'shotgun': return drawShotgun(ctx, n, color, mono);
    case 'mg': return drawMg(ctx, n, color, mono);
    /* unknown → sensible same-family fallback by id group */
    default: return drawFallbackFamily(ctx, iconId, n, color, mono);
  }
}

/** Route an unrecognized id to a family silhouette (default rifle). */
function drawFallbackFamily(ctx: CanvasRenderingContext2D, iconId: string, n: Norm, color: string, mono: boolean) {
  if (iconId.includes('knife') || iconId.includes('karambit')) return drawKnife(ctx, n, color, mono);
  if (iconId.includes('snip')) return drawSniper(ctx, n, color, mono);
  if (iconId.includes('shot')) return drawShotgun(ctx, n, color, mono);
  if (iconId.includes('glov')) return drawGloves(ctx, n, color, mono);
  return drawRifle(ctx, n, color, mono);
}

/* ─── knife family ────────────────────────────────────────────────────── */

// Straight knife: slim grip, small guard, tapering blade pointing right.
function drawKnife(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.44, -0.03], [-0.2, -0.05], [-0.2, 0.06], [-0.44, 0.045]], t.grip, t.edge); // grip
  rect(ctx, n, -0.215, -0.055, 0.035, 0.14, t.metal); // guard
  fillPoly(ctx, n, [[-0.175, -0.04], [0.43, -0.18], [0.43, -0.06], [-0.175, 0.05]], t.body, t.edge); // blade
  fillPoly(ctx, n, [[-0.175, -0.04], [0.43, -0.18], [0.43, -0.155], [-0.16, -0.022]], t.bodyLight); // spine highlight
}

// Karambit: curved tiger-claw blade + finger ring.
function drawKarambit(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const { p } = n;
  const t = tone(color, mono);
  ctx.beginPath();
  ctx.moveTo(...p(-0.36, 0.14));
  ctx.quadraticCurveTo(...p(-0.08, 0.1), ...p(0.06, -0.1));
  ctx.quadraticCurveTo(...p(0.3, -0.32), ...p(0.38, -0.18));
  ctx.quadraticCurveTo(...p(0.32, 0.06), ...p(0.06, 0.18));
  ctx.quadraticCurveTo(...p(-0.2, 0.34), ...p(-0.36, 0.14));
  ctx.closePath();
  ctx.fillStyle = t.body;
  ctx.fill();
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = n.p(1, 0)[0] * 0.012;
  ctx.stroke();
  // inner highlight along the blade's upper curve
  ctx.beginPath();
  ctx.moveTo(...p(-0.3, 0.12));
  ctx.quadraticCurveTo(...p(-0.06, 0.08), ...p(0.08, -0.08));
  ctx.quadraticCurveTo(...p(0.24, -0.24), ...p(0.32, -0.18));
  ctx.quadraticCurveTo(...p(0.24, -0.16), ...p(0.1, -0.04));
  ctx.quadraticCurveTo(...p(-0.04, 0.1), ...p(-0.3, 0.16));
  ctx.closePath();
  ctx.fillStyle = t.bodyLight;
  ctx.fill();
  ringN(ctx, n, t.metal, -0.28, 0.22, 0.13, 0.09);
}

// Balisong (butterfly): straight pointed blade + two spread handles.
function drawButterfly(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.05, -0.03], [0.44, -0.15], [0.44, -0.05], [-0.05, 0.045]], t.body, t.edge); // blade
  fillPoly(ctx, n, [[-0.05, -0.03], [0.44, -0.15], [0.44, -0.135], [-0.05, -0.018]], t.bodyLight); // edge highlight
  rect(ctx, n, -0.07, -0.01, 0.09, 0.07, t.metal); // pivot block
  const w = n.p(1, 0)[0] * 0.1;
  ctx.lineCap = 'round';
  lineN(ctx, n, t.poly, w, -0.03, 0.02, -0.44, -0.12);
  lineN(ctx, n, t.polyLight, w * 0.5, -0.03, 0.005, -0.42, -0.1);
  lineN(ctx, n, t.poly, w, -0.03, 0.03, -0.44, 0.14);
  lineN(ctx, n, t.polyLight, w * 0.5, -0.03, 0.04, -0.42, 0.13);
  ctx.lineCap = 'butt';
}

/* ─── sniper family ───────────────────────────────────────────────────── */

// AWP: long thick bull barrel, big scope, cheek-riser olive stock, bolt.
function drawAwp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  fillPoly(ctx, n, [[-0.46, 0.0], [-0.34, 0.0], [-0.34, 0.12], [-0.46, 0.1]], t.poly, t.edge); // butt
  fillPoly(ctx, n, [[-0.42, -0.06], [-0.3, -0.06], [-0.3, 0.0], [-0.42, 0.0]], t.olive, t.edge); // cheek riser
  fillPoly(ctx, n, [[-0.42, -0.06], [-0.32, -0.06], [-0.32, -0.035], [-0.42, -0.035]], t.oliveLight);
  beam(ctx, n, t, -0.34, 0.1, 0.01, 0.12); // receiver
  beam(ctx, n, t, 0.1, 0.48, 0.03, 0.09); // long bull barrel
  fillPoly(ctx, n, [[0.1, 0.03], [0.48, 0.03], [0.48, 0.05], [0.1, 0.05]], t.barrelLight); // barrel sheen
  // big scope
  fillPoly(ctx, n, [[-0.04, -0.22], [0.3, -0.22], [0.3, -0.1], [-0.04, -0.1]], t.glass, t.edge);
  fillPoly(ctx, n, [[-0.04, -0.22], [0.3, -0.22], [0.3, -0.19], [-0.04, -0.19]], t.glint); // glint
  rect(ctx, n, 0.28, -0.2, 0.06, 0.09, t.poly); // objective bell
  rect(ctx, n, 0.02, -0.15, 0.03, 0.16, t.metal); // rear mount
  rect(ctx, n, 0.22, -0.15, 0.03, 0.16, t.metal); // front mount
  rect(ctx, n, -0.1, 0.12, 0.05, 0.06, t.metal); // bolt handle
  fillPoly(ctx, n, [[-0.02, 0.12], [0.08, 0.12], [0.08, 0.21], [-0.02, 0.21]], t.poly, t.edge); // magazine
  fillPoly(ctx, n, [[-0.2, 0.12], [-0.12, 0.12], [-0.1, 0.24], [-0.2, 0.24]], t.poly, t.edge); // grip
}

// Scout: light bolt-action — long slim barrel, small scope, wire stock.
function drawScout(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  beam(ctx, n, t, -0.44, 0.1, 0.0, 0.09); // receiver
  beam(ctx, n, t, 0.1, 0.48, 0.035, 0.075); // long thin barrel
  fillPoly(ctx, n, [[0.02, -0.13], [0.18, -0.13], [0.18, -0.05], [0.02, -0.05]], t.glass, t.edge); // scope
  rect(ctx, n, 0.04, -0.14, 0.02, 0.15, t.metal);
  rect(ctx, n, 0.16, -0.14, 0.02, 0.15, t.metal);
  fillPoly(ctx, n, [[-0.08, 0.09], [0.0, 0.09], [0.0, 0.14], [-0.08, 0.14]], t.poly, t.edge); // mag hint
  const w = n.p(1, 0)[0] * 0.045;
  lineN(ctx, n, t.olive, w, -0.44, -0.04, -0.44, 0.16); // wire stock
  lineN(ctx, n, t.oliveLight, w * 0.5, -0.44, -0.04, -0.42, 0.1);
  lineN(ctx, n, t.olive, w, -0.44, 0.16, -0.3, 0.09);
  lineN(ctx, n, t.olive, w, -0.44, -0.04, -0.3, 0.0);
}

// G3SG1 / SG550: auto-sniper — shorter barrel, small scope, straight mag.
function drawAutoSniper(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean, variant: number) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.46, -0.32, 0.0, 0.11); // stock
  beam(ctx, n, t, -0.32, 0.1, 0.0, 0.11); // receiver
  beam(ctx, n, t, 0.08, 0.4, 0.03, 0.085); // barrel
  fillPoly(ctx, n, [[0.05, -0.15], [0.22, -0.15], [0.22, -0.06], [0.05, -0.06]], t.glass, t.edge); // scope
  rect(ctx, n, 0.07, -0.14, 0.02, 0.15, t.metal);
  rect(ctx, n, 0.19, -0.14, 0.02, 0.15, t.metal);
  rect(ctx, n, 0.34, -0.07, 0.025, 0.08, t.metal); // front sight
  fillPoly(ctx, n, [[-0.18, 0.11], [-0.1, 0.11], [-0.08, 0.24], [-0.18, 0.24]], t.poly, t.edge); // grip
  fillPoly(ctx, n, [[0.01, 0.11], [0.11, 0.11], [0.1, 0.29], [0.01, 0.29]], t.poly, t.edge); // straight mag
  if (variant === 1) {
    beam(ctx, n, t, 0.12, 0.28, 0.015, 0.06); // SG550 ribbed handguard
  } else {
    rect(ctx, n, 0.4, 0.015, 0.05, 0.03, t.barrelLight); // G3SG1 muzzle brake
  }
}

/* ─── rifle family ────────────────────────────────────────────────────── */

// AK-47: banana magazine, wood furniture, gas tube, front sight.
function drawAk(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { wood: '#8a5a34', woodLight: '#a76d40' });
  fillPoly(ctx, n, [[-0.46, 0.0], [-0.32, 0.0], [-0.28, 0.09], [-0.44, 0.11]], t.wood, t.edge); // drop stock
  fillPoly(ctx, n, [[-0.44, 0.01], [-0.34, 0.01], [-0.31, 0.045], [-0.43, 0.055]], t.woodLight);
  beam(ctx, n, t, -0.32, 0.18, 0.0, 0.075); // receiver
  fillPoly(ctx, n, [[-0.3, -0.05], [-0.14, -0.05], [-0.12, 0.02], [-0.3, 0.02]], t.wood, t.edge); // handguard
  fillPoly(ctx, n, [[-0.3, -0.05], [-0.15, -0.05], [-0.145, -0.025], [-0.3, -0.025]], t.woodLight);
  rect(ctx, n, -0.32, -0.06, 0.1, 0.04, t.metal); // rear sight
  beam(ctx, n, t, -0.26, 0.16, -0.095, -0.06); // gas tube
  beam(ctx, n, t, 0.12, 0.46, 0.0, 0.045); // barrel
  rect(ctx, n, 0.4, -0.08, 0.026, 0.08, t.metal); // front sight
  curvedBlock(ctx, n, t, [[0.0, 0.075], [0.12, 0.075]], [[0.13, 0.28], [0.17, 0.28], [0.11, 0.055]], t.body); // banana mag
  curvedBlock(ctx, n, t, [[0.02, 0.078], [0.11, 0.078]], [[0.115, 0.16], [0.155, 0.16]], t.bodyLight); // mag face
  fillPoly(ctx, n, [[-0.18, 0.075], [-0.1, 0.075], [-0.08, 0.21], [-0.18, 0.21]], t.grip, t.edge); // grip
}

// M4A4 / M4A1 / M4A1-S: telescoping stock, carry handle, straight mag.
function drawM4(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean, suppressor: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.46, -0.28, 0.0, 0.055); // buffer tube
  fillPoly(ctx, n, [[-0.46, 0.05], [-0.36, 0.05], [-0.36, 0.085], [-0.46, 0.085]], t.poly, t.edge); // butt
  beam(ctx, n, t, -0.28, 0.16, -0.02, 0.09); // receiver
  fillPoly(ctx, n, [[-0.24, -0.09], [0.0, -0.09], [0.0, -0.035], [-0.24, -0.035]], t.poly, t.edge); // carry handle
  fillPoly(ctx, n, [[-0.08, -0.045], [0.16, -0.045], [0.16, 0.05], [-0.08, 0.05]], t.poly, t.edge); // handguard
  fillPoly(ctx, n, [[-0.08, -0.045], [0.16, -0.045], [0.16, -0.02], [-0.08, -0.02]], t.polyLight);
  beam(ctx, n, t, 0.16, 0.44, 0.01, 0.05); // barrel
  rect(ctx, n, 0.26, -0.06, 0.028, 0.07, t.metal); // front sight
  fillPoly(ctx, n, [[0.0, 0.09], [0.1, 0.09], [0.1, 0.25], [0.0, 0.25]], t.poly, t.edge); // straight mag
  fillPoly(ctx, n, [[-0.16, 0.09], [-0.08, 0.09], [-0.06, 0.2], [-0.16, 0.2]], t.grip, t.edge); // grip
  if (suppressor) fillPoly(ctx, n, [[0.44, -0.005], [0.54, -0.005], [0.54, 0.045], [0.44, 0.045]], t.barrel, t.edge);
}

// FAMAS: bullpup with a tall arch carry handle over the receiver.
function drawFamas(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const { p } = n;
  const t = tone(color, mono);
  beam(ctx, n, t, -0.22, 0.14, 0.0, 0.11); // receiver
  beam(ctx, n, t, 0.14, 0.48, 0.03, 0.075); // barrel
  // big arch carry handle
  ctx.beginPath();
  ctx.moveTo(...p(-0.18, -0.02));
  ctx.lineTo(...p(-0.12, -0.2));
  ctx.lineTo(...p(0.06, -0.2));
  ctx.lineTo(...p(0.12, -0.02));
  ctx.closePath();
  ctx.fillStyle = t.poly;
  ctx.fill();
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = n.p(1, 0)[0] * 0.012;
  ctx.stroke();
  fillPoly(ctx, n, [[-0.02, 0.11], [0.08, 0.11], [0.08, 0.27], [-0.02, 0.27]], t.poly, t.edge); // bullpup mag
  fillPoly(ctx, n, [[0.06, 0.12], [0.14, 0.12], [0.16, 0.23], [0.06, 0.23]], t.grip, t.edge); // forward grip
}

// Galil: AK-style curved magazine + folding wire stock.
function drawGalil(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { wood: '#8a5a34', woodLight: '#a76d40' });
  const w = n.p(1, 0)[0] * 0.045;
  ctx.lineCap = 'round';
  lineN(ctx, n, t.wood, w, -0.46, -0.05, -0.46, 0.16);
  lineN(ctx, n, t.woodLight, w * 0.5, -0.45, -0.04, -0.45, 0.12);
  lineN(ctx, n, t.wood, w, -0.32, 0.02, -0.46, 0.16);
  lineN(ctx, n, t.wood, w, -0.32, 0.02, -0.44, -0.05);
  ctx.lineCap = 'butt';
  beam(ctx, n, t, -0.32, 0.18, -0.03, 0.08); // receiver
  fillPoly(ctx, n, [[-0.3, -0.05], [-0.12, -0.05], [-0.1, 0.02], [-0.3, 0.02]], t.wood, t.edge); // handguard
  beam(ctx, n, t, 0.16, 0.44, 0.0, 0.045); // barrel
  rect(ctx, n, 0.38, -0.07, 0.026, 0.07, t.metal); // front sight
  curvedBlock(ctx, n, t, [[0.0, 0.075], [0.11, 0.075]], [[0.12, 0.27], [0.16, 0.27], [0.1, 0.055]], t.body);
  fillPoly(ctx, n, [[-0.17, 0.075], [-0.09, 0.075], [-0.07, 0.2], [-0.17, 0.2]], t.grip, t.edge);
}

// SG552: compact rifle with an integrated scope block.
function drawSg552(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.44, -0.3, 0.0, 0.09); // stock
  beam(ctx, n, t, -0.3, 0.18, -0.02, 0.09); // receiver
  fillPoly(ctx, n, [[-0.12, -0.14], [0.08, -0.14], [0.08, -0.05], [-0.12, -0.05]], t.poly, t.edge); // scope block
  beam(ctx, n, t, 0.18, 0.44, 0.0, 0.04); // barrel
  rect(ctx, n, 0.34, -0.06, 0.026, 0.06, t.metal); // front sight
  fillPoly(ctx, n, [[0.0, 0.09], [0.1, 0.09], [0.1, 0.23], [0.0, 0.23]], t.poly, t.edge); // straight mag
  fillPoly(ctx, n, [[-0.16, 0.09], [-0.08, 0.09], [-0.06, 0.2], [-0.16, 0.2]], t.grip, t.edge);
}

// AUG: bullpup with a prominent integrated scope on the receiver.
function drawAug(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  beam(ctx, n, t, -0.16, 0.12, 0.0, 0.11); // receiver
  beam(ctx, n, t, 0.12, 0.48, 0.03, 0.075); // barrel
  fillPoly(ctx, n, [[-0.1, -0.17], [0.14, -0.17], [0.14, -0.08], [-0.1, -0.08]], t.glass, t.edge); // integrated scope
  rect(ctx, n, -0.02, -0.18, 0.025, 0.2, t.metal); // mount
  fillPoly(ctx, n, [[-0.12, 0.11], [-0.02, 0.11], [-0.02, 0.27], [-0.12, 0.27]], t.poly, t.edge); // bullpup mag
  fillPoly(ctx, n, [[0.06, 0.12], [0.15, 0.12], [0.17, 0.22], [0.06, 0.22]], t.grip, t.edge); // forward grip
}

// Generic rifle (kept for the old `rifle` kind).
function drawRifle(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.48, -0.32, 0.02, 0.14); // stock
  beam(ctx, n, t, -0.32, 0.3, 0.0, 0.14); // body
  beam(ctx, n, t, 0.3, 0.5, 0.035, 0.095); // barrel
  curvedBlock(ctx, n, t, [[0.02, 0.14], [0.12, 0.14]], [[0.16, 0.3], [0.05, 0.3]], t.body); // mag
  fillPoly(ctx, n, [[-0.2, 0.14], [-0.12, 0.14], [-0.1, 0.26], [-0.2, 0.26]], t.grip, t.edge);
  fillPoly(ctx, n, [[0.14, -0.09], [0.24, -0.09], [0.24, 0.0], [0.14, 0.0]], t.poly, t.edge); // handguard
}

/* ─── SMG family ──────────────────────────────────────────────────────── */

// P90: bullpup with the flat top-loaded magazine strip.
function drawP90(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  // One continuous bullpup shell, seen square-on from the side.
  fillPoly(ctx, n, [[-0.34, -0.075], [0.29, -0.075], [0.33, -0.025], [0.25, 0.075], [0.13, 0.15], [-0.16, 0.15], [-0.32, 0.075]], t.poly, t.edge);
  fillPoly(ctx, n, [[-0.3, -0.06], [0.27, -0.06], [0.27, -0.025], [-0.28, -0.025]], t.polyLight);
  beam(ctx, n, t, 0.29, 0.49, -0.025, 0.02); // short barrel
  // Flat top-loaded magazine locked directly onto the receiver.
  fillPoly(ctx, n, [[-0.24, -0.155], [0.3, -0.155], [0.3, -0.075], [-0.24, -0.075]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.21, -0.145], [0.27, -0.145], [0.27, -0.12], [-0.21, -0.12]], t.bodyLight);
  fillPoly(ctx, n, [[-0.23, 0.12], [-0.1, 0.12], [-0.07, 0.25], [-0.22, 0.25]], t.grip, t.edge); // rear grip
  fillPoly(ctx, n, [[0.08, 0.115], [0.17, 0.115], [0.19, 0.225], [0.08, 0.225]], t.grip, t.edge); // foregrip
  triggerAssembly(ctx, n, t, 0.19, 0.015, 0.115, 0.11);
  rect(ctx, n, 0.31, -0.055, 0.025, 0.055, t.metal); // front sight block
}

// MP5: slim receiver, curved magazine, fixed slim stock, front sight.
function drawMp5(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.46, -0.3, 0.02, 0.08); // fixed stock
  beam(ctx, n, t, -0.3, 0.2, -0.02, 0.07); // receiver
  beam(ctx, n, t, 0.2, 0.44, 0.0, 0.04); // barrel
  rect(ctx, n, 0.34, -0.06, 0.026, 0.06, t.metal); // front sight
  curvedBlock(ctx, n, t, [[0.04, 0.07], [0.12, 0.07]], [[0.14, 0.26], [0.05, 0.26]], t.body); // curved mag
  fillPoly(ctx, n, [[-0.14, 0.07], [-0.06, 0.07], [-0.04, 0.2], [-0.14, 0.2]], t.grip, t.edge);
}

// UMP-45: blocky square receiver, straight vertical magazine.
function drawUmp45(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.32, 0.2, -0.05, 0.09); // boxy body
  beam(ctx, n, t, 0.2, 0.46, 0.0, 0.045); // barrel
  fillPoly(ctx, n, [[0.02, 0.09], [0.13, 0.09], [0.12, 0.29], [0.02, 0.29]], t.poly, t.edge); // straight mag
  fillPoly(ctx, n, [[-0.14, 0.09], [-0.05, 0.09], [-0.03, 0.22], [-0.14, 0.22]], t.grip, t.edge);
}

// MAC-10: boxy receiver, top charging handle, front sling loop, straight mag.
function drawMac10(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.28, 0.22, -0.07, 0.08); // boxy body
  beam(ctx, n, t, 0.22, 0.42, 0.0, 0.05); // short barrel
  rect(ctx, n, -0.2, -0.11, 0.1, 0.045, t.metal); // top charging handle
  ringN(ctx, n, t.metal, 0.18, -0.015, 0.025, 0.012); // small front sling loop
  fillPoly(ctx, n, [[0.0, 0.08], [0.1, 0.08], [0.1, 0.26], [0.0, 0.26]], t.poly, t.edge); // straight mag
  triggerAssembly(ctx, n, t, -0.075, 0.065, 0.11, 0.1);
}

// TMP: small body, forward vertical grip, straight magazine.
function drawTmp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.22, 0.2, -0.03, 0.07); // body
  beam(ctx, n, t, 0.2, 0.4, 0.0, 0.04); // barrel
  fillPoly(ctx, n, [[0.12, 0.07], [0.18, 0.07], [0.2, 0.22], [0.12, 0.22]], t.grip, t.edge); // foregrip
  fillPoly(ctx, n, [[-0.06, 0.07], [0.03, 0.07], [0.03, 0.24], [-0.06, 0.24]], t.poly, t.edge); // straight mag
  fillPoly(ctx, n, [[-0.18, 0.07], [-0.11, 0.07], [-0.09, 0.19], [-0.18, 0.19]], t.grip, t.edge);
}

// MP7: compact, angled magazine, short foregrip.
function drawMp7(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.22, 0.22, -0.03, 0.08); // body
  beam(ctx, n, t, 0.22, 0.42, 0.0, 0.05); // short barrel
  fillPoly(ctx, n, [[0.0, 0.08], [0.08, 0.08], [0.14, 0.26], [0.04, 0.26]], t.poly, t.edge); // angled mag
  fillPoly(ctx, n, [[0.1, 0.08], [0.16, 0.08], [0.18, 0.22], [0.1, 0.22]], t.grip, t.edge); // foregrip
  fillPoly(ctx, n, [[-0.16, 0.08], [-0.08, 0.08], [-0.06, 0.2], [-0.16, 0.2]], t.grip, t.edge);
}

// MP9: compact with folding stock and vertical magazine.
function drawMp9(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.22, 0.22, -0.03, 0.08); // body
  beam(ctx, n, t, 0.22, 0.42, 0.0, 0.045); // barrel
  fillPoly(ctx, n, [[-0.02, 0.08], [0.08, 0.08], [0.08, 0.25], [-0.02, 0.25]], t.poly, t.edge); // vertical mag
  fillPoly(ctx, n, [[-0.16, 0.08], [-0.08, 0.08], [-0.06, 0.2], [-0.16, 0.2]], t.grip, t.edge);
  const w = n.p(1, 0)[0] * 0.045;
  lineN(ctx, n, t.poly, w, -0.44, 0.0, -0.44, 0.14); // folding stock
  lineN(ctx, n, t.polyLight, w * 0.5, -0.44, 0.0, -0.43, 0.12);
  lineN(ctx, n, t.poly, w, -0.44, 0.0, -0.3, 0.03);
  lineN(ctx, n, t.poly, w, -0.44, 0.14, -0.3, 0.1);
}

// Generic SMG (kept for the old `smg` kind).
function drawSmg(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.34, 0.32, 0.0, 0.16); // body
  beam(ctx, n, t, 0.32, 0.48, 0.04, 0.11); // barrel
  const w = n.p(1, 0)[0] * 0.035;
  lineN(ctx, n, t.poly, w, -0.34, 0.04, -0.5, -0.08);
  lineN(ctx, n, t.polyLight, w * 0.5, -0.34, 0.04, -0.48, -0.06);
  lineN(ctx, n, t.poly, w, -0.5, -0.08, -0.5, 0.22);
  lineN(ctx, n, t.poly, w, -0.5, 0.22, -0.34, 0.16);
  fillPoly(ctx, n, [[0.06, 0.16], [0.15, 0.16], [0.15, 0.4], [0.06, 0.4]], t.poly, t.edge); // vertical mag
  fillPoly(ctx, n, [[-0.2, 0.16], [-0.12, 0.16], [-0.1, 0.32], [-0.2, 0.32]], t.grip, t.edge);
}

/* ─── pistol family ───────────────────────────────────────────────────── */

// Glock: boxy compact slide, square frame, slight grip angle.
function drawGlock(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.3, -0.13], [0.2, -0.13], [0.22, -0.095], [0.22, -0.025], [-0.3, -0.025]], t.body, t.edge); // slide
  fillPoly(ctx, n, [[-0.27, -0.12], [0.18, -0.12], [0.18, -0.095], [-0.27, -0.095]], t.bodyLight); // slide plane
  fillPoly(ctx, n, [[-0.28, -0.025], [0.12, -0.025], [0.1, 0.04], [-0.28, 0.04]], t.poly, t.edge); // frame
  fillPoly(ctx, n, [[-0.24, 0.035], [-0.08, 0.035], [-0.055, 0.31], [-0.23, 0.31]], t.grip, t.edge); // angled grip
  rect(ctx, n, -0.035, -0.105, 0.11, 0.045, t.barrelLight); // ejection port
  rect(ctx, n, 0.18, -0.1, 0.035, 0.05, t.barrel); // muzzle face
  rect(ctx, n, -0.26, -0.155, 0.025, 0.025, t.metal); // rear sight
  rect(ctx, n, 0.15, -0.15, 0.02, 0.02, t.metal); // front sight
  serrations(ctx, n, t.edge, -0.22, -0.115, -0.04, 4, 0.022);
  triggerAssembly(ctx, n, t, 0.015, 0.025, 0.145, 0.135);
}

// USP-S: boxy slide with a long suppressor cylinder.
function drawUsp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.31, -0.125], [0.08, -0.125], [0.1, -0.085], [0.1, -0.025], [-0.31, -0.025]], t.body, t.edge); // slide
  fillPoly(ctx, n, [[-0.28, -0.115], [0.07, -0.115], [0.07, -0.09], [-0.28, -0.09]], t.bodyLight);
  fillPoly(ctx, n, [[-0.29, -0.025], [0.08, -0.025], [0.07, 0.04], [-0.29, 0.04]], t.poly, t.edge); // frame
  fillPoly(ctx, n, [[0.08, -0.095], [0.48, -0.095], [0.48, 0.005], [0.08, 0.005]], t.barrel, t.edge); // suppressor
  fillPoly(ctx, n, [[0.1, -0.085], [0.47, -0.085], [0.47, -0.06], [0.1, -0.06]], t.barrelLight);
  rect(ctx, n, 0.16, -0.09, 0.018, 0.09, t.edge);
  rect(ctx, n, 0.36, -0.09, 0.018, 0.09, t.edge);
  fillPoly(ctx, n, [[-0.24, 0.035], [-0.055, 0.035], [-0.035, 0.3], [-0.22, 0.3]], t.grip, t.edge);
  rect(ctx, n, -0.07, -0.102, 0.1, 0.04, t.barrelLight); // ejection port
  serrations(ctx, n, t.edge, -0.25, -0.11, -0.04, 4, 0.022);
  triggerAssembly(ctx, n, t, 0.025, 0.025, 0.145, 0.135);
}

// P250: rounded compact pistol.
function drawP250(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.27, -0.12], [0.15, -0.12], [0.18, -0.08], [0.16, -0.02], [-0.27, -0.02]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.24, -0.11], [0.13, -0.11], [0.13, -0.085], [-0.24, -0.085]], t.bodyLight);
  fillPoly(ctx, n, [[-0.25, -0.02], [0.11, -0.02], [0.09, 0.04], [-0.25, 0.04]], t.poly, t.edge);
  fillPoly(ctx, n, [[-0.205, 0.035], [-0.045, 0.035], [-0.04, 0.285], [-0.2, 0.285]], t.grip, t.edge);
  rect(ctx, n, -0.02, -0.1, 0.09, 0.04, t.barrelLight);
  rect(ctx, n, -0.23, -0.145, 0.02, 0.025, t.metal);
  rect(ctx, n, 0.11, -0.14, 0.018, 0.02, t.metal);
  serrations(ctx, n, t.edge, -0.21, -0.105, -0.035, 3, 0.024);
  triggerAssembly(ctx, n, t, 0.035, 0.025, 0.14, 0.13);
}

// P228: rounded, slightly longer compact.
function drawP228(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.3, 0.12, -0.11, -0.02);
  fillPoly(ctx, n, [[-0.28, -0.02], [0.04, -0.02], [0.04, 0.03], [-0.28, 0.03]], t.poly, t.edge);
  fillPoly(ctx, n, [[-0.22, 0.03], [-0.06, 0.03], [-0.06, 0.29], [-0.22, 0.29]], t.grip, t.edge);
  ringN(ctx, n, t.metal, 0.06, 0.12, 0.085, 0.045);
}

// Desert Eagle: long heavy slide, large grip, big barrel.
function drawDeagle(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.31, -0.15], [0.27, -0.15], [0.34, -0.095], [0.34, -0.025], [-0.31, -0.025]], t.barrel, t.edge); // heavy slide
  fillPoly(ctx, n, [[-0.27, -0.14], [0.25, -0.14], [0.29, -0.105], [-0.27, -0.105]], t.barrelLight);
  fillPoly(ctx, n, [[-0.27, -0.025], [0.13, -0.025], [0.1, 0.045], [-0.27, 0.045]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.215, 0.04], [-0.015, 0.04], [0.015, 0.32], [-0.2, 0.32]], t.grip, t.edge);
  fillPoly(ctx, n, [[-0.03, -0.125], [0.13, -0.125], [0.1, -0.075], [-0.03, -0.075]], t.metal, t.edge); // chamber
  rect(ctx, n, 0.3, -0.115, 0.035, 0.065, t.edge);
  rect(ctx, n, -0.25, -0.177, 0.025, 0.027, t.metal);
  rect(ctx, n, 0.23, -0.172, 0.02, 0.022, t.metal);
  serrations(ctx, n, t.edge, -0.24, -0.135, -0.045, 4, 0.025);
  triggerAssembly(ctx, n, t, 0.055, 0.025, 0.16, 0.145);
}

// FN57: long square slide, thin high-capacity grip.
function drawFn57(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.3, -0.125], [0.19, -0.125], [0.22, -0.085], [0.2, -0.02], [-0.3, -0.02]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.27, -0.115], [0.17, -0.115], [0.18, -0.09], [-0.27, -0.09]], t.bodyLight);
  fillPoly(ctx, n, [[-0.27, -0.02], [0.13, -0.02], [0.11, 0.04], [-0.27, 0.04]], t.poly, t.edge);
  fillPoly(ctx, n, [[-0.18, 0.035], [-0.035, 0.035], [-0.025, 0.31], [-0.17, 0.31]], t.grip, t.edge);
  rect(ctx, n, 0.0, -0.103, 0.105, 0.04, t.barrelLight);
  rect(ctx, n, -0.27, -0.15, 0.02, 0.025, t.metal);
  rect(ctx, n, 0.15, -0.145, 0.018, 0.02, t.metal);
  serrations(ctx, n, t.edge, -0.245, -0.11, -0.04, 4, 0.022);
  triggerAssembly(ctx, n, t, 0.055, 0.025, 0.145, 0.135);
}

// Tec-9: boxy body with a long forward-tilted straight magazine.
function drawTec9(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.26, 0.16, -0.06, 0.06); // boxy body
  beam(ctx, n, t, 0.18, 0.42, -0.03, 0.03); // barrel
  fillPoly(ctx, n, [[-0.06, 0.06], [0.04, 0.06], [0.12, 0.3], [0.0, 0.3]], t.poly, t.edge); // forward-tilt long mag
}

// CZ75: mid double-stack with rounded slide and exposed hammer.
function drawCz75(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.3, 0.12, -0.11, -0.02);
  fillPoly(ctx, n, [[-0.28, -0.02], [0.06, -0.02], [0.06, 0.04], [-0.28, 0.04]], t.poly, t.edge);
  rect(ctx, n, -0.32, -0.12, 0.04, 0.05, t.metal); // hammer spur
  fillPoly(ctx, n, [[-0.22, 0.04], [-0.06, 0.04], [-0.05, 0.29], [-0.22, 0.29]], t.grip, t.edge);
  ringN(ctx, n, t.metal, 0.07, 0.12, 0.085, 0.045);
}

// Dual Berettas (Beretta 92 style): exposed barrel over the open-top slide.
function drawElite(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.28, -0.06], [0.12, -0.06], [0.12, 0.0], [-0.28, 0.0]], t.poly, t.edge); // slide
  fillPoly(ctx, n, [[-0.28, -0.01], [0.08, -0.01], [0.08, 0.045], [-0.28, 0.045]], t.body, t.edge); // frame
  fillPoly(ctx, n, [[-0.02, -0.11], [0.42, -0.11], [0.42, -0.065], [-0.02, -0.065]], t.barrel, t.edge); // exposed barrel
  rect(ctx, n, 0.4, -0.1, 0.05, 0.03, t.barrelLight); // muzzle
  fillPoly(ctx, n, [[-0.2, 0.04], [-0.04, 0.04], [-0.04, 0.29], [-0.2, 0.29]], t.grip, t.edge);
  ringN(ctx, n, t.metal, 0.08, 0.13, 0.085, 0.045);
}

// Generic pistol (kept for the old `pistol` kind).
function drawPistol(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.36, 0.24, -0.06, 0.1); // slide
  beam(ctx, n, t, 0.24, 0.38, -0.02, 0.04); // barrel
  fillPoly(ctx, n, [[-0.18, 0.1], [-0.06, 0.1], [-0.02, 0.34], [-0.18, 0.38]], t.grip, t.edge);
  ringN(ctx, n, t.metal, 0.04, 0.14, 0.09, 0.035);
}

/* ─── shotgun family ──────────────────────────────────────────────────── */

// Generic pump shotgun: stock, long barrel, under-barrel tube, pump.
function drawShotgun(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.46, 0.0], [-0.26, 0.0], [-0.26, 0.13], [-0.46, 0.12]], t.wood, t.edge); // stock
  beam(ctx, n, t, -0.26, -0.02, 0.02, 0.12); // receiver
  beam(ctx, n, t, 0.0, 0.48, 0.03, 0.08); // barrel
  beam(ctx, n, t, 0.0, 0.42, 0.09, 0.13); // tube
  fillPoly(ctx, n, [[0.16, 0.07], [0.3, 0.07], [0.3, 0.14], [0.16, 0.14]], t.woodLight, t.edge); // pump
  fillPoly(ctx, n, [[-0.16, 0.12], [-0.08, 0.12], [-0.06, 0.23], [-0.16, 0.23]], t.grip, t.edge);
}

// M3 (pump shotgun): prominent under-barrel tube + wooden pump.
function drawM3(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono, { wood: '#7a4f2e', woodLight: '#96613a' });
  fillPoly(ctx, n, [[-0.46, 0.0], [-0.26, 0.0], [-0.26, 0.13], [-0.46, 0.12]], t.wood, t.edge); // stock
  fillPoly(ctx, n, [[-0.44, 0.02], [-0.3, 0.02], [-0.3, 0.06], [-0.44, 0.06]], t.woodLight);
  beam(ctx, n, t, -0.26, -0.02, 0.02, 0.12); // receiver
  beam(ctx, n, t, -0.02, 0.48, 0.03, 0.08); // long barrel
  beam(ctx, n, t, -0.02, 0.44, 0.1, 0.15); // tube
  fillPoly(ctx, n, [[0.14, 0.09], [0.3, 0.09], [0.3, 0.16], [0.14, 0.16]], t.wood, t.edge); // wooden pump
  fillPoly(ctx, n, [[-0.16, 0.12], [-0.08, 0.12], [-0.06, 0.23], [-0.16, 0.23]], t.grip, t.edge);
}

// XM1014 (auto shotgun): boxy receiver, tube mag, thin stock.
function drawXm1014(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.44, -0.28, 0.0, 0.09); // thin stock
  beam(ctx, n, t, -0.28, 0.12, -0.04, 0.09); // boxy receiver
  beam(ctx, n, t, 0.12, 0.48, 0.02, 0.065); // barrel
  beam(ctx, n, t, 0.1, 0.44, 0.08, 0.125); // tube
  rect(ctx, n, 0.3, -0.06, 0.026, 0.08, t.metal); // front sight
  fillPoly(ctx, n, [[-0.16, 0.09], [-0.08, 0.09], [-0.06, 0.2], [-0.16, 0.2]], t.grip, t.edge);
}

/* ─── MG family ───────────────────────────────────────────────────────── */

// Generic machine gun: long barrel, box magazine, stock.
function drawMg(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  beam(ctx, n, t, -0.44, -0.3, 0.0, 0.13); // stock
  beam(ctx, n, t, -0.3, 0.22, -0.05, 0.1); // big receiver
  beam(ctx, n, t, 0.22, 0.46, 0.0, 0.05); // barrel
  rect(ctx, n, 0.34, -0.06, 0.026, 0.06, t.metal); // front sight
  fillPoly(ctx, n, [[-0.04, 0.1], [0.08, 0.1], [0.08, 0.3], [-0.04, 0.3]], t.poly, t.edge); // box mag
  fillPoly(ctx, n, [[-0.16, 0.1], [-0.07, 0.1], [-0.05, 0.24], [-0.16, 0.24]], t.grip, t.edge);
}

// M249 SAW: big receiver, ammo box, bipod, long barrel.
function drawM249(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {

  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.46, -0.04], [-0.3, -0.04], [-0.3, 0.1], [-0.46, 0.08]], t.poly, t.edge); // stock
  beam(ctx, n, t, -0.32, 0.2, -0.08, 0.09); // bulky receiver
  beam(ctx, n, t, 0.2, 0.46, 0.0, 0.05); // barrel
  rect(ctx, n, 0.4, -0.06, 0.026, 0.06, t.metal); // front sight
  fillPoly(ctx, n, [[-0.06, 0.09], [0.1, 0.09], [0.1, 0.27], [-0.06, 0.27]], t.olive, t.edge); // ammo box
  fillPoly(ctx, n, [[-0.04, 0.2], [0.1, 0.2], [0.1, 0.24], [-0.04, 0.24]], t.oliveLight); // belt hint
  const w = n.p(1, 0)[0] * 0.05;
  ctx.lineCap = 'round';
  lineN(ctx, n, t.metal, w, 0.26, 0.04, 0.16, 0.32); // bipod
  lineN(ctx, n, t.metal, w, 0.26, 0.04, 0.36, 0.32);
  ctx.lineCap = 'butt';
  fillPoly(ctx, n, [[-0.16, 0.09], [-0.07, 0.09], [-0.05, 0.23], [-0.16, 0.23]], t.grip, t.edge);
}

/* ─── gloves + sniper family reuses ───────────────────────────────────── */

// Sport glove closed fist + wrist cuff.
function drawGloves(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const { p } = n;
  const t = tone(color, mono, { poly: '#2c3646', polyLight: '#435064' });
  const px = n.p(1, 0)[0];
  ctx.beginPath();
  ctx.arc(...p(0.06, -0.05), px * 0.24, Math.PI * 0.85, Math.PI * 2 - Math.PI * 0.15, false);
  ctx.closePath();
  ctx.fillStyle = t.poly;
  ctx.fill();
  rect(ctx, n, -0.32, -0.16, 0.16, 0.2, t.polyLight); // thumb
  rect(ctx, n, -0.3, 0.02, 0.62, 0.2, t.poly); // cuff
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  for (const fx of [-0.02, 0.1, 0.22, 0.34]) {
    const [gx] = p(fx, 0);
    ctx.fillRect(gx - px * 0.02, -px * 0.24, px * 0.04, px * 0.3);
  }
  ctx.restore();
}

// Generic sniper (kept for the old `sniper` kind).
function drawSniper(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  beam(ctx, n, t, -0.46, -0.3, 0.02, 0.16); // stock
  beam(ctx, n, t, -0.3, 0.32, 0.02, 0.18); // body
  beam(ctx, n, t, 0.32, 0.5, 0.055, 0.125); // barrel
  fillPoly(ctx, n, [[0.0, -0.16], [0.22, -0.16], [0.22, -0.02], [0.0, -0.02]], t.glass, t.edge); // scope
  rect(ctx, n, 0.02, -0.2, 0.02, 0.22, t.metal);
  rect(ctx, n, 0.2, -0.2, 0.02, 0.22, t.metal);
  fillPoly(ctx, n, [[-0.16, 0.18], [-0.07, 0.18], [-0.05, 0.32], [-0.16, 0.32]], t.grip, t.edge);
  fillPoly(ctx, n, [[0.06, 0.18], [0.16, 0.18], [0.15, 0.3], [0.06, 0.3]], t.poly, t.edge); // mag
}
