/*
 * Hand-drawn per-weapon icons for the Gacha game — no image assets.
 *
 * drawWeaponIcon(ctx, iconId, cx, cy, opts) renders one orthographic top
 * view — the 俯视图 from an engineering three-view drawing (三视图): the
 * camera looks straight down at the weapon, the muzzle points +x, and the
 * spine sits on y=0. No perspective, no three-quarter camera angle. From
 * above you see barrels, receivers, stocks, scope tubes, sights, and
 * top-mounted hardware; bottom-mounted magazines and grips stay hidden,
 * exactly like a blueprint. Knives and gloves keep their flat-face
 * treatment because a true edge-on top view would be illegible.
 *
 * Multi-tone steel, wood, polymer, mounts, and sights keep each weapon
 * recognizable while preserving a clean outer silhouette. Coordinates are
 * normalized to -0.5..0.5 (gun points +x). Every profile is supersampled
 * into a cached offscreen canvas and smoothly reduced, so the same art
 * stays crisp from tiny reel thumbnails up to large result cards.
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

/** Render a supersampled flat top-view profile centered at (cx, cy). */
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

/**
 * A machined part seen from above: filled slab with a light bevel along
 * the upper (-y) edge and a hairline shade along the lower edge. Light
 * comes from top-left, consistently across every icon.
 */
function part(
  ctx: CanvasRenderingContext2D, n: Norm, t: Org,
  x0: number, x1: number, y0: number, y1: number,
  fill?: string, light?: string,
) {
  fillPoly(ctx, n, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill ?? t.body, t.edge);
  const hl = Math.min(0.012, (y1 - y0) * 0.3);
  fillPoly(ctx, n, [[x0, y0], [x1, y0], [x1, y0 + hl], [x0, y0 + hl]], light ?? t.bodyLight);
  const sh = Math.min(0.009, (y1 - y0) * 0.22);
  ctx.save();
  ctx.globalAlpha *= 0.35;
  fillPoly(ctx, n, [[x0, y1 - sh], [x1, y1 - sh], [x1, y1], [x0, y1]], t.edge);
  ctx.restore();
}

/** Slim barrel tube centered on the spine, with a bright bore highlight. */
function barrel(
  ctx: CanvasRenderingContext2D, n: Norm, t: Org,
  x0: number, x1: number, halfWidth: number,
) {
  part(ctx, n, t, x0, x1, -halfWidth, halfWidth, t.barrel, t.barrelLight);
  lineN(ctx, n, t.barrelLight, Math.max(0.6, n.p(0.008, 0)[0]), x0 + 0.01, -halfWidth * 0.35, x1 - 0.01, -halfWidth * 0.35);
}

/** Muzzle crown cap at the very tip of the barrel. */
function crown(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x: number, halfWidth: number) {
  rect(ctx, n, x - 0.012, -halfWidth, 0.012, halfWidth * 2, t.metal);
}

/** Iron sight post sitting on the spine (seen from directly above). */
function sightPost(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x: number, w = 0.022) {
  rect(ctx, n, x - w / 2, -w / 2, w, w, t.metal);
  rect(ctx, n, x - w / 4, -w / 4, w / 2, w / 2, t.glint);
}

/** Optic on the spine: tube, bell ends, turret, and a lens glint. */
function scopeTop(
  ctx: CanvasRenderingContext2D, n: Norm, t: Org,
  x0: number, x1: number, r: number,
) {
  part(ctx, n, t, x0, x1, -r, r, t.glass, t.glint);
  part(ctx, n, t, x0 - 0.028, x0, -r * 1.12, r * 1.12, t.glass, t.glint); // ocular bell
  part(ctx, n, t, x1, x1 + 0.034, -r * 1.22, r * 1.22, t.glass, t.glint); // objective bell
  rect(ctx, n, (x0 + x1) / 2 - 0.014, -r * 0.5, 0.028, r, t.metal); // turret block
  lineN(ctx, n, t.glint, Math.max(0.6, n.p(0.007, 0)[0]), x0 + 0.01, -r * 0.45, x1 - 0.01, -r * 0.45);
}

/** Slide serration cuts visible from above at both rear corners. */
function rearSerrations(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x: number, halfWidth: number, count = 3) {
  const px = n.p(1, 0)[0];
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = Math.max(0.55, px * 0.008);
  for (let i = 0; i < count; i++) {
    const sx = x + i * 0.024;
    ctx.beginPath();
    ctx.moveTo(...n.p(sx, -halfWidth));
    ctx.lineTo(...n.p(sx + 0.011, -halfWidth + 0.017));
    ctx.moveTo(...n.p(sx, halfWidth));
    ctx.lineTo(...n.p(sx + 0.011, halfWidth - 0.017));
    ctx.stroke();
  }
}

/** Pistol rear sight: block spanning the slide width with a center notch. */
function rearSight(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x: number, halfWidth: number) {
  rect(ctx, n, x, -halfWidth * 0.82, 0.03, halfWidth * 1.64, t.metal);
  rect(ctx, n, x + 0.006, -0.009, 0.02, 0.018, t.edge);
}

/** Ejection port cutout on the +y flank of a slide or receiver. */
function ejectionPort(ctx: CanvasRenderingContext2D, n: Norm, t: Org, x: number, w: number, flank: number) {
  rect(ctx, n, x, flank - 0.018, w, 0.02, t.edge);
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

/** Stroke a circle ring (finger ring, sight drum, reflex window). */
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

/** Filled disc (thumb holes, pivot pins, bolt-handle balls). */
function discN(
  ctx: CanvasRenderingContext2D, n: Norm, color: string,
  cx: number, cy: number, radius: number,
) {
  const px = n.p(1, 0)[0];
  ctx.beginPath();
  ctx.arc(cx * px, cy * px, Math.abs(radius) * px, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
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

/* ─── knife family (flat-face view — an edge-on top view is illegible) ── */

// Straight knife: slim grip, small guard, tapering blade pointing right.
function drawKnife(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.44, -0.03], [-0.2, -0.05], [-0.2, 0.06], [-0.44, 0.045]], t.grip, t.edge); // grip
  rect(ctx, n, -0.215, -0.055, 0.035, 0.14, t.metal); // guard
  fillPoly(ctx, n, [[-0.175, -0.04], [0.43, -0.18], [0.43, -0.06], [-0.175, 0.05]], t.body, t.edge); // blade
  fillPoly(ctx, n, [[-0.175, -0.04], [0.43, -0.18], [0.43, -0.155], [-0.16, -0.022]], t.bodyLight); // spine highlight
  lineN(ctx, n, t.metal, Math.max(0.5, n.p(0.007, 0)[0]), -0.14, -0.005, 0.36, -0.115); // fuller groove
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
  lineN(ctx, n, t.metal, Math.max(0.5, n.p(0.007, 0)[0]), -0.01, 0.0, 0.38, -0.095); // fuller groove
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

// AWP: olive stock with cheek riser, huge scope tube, thick bull barrel.
function drawAwp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  part(ctx, n, t, -0.475, -0.44, -0.066, 0.066, t.poly, t.polyLight); // butt pad
  fillPoly(ctx, n, [[-0.46, -0.062], [-0.3, -0.048], [-0.3, 0.048], [-0.46, 0.062]], t.olive, t.edge); // stock
  fillPoly(ctx, n, [[-0.46, -0.062], [-0.3, -0.048], [-0.3, -0.036], [-0.46, -0.05]], t.oliveLight);
  part(ctx, n, t, -0.4, -0.32, -0.024, 0.024, t.olive, t.oliveLight); // cheek riser on spine
  part(ctx, n, t, -0.3, 0.1, -0.048, 0.048); // receiver
  // bolt handle: stem + ball sticking out of the +y flank
  lineN(ctx, n, t.metal, Math.max(1, n.p(0.014, 0)[0]), -0.06, 0.048, -0.048, 0.088);
  discN(ctx, n, t.metal, -0.045, 0.098, 0.016);
  scopeTop(ctx, n, t, -0.05, 0.28, 0.036); // big optic
  barrel(ctx, n, t, 0.1, 0.48, 0.028); // bull barrel
  lineN(ctx, n, t.barrelLight, Math.max(0.5, n.p(0.006, 0)[0]), 0.13, 0.012, 0.45, 0.012); // flute
  crown(ctx, n, t, 0.48, 0.028);
}

// Scout: light bolt-action — thin barrel, small scope, skeletal stock.
function drawScout(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  fillPoly(ctx, n, [[-0.44, -0.046], [-0.28, -0.04], [-0.28, 0.04], [-0.44, 0.046]], t.olive, t.edge); // slim stock
  part(ctx, n, t, -0.28, 0.08, -0.04, 0.04); // receiver
  lineN(ctx, n, t.metal, Math.max(0.9, n.p(0.012, 0)[0]), -0.08, 0.04, -0.072, 0.075); // bolt stem
  discN(ctx, n, t.metal, -0.068, 0.084, 0.013);
  scopeTop(ctx, n, t, 0.0, 0.16, 0.026); // small forward scope
  barrel(ctx, n, t, 0.08, 0.48, 0.017);
  sightPost(ctx, n, t, 0.45);
  crown(ctx, n, t, 0.48, 0.017);
}

// G3SG1 / SG550: auto-sniper — wood-toned stock, compact scope, muzzle brake.
function drawAutoSniper(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean, variant: number) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.46, -0.3, -0.055, 0.055, t.poly, t.polyLight); // stock
  part(ctx, n, t, -0.3, 0.1, -0.05, 0.05); // receiver
  scopeTop(ctx, n, t, -0.03, 0.13, 0.024); // compact scope
  if (variant === 1) {
    part(ctx, n, t, 0.1, 0.28, -0.042, 0.042, t.poly, t.polyLight); // SG550 ribbed handguard
    for (let i = 0; i < 4; i++) lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.14 + i * 0.035, -0.04, 0.14 + i * 0.035, 0.04);
    barrel(ctx, n, t, 0.28, 0.42, 0.016);
  } else {
    barrel(ctx, n, t, 0.1, 0.42, 0.018);
  }
  sightPost(ctx, n, t, 0.38);
  part(ctx, n, t, 0.42, 0.47, -0.026, 0.026, t.barrel, t.barrelLight); // muzzle brake
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.445, -0.026, 0.445, 0.026);
}

/* ─── rifle family ────────────────────────────────────────────────────── */

// AK-47: wooden stock and handguard, gas tube on the spine, slant brake.
function drawAk(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { wood: '#8a5a34', woodLight: '#a76d40' });
  part(ctx, n, t, -0.485, -0.455, -0.075, 0.075, t.wood, t.woodLight); // butt plate
  fillPoly(ctx, n, [[-0.455, -0.075], [-0.3, -0.052], [-0.3, 0.052], [-0.455, 0.075]], t.wood, t.edge); // tapered stock
  fillPoly(ctx, n, [[-0.455, -0.075], [-0.3, -0.052], [-0.3, -0.04], [-0.455, -0.062]], t.woodLight);
  part(ctx, n, t, -0.3, 0.1, -0.052, 0.052); // receiver cover
  lineN(ctx, n, t.bodyLight, Math.max(0.5, n.p(0.007, 0)[0]), -0.27, -0.03, 0.07, -0.03); // cover rib
  lineN(ctx, n, t.bodyLight, Math.max(0.5, n.p(0.007, 0)[0]), -0.27, 0.03, 0.07, 0.03);
  rect(ctx, n, -0.13, -0.032, 0.045, 0.064, t.metal); // rear sight block
  // bulbous wooden handguard
  fillPoly(ctx, n, [[-0.1, -0.056], [0.05, -0.064], [0.16, -0.052], [0.16, 0.052], [0.05, 0.064], [-0.1, 0.056]], t.wood, t.edge);
  fillPoly(ctx, n, [[-0.1, -0.056], [0.05, -0.064], [0.05, -0.05], [-0.1, -0.044]], t.woodLight);
  part(ctx, n, t, -0.06, 0.16, -0.014, 0.014, t.woodLight, t.woodLight); // gas tube on the spine
  barrel(ctx, n, t, 0.16, 0.44, 0.016);
  sightPost(ctx, n, t, 0.4, 0.024);
  ringN(ctx, n, t.metal, 0.4, 0, 0.03, 0.009); // front sight hood ears
  // slant muzzle brake — asymmetric slant cut reads clearly from above
  fillPoly(ctx, n, [[0.44, -0.026], [0.49, -0.026], [0.478, 0.026], [0.44, 0.026]], t.barrel, t.edge);
}

// M4A4 / M4A1 / M4A1-S: buffer-tube stock, carry handle, quad rails.
function drawM4(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean, suppressor: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.475, -0.455, -0.056, 0.056, t.poly, t.polyLight); // butt plate
  part(ctx, n, t, -0.455, -0.28, -0.048, 0.048, t.poly, t.polyLight); // sliding stock
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), -0.42, 0, -0.3, 0); // stock rail groove
  part(ctx, n, t, -0.28, 0.1, -0.05, 0.05); // receiver
  ejectionPort(ctx, n, t, -0.06, 0.085, 0.05); // ejection port on the +y flank
  discN(ctx, n, t.metal, -0.02, -0.05, 0.012); // forward assist
  // carry handle: raised channel on the spine with two locking nuts
  part(ctx, n, t, -0.24, -0.02, -0.02, 0.02, t.poly, t.polyLight);
  rect(ctx, n, -0.2, -0.024, 0.024, 0.048, t.metal);
  rect(ctx, n, -0.07, -0.024, 0.024, 0.048, t.metal);
  // quad-rail handguard with lengthwise rail ridges
  part(ctx, n, t, -0.02, 0.26, -0.056, 0.056, t.poly, t.polyLight);
  for (const ry of [-0.042, -0.02, 0.02, 0.042]) {
    lineN(ctx, n, t.polyLight, Math.max(0.5, n.p(0.006, 0)[0]), 0.0, ry, 0.24, ry);
  }
  rect(ctx, n, 0.262, -0.03, 0.028, 0.06, t.metal); // front sight gas block
  sightPost(ctx, n, t, 0.276);
  barrel(ctx, n, t, 0.29, 0.44, 0.015);
  if (suppressor) {
    part(ctx, n, t, 0.44, 0.56, -0.03, 0.03, t.barrel, t.barrelLight); // smooth suppressor tube
    lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.47, -0.03, 0.47, 0.03);
    part(ctx, n, t, 0.555, 0.57, -0.024, 0.024, t.metal, t.metal); // end cap
  } else {
    part(ctx, n, t, 0.44, 0.48, -0.024, 0.024, t.barrel, t.barrelLight); // birdcage flash hider
    lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.455, -0.024, 0.455, 0.024);
  }
}

// FAMAS: bullpup with the tall arch carry handle as twin spine channels.
function drawFamas(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.345, -0.31, -0.072, 0.072, t.poly, t.polyLight); // wide bullpup butt
  part(ctx, n, t, -0.31, 0.12, -0.062, 0.062, t.poly, t.polyLight); // body
  // carry handle arch: raised channel with a hollow middle
  part(ctx, n, t, -0.18, 0.08, -0.034, 0.034, t.body, t.bodyLight);
  lineN(ctx, n, t.edge, Math.max(0.8, n.p(0.012, 0)[0]), -0.14, 0, 0.04, 0); // handle groove
  barrel(ctx, n, t, 0.12, 0.48, 0.018);
  sightPost(ctx, n, t, 0.44);
  crown(ctx, n, t, 0.48, 0.018);
  rect(ctx, n, -0.3, -0.03, 0.03, 0.06, t.metal); // butt plate seam
}

// Galil: AK-style receiver, wood handguard, folding twin-rail stock.
function drawGalil(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { wood: '#8a5a34', woodLight: '#a76d40' });
  const w = n.p(1, 0)[0] * 0.028;
  ctx.lineCap = 'round';
  lineN(ctx, n, t.metal, w, -0.46, -0.045, -0.32, -0.038); // stock rail upper
  lineN(ctx, n, t.metal, w, -0.46, 0.045, -0.32, 0.038); // stock rail lower
  lineN(ctx, n, t.metal, w * 1.2, -0.465, -0.05, -0.465, 0.05); // butt bar
  ctx.lineCap = 'butt';
  part(ctx, n, t, -0.32, 0.14, -0.05, 0.05); // receiver
  fillPoly(ctx, n, [[-0.08, -0.056], [0.14, -0.056], [0.16, -0.044], [0.16, 0.044], [0.14, 0.056], [-0.08, 0.056]], t.wood, t.edge); // handguard
  fillPoly(ctx, n, [[-0.08, -0.056], [0.14, -0.056], [0.14, -0.044], [-0.08, -0.044]], t.woodLight);
  rect(ctx, n, 0.12, -0.026, 0.04, 0.052, t.metal); // gas block
  barrel(ctx, n, t, 0.16, 0.44, 0.016);
  sightPost(ctx, n, t, 0.4);
  part(ctx, n, t, 0.44, 0.475, -0.022, 0.022, t.barrel, t.barrelLight); // flash hider
}

// SG552: compact rifle with an integrated scope block on the spine.
function drawSg552(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.45, -0.3, -0.05, 0.05, t.poly, t.polyLight); // stock
  part(ctx, n, t, -0.3, 0.16, -0.052, 0.052); // receiver
  scopeTop(ctx, n, t, -0.12, 0.06, 0.03); // integrated optic block
  barrel(ctx, n, t, 0.16, 0.44, 0.016);
  sightPost(ctx, n, t, 0.38);
  part(ctx, n, t, 0.44, 0.47, -0.022, 0.022, t.barrel, t.barrelLight); // muzzle cap
}

// AUG: olive bullpup with a prominent integrated scope housing.
function drawAug(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { olive: '#66764a', oliveLight: '#7d8a5a' });
  part(ctx, n, t, -0.34, -0.3, -0.07, 0.07, t.olive, t.oliveLight); // bullpup butt
  part(ctx, n, t, -0.3, 0.12, -0.066, 0.066, t.olive, t.oliveLight); // body
  part(ctx, n, t, -0.28, 0.1, -0.03, 0.03, t.oliveLight, t.oliveLight); // receiver spine insert
  scopeTop(ctx, n, t, -0.1, 0.14, 0.034); // integrated scope housing
  barrel(ctx, n, t, 0.12, 0.48, 0.017);
  part(ctx, n, t, 0.44, 0.49, -0.026, 0.026, t.barrel, t.barrelLight); // cage flash hider
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.462, -0.026, 0.462, 0.026);
}

// Generic rifle (kept for the old `rifle` kind).
function drawRifle(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.48, -0.06], [-0.32, -0.05], [-0.32, 0.05], [-0.48, 0.06]], t.wood, t.edge); // stock
  part(ctx, n, t, -0.32, 0.1, -0.052, 0.052); // receiver
  part(ctx, n, t, 0.1, 0.26, -0.05, 0.05, t.wood, t.woodLight); // handguard
  barrel(ctx, n, t, 0.26, 0.5, 0.016);
  sightPost(ctx, n, t, 0.44);
  sightPost(ctx, n, t, -0.28, 0.026);
}

/* ─── SMG family ──────────────────────────────────────────────────────── */

// P90: the top view is its most iconic angle — wide flat bullpup shell,
// top-loaded magazine strip, twin thumb holes beside the barrel.
function drawP90(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.375, -0.34, -0.07, 0.07, t.poly, t.polyLight); // rear plate
  fillPoly(ctx, n, [[-0.34, -0.09], [0.26, -0.09], [0.33, -0.045], [0.33, 0.045], [0.26, 0.09], [-0.34, 0.09]], t.poly, t.edge); // shell
  fillPoly(ctx, n, [[-0.34, -0.09], [0.26, -0.09], [0.26, -0.072], [-0.34, -0.072]], t.polyLight);
  // top-loaded magazine strip with cartridge ribs
  part(ctx, n, t, -0.26, 0.28, -0.033, 0.033, t.body, t.bodyLight);
  for (const ry of [-0.02, 0, 0.02]) {
    lineN(ctx, n, t.bodyLight, Math.max(0.5, n.p(0.005, 0)[0]), -0.24, ry, 0.26, ry);
  }
  discN(ctx, n, t.edge, 0.16, -0.058, 0.02); // thumb hole L
  discN(ctx, n, t.edge, 0.16, 0.058, 0.02); // thumb hole R
  ringN(ctx, n, t.metal, -0.02, 0, 0.02, 0.009); // reflex sight ring
  barrel(ctx, n, t, 0.33, 0.44, 0.016);
  crown(ctx, n, t, 0.44, 0.016);
}

// MP5-SD: slim receiver, rear sight drum, fat integral suppressor.
function drawMp5(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.46, -0.3, -0.042, 0.042, t.poly, t.polyLight); // slim stock
  part(ctx, n, t, -0.3, 0.16, -0.048, 0.048); // receiver
  ringN(ctx, n, t.metal, -0.27, 0, 0.02, 0.01); // rear sight drum
  discN(ctx, n, t.metal, -0.1, 0.048, 0.011); // charging handle knob
  part(ctx, n, t, 0.16, 0.44, -0.042, 0.042, t.barrel, t.barrelLight); // SD suppressor
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.2, -0.042, 0.2, 0.042); // collar
  part(ctx, n, t, 0.44, 0.455, -0.034, 0.034, t.metal, t.metal); // end cap
}

// UMP-45: blocky square receiver, top rail, side-folding twin-rail stock.
function drawUmp45(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.465, -0.44, -0.058, 0.058, t.poly, t.polyLight); // butt plate
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.026, -0.44, -0.045, -0.3, -0.045); // stock rail L
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.026, -0.44, 0.045, -0.3, 0.045); // stock rail R
  part(ctx, n, t, -0.3, 0.18, -0.066, 0.066, t.poly, t.polyLight); // boxy receiver
  part(ctx, n, t, -0.26, 0.1, -0.012, 0.012, t.polyLight, t.polyLight); // top rail
  ejectionPort(ctx, n, t, -0.02, 0.07, 0.066);
  barrel(ctx, n, t, 0.18, 0.44, 0.016);
  sightPost(ctx, n, t, 0.4);
  sightPost(ctx, n, t, -0.26, 0.026);
  crown(ctx, n, t, 0.44, 0.016);
}

// MAC-10: square box receiver, top charging handle, threaded muzzle cap.
function drawMac10(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.26, 0.18, -0.072, 0.072); // boxy receiver
  part(ctx, n, t, -0.24, 0.16, -0.05, 0.05, t.bodyLight, t.bodyLight); // receiver lid
  part(ctx, n, t, -0.14, -0.05, -0.02, 0.02, t.metal, t.metal); // charging handle on the spine
  ejectionPort(ctx, n, t, 0.02, 0.06, 0.072);
  barrel(ctx, n, t, 0.18, 0.34, 0.018);
  part(ctx, n, t, 0.34, 0.39, -0.026, 0.026, t.barrel, t.barrelLight); // threaded cap
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.36, -0.026, 0.36, 0.026);
  ringN(ctx, n, t.metal, -0.26, -0.05, 0.016, 0.008); // rear sling loop
}

// TMP: compact slab body, short barrel, top rail strip.
function drawTmp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.22, 0.18, -0.05, 0.05, t.poly, t.polyLight); // body
  part(ctx, n, t, -0.18, 0.12, -0.012, 0.012, t.polyLight, t.polyLight); // top rail
  ejectionPort(ctx, n, t, -0.02, 0.06, 0.05);
  barrel(ctx, n, t, 0.18, 0.4, 0.017);
  crown(ctx, n, t, 0.4, 0.017);
}

// MP7: compact PDW, extended twin-rail stock, full-length top rail.
function drawMp7(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.024, -0.4, -0.03, -0.22, -0.03); // stock rail L
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.024, -0.4, 0.03, -0.22, 0.03); // stock rail R
  part(ctx, n, t, -0.42, -0.395, -0.045, 0.045, t.poly, t.polyLight); // butt cap
  part(ctx, n, t, -0.22, 0.2, -0.055, 0.055, t.poly, t.polyLight); // body
  part(ctx, n, t, -0.2, 0.16, -0.012, 0.012, t.polyLight, t.polyLight); // top rail
  sightPost(ctx, n, t, -0.16, 0.02);
  barrel(ctx, n, t, 0.2, 0.42, 0.016);
  crown(ctx, n, t, 0.42, 0.016);
}

// MP9: compact with a side-folded stock lying along the -y flank.
function drawMp9(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.024, -0.42, -0.068, 0.1, -0.068); // folded stock
  lineN(ctx, n, t.polyLight, n.p(1, 0)[0] * 0.01, -0.42, -0.068, 0.1, -0.068);
  part(ctx, n, t, -0.22, 0.2, -0.052, 0.052, t.poly, t.polyLight); // body
  part(ctx, n, t, -0.18, 0.12, -0.011, 0.011, t.polyLight, t.polyLight); // top rail
  sightPost(ctx, n, t, -0.14, 0.02);
  barrel(ctx, n, t, 0.2, 0.42, 0.016);
  crown(ctx, n, t, 0.42, 0.016);
}

// Generic SMG (kept for the old `smg` kind).
function drawSmg(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.026, -0.48, -0.04, -0.34, -0.04); // stock rail L
  lineN(ctx, n, t.poly, n.p(1, 0)[0] * 0.026, -0.48, 0.04, -0.34, 0.04); // stock rail R
  part(ctx, n, t, -0.5, -0.475, -0.05, 0.05, t.poly, t.polyLight); // butt cap
  part(ctx, n, t, -0.34, 0.3, -0.055, 0.055); // receiver
  sightPost(ctx, n, t, -0.3, 0.024);
  barrel(ctx, n, t, 0.3, 0.48, 0.018);
  crown(ctx, n, t, 0.48, 0.018);
}

/* ─── pistol family ───────────────────────────────────────────────────── */

// Glock: chunky square slide, wide rear sight, corner serration cuts.
function drawGlock(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.31, -0.055], [0.18, -0.055], [0.22, -0.04], [0.22, 0.04], [0.18, 0.055], [-0.31, 0.055]], t.body, t.edge); // slide
  fillPoly(ctx, n, [[-0.31, -0.055], [0.18, -0.055], [0.18, -0.042], [-0.31, -0.042]], t.bodyLight); // bevel light
  rect(ctx, n, -0.29, -0.032, 0.47, 0.064, t.body); // flat top panel
  ejectionPort(ctx, n, t, -0.02, 0.09, 0.05);
  rearSight(ctx, n, t, -0.3, 0.055);
  sightPost(ctx, n, t, 0.155, 0.02);
  rect(ctx, n, -0.325, -0.035, 0.016, 0.07, t.metal); // backplate
  rearSerrations(ctx, n, t, -0.24, 0.055, 4);
}

// USP-S: boxy slide with a long knurled suppressor cylinder.
function drawUsp(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.32, -0.058], [0.06, -0.058], [0.1, -0.042], [0.1, 0.042], [0.06, 0.058], [-0.32, 0.058]], t.body, t.edge); // slide
  fillPoly(ctx, n, [[-0.32, -0.058], [0.06, -0.058], [0.06, -0.045], [-0.32, -0.045]], t.bodyLight);
  rect(ctx, n, -0.02, 0.038, 0.08, 0.02, t.edge); // ejection port
  part(ctx, n, t, 0.08, 0.48, -0.033, 0.033, t.barrel, t.barrelLight); // suppressor
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.14, -0.033, 0.14, 0.033); // mount collar
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.44, -0.033, 0.44, 0.033); // end ring
  part(ctx, n, t, 0.48, 0.495, -0.026, 0.026, t.metal, t.metal); // end cap
  rearSight(ctx, n, t, -0.31, 0.058);
  sightPost(ctx, n, t, 0.02, 0.02);
  rearSerrations(ctx, n, t, -0.26, 0.058, 4);
}

// P250: rounded compact slide with soft nose taper.
function drawP250(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.28, -0.05], [0.12, -0.05], [0.17, -0.032], [0.17, 0.032], [0.12, 0.05], [-0.28, 0.05]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.28, -0.05], [0.12, -0.05], [0.12, -0.038], [-0.28, -0.038]], t.bodyLight);
  rect(ctx, n, -0.26, -0.03, 0.36, 0.06, t.body);
  rect(ctx, n, -0.01, 0.03, 0.08, 0.02, t.edge); // ejection port
  rearSight(ctx, n, t, -0.275, 0.05);
  sightPost(ctx, n, t, 0.09, 0.018);
  rearSerrations(ctx, n, t, -0.22, 0.05, 3);
}

// P228: rounded slide with an exposed hammer spur at the rear.
function drawP228(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.3, -0.05], [0.1, -0.05], [0.14, -0.034], [0.14, 0.034], [0.1, 0.05], [-0.3, 0.05]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.3, -0.05], [0.1, -0.05], [0.1, -0.038], [-0.3, -0.038]], t.bodyLight);
  rect(ctx, n, -0.335, -0.014, 0.035, 0.028, t.metal); // hammer spur
  rect(ctx, n, -0.02, 0.03, 0.08, 0.02, t.edge); // ejection port
  rearSight(ctx, n, t, -0.29, 0.05);
  sightPost(ctx, n, t, 0.07, 0.018);
  rearSerrations(ctx, n, t, -0.24, 0.05, 3);
}

// Desert Eagle: massive wide slide, top rib, trapezoidal muzzle.
function drawDeagle(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.32, -0.068], [0.3, -0.068], [0.35, -0.05], [0.35, 0.05], [0.3, 0.068], [-0.32, 0.068]], t.barrel, t.edge); // heavy slide
  fillPoly(ctx, n, [[-0.32, -0.068], [0.3, -0.068], [0.3, -0.055], [-0.32, -0.055]], t.barrelLight);
  part(ctx, n, t, -0.29, 0.26, -0.02, 0.02, t.barrelLight, t.glint); // top rib
  rect(ctx, n, -0.03, 0.048, 0.1, 0.02, t.edge); // ejection port
  fillPoly(ctx, n, [[0.3, -0.068], [0.35, -0.05], [0.35, -0.068]], t.barrelLight); // muzzle chamfer L
  rearSight(ctx, n, t, -0.315, 0.068);
  sightPost(ctx, n, t, 0.24, 0.022);
  rearSerrations(ctx, n, t, -0.25, 0.068, 4);
  rect(ctx, n, -0.125, -0.024, 0.02, 0.048, t.metal); // takedown pin
}

// FN57: long slim slide, narrow sights, flat full-length top.
function drawFn57(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.31, -0.048], [0.18, -0.048], [0.22, -0.032], [0.22, 0.032], [0.18, 0.048], [-0.31, 0.048]], t.body, t.edge);
  fillPoly(ctx, n, [[-0.31, -0.048], [0.18, -0.048], [0.18, -0.036], [-0.31, -0.036]], t.bodyLight);
  part(ctx, n, t, -0.28, 0.16, -0.01, 0.01, t.bodyLight, t.glint); // full-length sight rib
  rect(ctx, n, 0.0, 0.028, 0.09, 0.02, t.edge); // ejection port
  rearSight(ctx, n, t, -0.3, 0.048);
  sightPost(ctx, n, t, 0.14, 0.016);
  rearSerrations(ctx, n, t, -0.25, 0.048, 4);
}

// Tec-9: boxy receiver with a perforated barrel shroud.
function drawTec9(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.26, 0.14, -0.06, 0.06); // boxy receiver
  part(ctx, n, t, 0.14, 0.42, -0.028, 0.028, t.barrel, t.barrelLight); // barrel shroud
  for (let i = 0; i < 4; i++) {
    discN(ctx, n, t.edge, 0.19 + i * 0.055, -0.014, 0.008); // shroud vents
    discN(ctx, n, t.edge, 0.19 + i * 0.055, 0.014, 0.008);
  }
  part(ctx, n, t, -0.16, -0.08, -0.018, 0.018, t.metal, t.metal); // charging handle
  sightPost(ctx, n, t, -0.22, 0.02);
}

// CZ75: slim slide inside the frame rails, exposed hammer spur.
function drawCz75(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.3, -0.052], [0.1, -0.052], [0.13, -0.036], [0.13, 0.036], [0.1, 0.052], [-0.3, 0.052]], t.poly, t.edge); // frame
  fillPoly(ctx, n, [[-0.3, -0.052], [0.1, -0.052], [0.1, -0.04], [-0.3, -0.04]], t.polyLight);
  part(ctx, n, t, -0.29, 0.12, -0.036, 0.036, t.body, t.bodyLight); // recessed slide
  rect(ctx, n, -0.335, -0.013, 0.035, 0.026, t.metal); // hammer spur
  rect(ctx, n, -0.03, 0.036, 0.08, 0.018, t.edge); // ejection port
  rearSight(ctx, n, t, -0.28, 0.036);
  sightPost(ctx, n, t, 0.08, 0.016);
}

// Dual Berettas (92 style): open-top slide with the exposed barrel spine.
function drawElite(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.28, 0.12, -0.052, 0.052, t.poly, t.polyLight); // frame + slide rails
  part(ctx, n, t, -0.26, 0.1, -0.02, 0.02, t.barrel, t.barrelLight); // open barrel hood
  barrel(ctx, n, t, 0.1, 0.42, 0.018); // exposed barrel
  part(ctx, n, t, 0.4, 0.44, -0.024, 0.024, t.barrel, t.barrelLight); // muzzle block
  rect(ctx, n, -0.31, -0.013, 0.03, 0.026, t.metal); // hammer
  rearSight(ctx, n, t, -0.28, 0.052);
  sightPost(ctx, n, t, 0.36, 0.016);
}

// Generic pistol (kept for the old `pistol` kind).
function drawPistol(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.36, 0.24, -0.055, 0.055); // slide
  rect(ctx, n, -0.34, -0.032, 0.54, 0.064, t.bodyLight);
  ctx.save();
  ctx.globalAlpha *= 0.5;
  rect(ctx, n, -0.32, -0.026, 0.5, 0.052, t.body);
  ctx.restore();
  rect(ctx, n, -0.05, 0.035, 0.09, 0.02, t.edge); // ejection port
  rearSight(ctx, n, t, -0.35, 0.055);
  sightPost(ctx, n, t, 0.17, 0.02);
  rearSerrations(ctx, n, t, -0.28, 0.055, 3);
}

/* ─── shotgun family ──────────────────────────────────────────────────── */

// Generic pump shotgun: wood stock, receiver, long barrel, bead sight.
function drawShotgun(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.47, -0.055], [-0.26, -0.048], [-0.26, 0.048], [-0.47, 0.055]], t.wood, t.edge); // stock
  fillPoly(ctx, n, [[-0.47, -0.055], [-0.26, -0.048], [-0.26, -0.036], [-0.47, -0.043]], t.woodLight);
  part(ctx, n, t, -0.26, -0.02, -0.05, 0.05); // receiver
  barrel(ctx, n, t, -0.02, 0.48, 0.026);
  sightPost(ctx, n, t, 0.45, 0.016); // bead
  crown(ctx, n, t, 0.48, 0.026);
}

// M3 (pump shotgun): wooden furniture, vent-rib barrel, bolt carrier line.
function drawM3(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { wood: '#7a4f2e', woodLight: '#96613a' });
  fillPoly(ctx, n, [[-0.47, -0.056], [-0.26, -0.048], [-0.26, 0.048], [-0.47, 0.056]], t.wood, t.edge); // stock
  fillPoly(ctx, n, [[-0.47, -0.056], [-0.26, -0.048], [-0.26, -0.036], [-0.47, -0.044]], t.woodLight);
  part(ctx, n, t, -0.26, -0.02, -0.05, 0.05); // receiver
  ejectionPort(ctx, n, t, -0.16, 0.06, 0.05);
  barrel(ctx, n, t, -0.02, 0.48, 0.026);
  lineN(ctx, n, t.barrelLight, Math.max(0.5, n.p(0.006, 0)[0]), 0.0, 0, 0.46, 0); // vent rib
  sightPost(ctx, n, t, 0.45, 0.016);
  crown(ctx, n, t, 0.48, 0.026);
}

// XM1014 (auto shotgun): boxy receiver, charging handle, front sight post.
function drawXm1014(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.44, -0.28, -0.045, 0.045, t.poly, t.polyLight); // stock
  part(ctx, n, t, -0.28, 0.1, -0.055, 0.055); // boxy receiver
  part(ctx, n, t, -0.24, 0.06, -0.014, 0.014, t.polyLight, t.polyLight); // top rail
  lineN(ctx, n, t.metal, Math.max(0.9, n.p(0.012, 0)[0]), 0.02, 0.055, 0.03, 0.08); // charging handle
  discN(ctx, n, t.metal, 0.033, 0.088, 0.012);
  barrel(ctx, n, t, 0.1, 0.48, 0.024);
  sightPost(ctx, n, t, 0.42, 0.02);
  crown(ctx, n, t, 0.48, 0.024);
}

/* ─── MG family ───────────────────────────────────────────────────────── */

// Generic machine gun: heavy receiver, carry handle, long barrel.
function drawMg(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.44, -0.3, -0.055, 0.055, t.poly, t.polyLight); // stock
  part(ctx, n, t, -0.3, 0.2, -0.07, 0.07); // big receiver
  part(ctx, n, t, -0.26, 0.14, -0.04, 0.04, t.bodyLight, t.bodyLight); // top cover
  part(ctx, n, t, -0.04, 0.06, -0.012, 0.012, t.metal, t.metal); // carry handle
  barrel(ctx, n, t, 0.2, 0.48, 0.02);
  sightPost(ctx, n, t, 0.42, 0.022);
  crown(ctx, n, t, 0.48, 0.02);
}

// M249 SAW: bulky receiver with feed-cover seams, heat shield, folded bipod.
function drawM249(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  part(ctx, n, t, -0.47, -0.44, -0.06, 0.06, t.poly, t.polyLight); // butt pad
  fillPoly(ctx, n, [[-0.44, -0.06], [-0.3, -0.05], [-0.3, 0.05], [-0.44, 0.06]], t.poly, t.edge); // stock
  part(ctx, n, t, -0.3, 0.18, -0.078, 0.078); // bulky receiver
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), -0.12, -0.078, -0.12, 0.078); // feed cover seam
  lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.007, 0)[0]), 0.02, -0.078, 0.02, 0.078);
  part(ctx, n, t, -0.02, 0.08, -0.014, 0.014, t.metal, t.metal); // carry handle
  part(ctx, n, t, 0.18, 0.34, -0.042, 0.042, t.body, t.bodyLight); // heat shield
  barrel(ctx, n, t, 0.34, 0.47, 0.018);
  // bipod folded back along both flanks of the barrel
  lineN(ctx, n, t.metal, Math.max(0.8, n.p(0.01, 0)[0]), 0.42, -0.05, 0.22, -0.055);
  lineN(ctx, n, t.metal, Math.max(0.8, n.p(0.01, 0)[0]), 0.42, 0.05, 0.22, 0.055);
  sightPost(ctx, n, t, 0.44, 0.022);
}

/* ─── gloves (flat-face view) ─────────────────────────────────────────── */

// Sport glove from above: cuff strap, back-of-hand plate, four fingers,
// splayed thumb. A true edge-on view of a glove would be illegible.
function drawGloves(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono, { poly: '#2c3646', polyLight: '#435064' });
  part(ctx, n, t, -0.46, -0.28, -0.13, 0.13, t.poly, t.polyLight); // cuff
  rect(ctx, n, -0.38, -0.13, 0.03, 0.26, t.polyLight); // cuff strap
  fillPoly(ctx, n, [[-0.28, -0.125], [-0.2, -0.105], [-0.2, 0.105], [-0.28, 0.125]], t.poly, t.edge); // wrist taper
  fillPoly(ctx, n, [[-0.2, -0.115], [0.06, -0.115], [0.11, -0.095], [0.11, 0.095], [0.06, 0.115], [-0.2, 0.115]], t.poly, t.edge); // hand back
  fillPoly(ctx, n, [[-0.2, -0.115], [0.06, -0.115], [0.06, -0.092], [-0.2, -0.092]], t.polyLight); // knuckle light
  for (const ky of [-0.07, -0.023, 0.023, 0.07]) {
    discN(ctx, n, t.polyLight, 0.02, ky, 0.014); // knuckle pads
  }
  // four fingers, middle two slightly longer
  const fingers: [number, number][] = [[-0.077, 0.24], [-0.026, 0.27], [0.026, 0.27], [0.077, 0.23]];
  for (const [fy, fx] of fingers) {
    part(ctx, n, t, 0.11, fx, fy - 0.023, fy + 0.023, t.poly, t.polyLight);
    lineN(ctx, n, t.edge, Math.max(0.5, n.p(0.006, 0)[0]), 0.19, fy - 0.023, 0.19, fy + 0.023); // joint seam
  }
  // thumb splayed along the lower side
  fillPoly(ctx, n, [[-0.04, 0.11], [0.04, 0.105], [0.13, 0.19], [0.07, 0.215], [-0.02, 0.16]], t.poly, t.edge);
}

// Generic sniper (kept for the old `sniper` kind).
function drawSniper(ctx: CanvasRenderingContext2D, n: Norm, color: string, mono: boolean) {
  const t = tone(color, mono);
  fillPoly(ctx, n, [[-0.47, -0.058], [-0.3, -0.048], [-0.3, 0.048], [-0.47, 0.058]], t.wood, t.edge); // stock
  part(ctx, n, t, -0.3, 0.1, -0.05, 0.05); // receiver
  scopeTop(ctx, n, t, -0.02, 0.22, 0.03); // scope
  barrel(ctx, n, t, 0.1, 0.5, 0.022);
  crown(ctx, n, t, 0.5, 0.022);
}
