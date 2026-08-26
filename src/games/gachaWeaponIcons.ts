/*
 * Hand-drawn per-weapon icons for the Gacha game — no image assets.
 *
 * drawWeaponIcon(ctx, iconId, cx, cy, opts) renders a single-color vector
 * silhouette whose distinctive profile makes each weapon recognizable at a
 * glance: the AK-47's curved magazine, the P90's top-loaded slab, the AWP's
 * big scope and long bull barrel, and so on. Coordinates are normalized to
 * -0.5..0.5 (gun points +x) and scale with `size` (max width in logical px),
 * so the same drawing works from tiny ground sprites up to large cards.
 *
 * The first argument was broadened from the coarse WeaponKind to a free
 * `iconId` string: every weapon has its own id, unknown ids fall back to a
 * same-family silhouette, and the family ids themselves (knife/gloves/sniper/
 * rifle/smg/pistol/shotgun/mg) still render their generic profile so the old
 * `item.kind` call path keeps working.
 */

export interface WeaponIconOptions {
  color: string;
  /** Maximum width in logical pixels (height follows aspect). */
  size: number;
  alpha?: number;
  /** Flip horizontally (e.g. grip-left). */
  mirror?: boolean;
}

/** Render a weapon icon centered at (cx, cy). */
export function drawWeaponIcon(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  options: WeaponIconOptions,
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (options.mirror) ctx.scale(-1, 1);
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = options.color;
  ctx.strokeStyle = options.color;
  drawIcon(ctx, iconId, options.size);
  ctx.restore();
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

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillRect(x, y, w, h);
}

/** Fill a polygon given in absolute px. */
function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], close = true) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
  ctx.fill();
}

/** Fill a polygon given in normalized coords (scaled by n). */
function polyN(ctx: CanvasRenderingContext2D, n: Norm, pts: [number, number][], close = true) {
  poly(ctx, pts.map(([x, y]) => n.p(x, y)), close);
}

/** Stroke a line between normalized points with the given width in px. */
function lineN(
  ctx: CanvasRenderingContext2D, n: Norm, w: number,
  x1: number, y1: number, x2: number, y2: number,
) {
  ctx.beginPath();
  ctx.moveTo(...n.p(x1, y1));
  ctx.lineTo(...n.p(x2, y2));
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Stroke a circle ring (finger ring, sling loop) in normalized units. */
function ringN(ctx: CanvasRenderingContext2D, n: Norm, cx: number, cy: number, radius: number, width: number) {
  const px = n.p(1, 0)[0];
  ctx.beginPath();
  ctx.arc(cx * px, cy * px, Math.abs(radius) * px, 0, Math.PI * 2);
  ctx.lineWidth = Math.abs(width) * px;
  ctx.stroke();
}

/** Fill a crescent between two normalized polylines (curved magazine helper). */
function curvedBlock(
  ctx: CanvasRenderingContext2D,
  n: Norm,
  top: [number, number][],
  bottom: [number, number][],
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
  ctx.fill();
}

/* ─── dispatch ────────────────────────────────────────────────────────── */

function drawIcon(ctx: CanvasRenderingContext2D, iconId: string, size: number) {
  const n = norm(size);
  switch (iconId) {
    /* knives */
    case 'karambit': return drawKarambit(ctx, n);
    case 'butterfly': return drawButterfly(ctx, n);
    case 'knife': return drawKnife(ctx, n);
    /* snipers */
    case 'awp': return drawAwp(ctx, n);
    case 'scout': return drawScout(ctx, n);
    case 'g3sg1': return drawAutoSniper(ctx, n, 0);
    case 'sg550': return drawAutoSniper(ctx, n, 1);
    /* rifles */
    case 'ak47': return drawAk(ctx, n);
    case 'm4a4': return drawM4(ctx, n, false);
    case 'm4a1': return drawM4(ctx, n, false);
    case 'm4a1s': return drawM4(ctx, n, true);
    case 'famas': return drawFamas(ctx, n);
    case 'galil': return drawGalil(ctx, n);
    case 'sg552': return drawSg552(ctx, n);
    case 'aug': return drawAug(ctx, n);
    /* SMGs */
    case 'p90': return drawP90(ctx, n);
    case 'mp5': return drawMp5(ctx, n);
    case 'ump45': return drawUmp45(ctx, n);
    case 'mac10': return drawMac10(ctx, n);
    case 'tmp': return drawTmp(ctx, n);
    case 'mp7': return drawMp7(ctx, n);
    case 'mp9': return drawMp9(ctx, n);
    /* pistols */
    case 'glock': return drawGlock(ctx, n);
    case 'usp': return drawUsp(ctx, n);
    case 'p250': return drawP250(ctx, n);
    case 'p228': return drawP228(ctx, n);
    case 'deagle': return drawDeagle(ctx, n);
    case 'fn57': return drawFn57(ctx, n);
    case 'fiveseven': return drawFn57(ctx, n);
    case 'tec9': return drawTec9(ctx, n);
    case 'cz75': return drawCz75(ctx, n);
    case 'elite': return drawElite(ctx, n);
    /* shotguns */
    case 'm3': return drawM3(ctx, n);
    case 'xm1014': return drawXm1014(ctx, n);
    /* MG */
    case 'm249': return drawM249(ctx, n);
    /* gloves */
    case 'gloves': return drawGloves(ctx, n);
    /* generic family silhouettes */
    case 'sniper': return drawSniper(ctx, n);
    case 'rifle': return drawRifle(ctx, n);
    case 'smg': return drawSmg(ctx, n);
    case 'pistol': return drawPistol(ctx, n);
    case 'shotgun': return drawShotgun(ctx, n);
    case 'mg': return drawMg(ctx, n);
    /* unknown → sensible same-family fallback by id group */
    default: return drawFallbackFamily(ctx, iconId, n);
  }
}

/** Route an unrecognized id to a family silhouette (default rifle). */
function drawFallbackFamily(ctx: CanvasRenderingContext2D, iconId: string, n: Norm) {
  if (iconId.includes('knife') || iconId.includes('karambit')) return drawKnife(ctx, n);
  if (iconId.includes('snip')) return drawSniper(ctx, n);
  if (iconId.includes('shot')) return drawShotgun(ctx, n);
  if (iconId.includes('glov')) return drawGloves(ctx, n);
  return drawRifle(ctx, n);
}

/* ─── knife family ────────────────────────────────────────────────────── */

// Straight knife: slim grip, small guard, tapering blade pointing right.
function drawKnife(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.44, -0.03, 0.24, 0.09)); // grip
  rect(ctx, ...r(-0.215, -0.055, 0.035, 0.14)); // guard
  polyN(ctx, n, [[-0.175, -0.04], [0.43, -0.17], [0.43, -0.05], [-0.175, 0.05]]); // blade
}

// Karambit: curved tiger-claw blade + finger ring.
function drawKarambit(ctx: CanvasRenderingContext2D, n: Norm) {
  const { p } = n;
  ctx.beginPath();
  ctx.moveTo(...p(-0.36, 0.14));                            // heel of blade
  ctx.quadraticCurveTo(...p(-0.08, 0.1), ...p(0.06, -0.1)); // inner edge up
  ctx.quadraticCurveTo(...p(0.3, -0.32), ...p(0.38, -0.18)); // tip curve out
  ctx.quadraticCurveTo(...p(0.32, 0.06), ...p(0.06, 0.18));  // outer edge back
  ctx.quadraticCurveTo(...p(-0.2, 0.34), ...p(-0.36, 0.14)); // belly closes
  ctx.closePath();
  ctx.fill();
  ringN(ctx, n, -0.28, 0.22, 0.13, 0.09);
}

// Balisong (butterfly): straight pointed blade + two spread handles.
function drawButterfly(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  polyN(ctx, n, [[-0.05, -0.03], [0.44, -0.15], [0.44, -0.05], [-0.05, 0.045]]); // blade
  rect(ctx, ...r(-0.07, -0.01, 0.09, 0.07)); // pivot block
  const w = n.p(1, 0)[0] * 0.11;
  ctx.lineCap = 'round';
  lineN(ctx, n, w, -0.03, 0.02, -0.44, -0.12);
  lineN(ctx, n, w, -0.03, 0.03, -0.44, 0.14);
  ctx.lineCap = 'butt';
}

/* ─── sniper family ───────────────────────────────────────────────────── */

// AWP: long thick bull barrel, big scope, cheek-riser stock, bolt handle.
function drawAwp(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.0, 0.16, 0.12)); // stock
  rect(ctx, ...r(-0.42, -0.06, 0.1, 0.06)); // cheek riser
  rect(ctx, ...r(-0.32, 0.0, 0.44, 0.12)); // receiver
  rect(ctx, ...r(0.1, 0.03, 0.38, 0.07)); // long heavy barrel
  rect(ctx, ...r(-0.04, -0.22, 0.34, 0.12)); // big scope tube
  rect(ctx, ...r(0.26, -0.2, 0.06, 0.09)); // objective bell
  rect(ctx, ...r(0.02, -0.15, 0.035, 0.18)); // rear mount
  rect(ctx, ...r(0.22, -0.15, 0.035, 0.18)); // front mount
  rect(ctx, ...r(-0.1, 0.12, 0.05, 0.06)); // bolt handle
  rect(ctx, ...r(-0.02, 0.12, 0.1, 0.09)); // magazine
  rect(ctx, ...r(-0.2, 0.12, 0.08, 0.12)); // grip
}

// Scout: light bolt-action — long slim barrel, small scope, wire stock.
function drawScout(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.44, 0.0, 0.34, 0.09)); // receiver
  rect(ctx, ...r(0.1, 0.035, 0.38, 0.045)); // long thin barrel
  rect(ctx, ...r(0.02, -0.13, 0.16, 0.08)); // small scope
  rect(ctx, ...r(0.04, -0.14, 0.03, 0.16)); // rear mount
  rect(ctx, ...r(0.16, -0.14, 0.03, 0.16)); // front mount
  rect(ctx, ...r(-0.08, 0.09, 0.08, 0.05)); // internal mag hint
  const w = n.p(1, 0)[0] * 0.05;
  lineN(ctx, n, w, -0.44, -0.04, -0.44, 0.16); // wire stock
  lineN(ctx, n, w, -0.44, 0.16, -0.3, 0.09);
  lineN(ctx, n, w, -0.44, -0.04, -0.3, 0.0);
}

// G3SG1 / SG550: auto-sniper — shorter barrel, small scope, straight mag.
function drawAutoSniper(ctx: CanvasRenderingContext2D, n: Norm, variant: number) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.0, 0.14, 0.11)); // stock
  rect(ctx, ...r(-0.32, 0.0, 0.42, 0.11)); // receiver
  rect(ctx, ...r(0.08, 0.03, 0.32, 0.055)); // barrel
  rect(ctx, ...r(0.05, -0.15, 0.17, 0.09)); // small scope
  rect(ctx, ...r(0.07, -0.14, 0.03, 0.16)); // rear mount
  rect(ctx, ...r(0.19, -0.14, 0.03, 0.16)); // front mount
  rect(ctx, ...r(0.34, -0.07, 0.03, 0.08)); // front sight
  rect(ctx, ...r(-0.18, 0.11, 0.08, 0.13)); // grip
  rect(ctx, ...r(0.01, 0.11, 0.1, 0.18)); // straight magazine
  if (variant === 1) {
    rect(ctx, ...r(0.12, 0.015, 0.16, 0.05)); // SG550 handguard
  } else {
    rect(ctx, ...r(0.4, 0.015, 0.05, 0.03)); // G3SG1 muzzle notch
  }
}

/* ─── rifle family ────────────────────────────────────────────────────── */

// AK-47: banana magazine, gas tube, front sight, drop stock.
function drawAk(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  polyN(ctx, n, [[-0.46, 0.0], [-0.32, 0.0], [-0.28, 0.09], [-0.44, 0.11]]); // drop stock
  rect(ctx, ...r(-0.32, -0.03, 0.52, 0.11)); // receiver
  rect(ctx, ...r(-0.3, -0.05, 0.16, 0.07)); // handguard
  rect(ctx, ...r(-0.32, -0.06, 0.1, 0.04)); // rear sight
  rect(ctx, ...r(-0.26, -0.1, 0.32, 0.035)); // gas tube
  rect(ctx, ...r(0.18, 0.0, 0.28, 0.045)); // barrel
  rect(ctx, ...r(0.4, -0.08, 0.028, 0.09)); // front sight
  curvedBlock(ctx, n, [[0.0, 0.08], [0.12, 0.08]], [[0.13, 0.28], [0.17, 0.28], [0.11, 0.06]]); // banana mag
  rect(ctx, ...r(-0.18, 0.08, 0.08, 0.13)); // grip
}

// M4A4 / M4A1 / M4A1-S: telescoping stock, carry handle, straight mag.
function drawM4(ctx: CanvasRenderingContext2D, n: Norm, suppressor: boolean) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.0, 0.18, 0.055)); // buffer tube
  rect(ctx, ...r(-0.46, 0.05, 0.1, 0.035)); // butt
  rect(ctx, ...r(-0.28, -0.02, 0.5, 0.11)); // receiver
  rect(ctx, ...r(-0.24, -0.09, 0.24, 0.055)); // carry handle / rail
  rect(ctx, ...r(-0.08, -0.045, 0.24, 0.1)); // handguard
  rect(ctx, ...r(0.16, 0.01, 0.28, 0.04)); // barrel
  rect(ctx, ...r(0.26, -0.06, 0.03, 0.07)); // front sight
  rect(ctx, ...r(0.0, 0.09, 0.1, 0.16)); // straight magazine
  rect(ctx, ...r(-0.16, 0.09, 0.08, 0.11)); // grip
  if (suppressor) rect(ctx, ...r(0.44, -0.005, 0.1, 0.05));
}

// FAMAS: bullpup with a tall arch carry handle over the receiver.
function drawFamas(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r, p } = n;
  rect(ctx, ...r(-0.22, 0.0, 0.38, 0.11)); // receiver
  rect(ctx, ...r(0.14, 0.03, 0.34, 0.05)); // barrel
  rect(ctx, ...r(0.42, -0.01, 0.05, 0.04)); // muzzle
  // Big arch carry handle
  ctx.beginPath();
  ctx.moveTo(...p(-0.18, -0.02));
  ctx.lineTo(...p(-0.12, -0.2));
  ctx.lineTo(...p(0.06, -0.2));
  ctx.lineTo(...p(0.12, -0.02));
  ctx.lineTo(...p(0.04, -0.02));
  ctx.lineTo(...p(0.0, -0.14));
  ctx.lineTo(...p(-0.09, -0.14));
  ctx.lineTo(...p(-0.11, -0.02));
  ctx.closePath();
  ctx.fill();
  rect(ctx, ...r(-0.02, 0.11, 0.1, 0.16)); // bullpup magazine
  rect(ctx, ...r(0.08, 0.12, 0.08, 0.11)); // forward grip
}

// Galil: AK-style curved magazine + folding wire stock.
function drawGalil(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  const w = n.p(1, 0)[0] * 0.045;
  ctx.lineCap = 'round';
  lineN(ctx, n, w, -0.46, -0.05, -0.46, 0.16); // wire stock
  lineN(ctx, n, w, -0.32, 0.02, -0.46, 0.16);
  lineN(ctx, n, w, -0.32, 0.02, -0.44, -0.05);
  ctx.lineCap = 'butt';
  rect(ctx, ...r(-0.32, -0.03, 0.5, 0.11)); // receiver
  rect(ctx, ...r(0.18, 0.0, 0.26, 0.045)); // barrel
  rect(ctx, ...r(0.38, -0.07, 0.028, 0.07)); // front sight
  curvedBlock(ctx, n, [[0.0, 0.08], [0.11, 0.08]], [[0.12, 0.27], [0.16, 0.27], [0.1, 0.06]]); // curved mag
  rect(ctx, ...r(-0.17, 0.08, 0.08, 0.12)); // grip
}

// SG552: compact rifle with an integrated scope block.
function drawSg552(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.44, 0.0, 0.14, 0.09)); // stock
  rect(ctx, ...r(-0.3, -0.02, 0.46, 0.11)); // receiver
  rect(ctx, ...r(-0.12, -0.14, 0.2, 0.09)); // scope block
  rect(ctx, ...r(0.18, 0.0, 0.26, 0.04)); // barrel
  rect(ctx, ...r(0.34, -0.06, 0.028, 0.06)); // front sight
  rect(ctx, ...r(0.0, 0.09, 0.1, 0.14)); // straight mag
  rect(ctx, ...r(-0.16, 0.09, 0.08, 0.11)); // grip
}

// AUG: bullpup with a prominent integrated scope on the receiver.
function drawAug(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.16, 0.0, 0.3, 0.11)); // receiver
  rect(ctx, ...r(0.12, 0.03, 0.36, 0.05)); // barrel
  rect(ctx, ...r(0.44, -0.01, 0.04, 0.035)); // muzzle
  rect(ctx, ...r(-0.1, -0.17, 0.24, 0.09)); // integrated scope
  rect(ctx, ...r(-0.02, -0.18, 0.03, 0.2)); // scope mount
  rect(ctx, ...r(-0.12, 0.11, 0.1, 0.16)); // bullpup mag
  rect(ctx, ...r(0.06, 0.12, 0.09, 0.1)); // forward grip
}

// Generic rifle (kept for the old `rifle` kind).
function drawRifle(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.48, 0.02, 0.16, 0.12));
  rect(ctx, ...r(-0.32, 0.0, 0.62, 0.14));
  rect(ctx, ...r(0.32, 0.035, 0.18, 0.06));
  curvedBlock(ctx, n, [[0.02, 0.14], [0.12, 0.14]], [[0.16, 0.3], [0.05, 0.3]]);
  rect(ctx, ...r(-0.2, 0.14, 0.08, 0.12));
  rect(ctx, ...r(0.14, -0.09, 0.1, 0.09)); // handguard
}

/* ─── SMG family ──────────────────────────────────────────────────────── */

// P90: bullpup with the flat top-loaded magazine strip.
function drawP90(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.22, -0.04, 0.46, 0.15)); // bullpup body
  rect(ctx, ...r(0.24, 0.0, 0.2, 0.045)); // short barrel
  rect(ctx, ...r(-0.16, -0.17, 0.46, 0.08)); // top magazine slab
  rect(ctx, ...r(0.02, 0.11, 0.1, 0.12)); // vertical grip
  rect(ctx, ...r(0.14, 0.11, 0.07, 0.1)); // foregrip
}

// MP5: slim receiver, curved magazine, fixed slim stock, front sight.
function drawMp5(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.02, 0.18, 0.06)); // fixed stock
  rect(ctx, ...r(-0.3, -0.02, 0.52, 0.09)); // receiver
  rect(ctx, ...r(0.2, 0.0, 0.24, 0.04)); // barrel
  rect(ctx, ...r(0.34, -0.06, 0.028, 0.06)); // front sight
  curvedBlock(ctx, n, [[0.04, 0.07], [0.12, 0.07]], [[0.14, 0.26], [0.05, 0.26]]); // curved mag
  rect(ctx, ...r(-0.14, 0.07, 0.08, 0.13)); // grip
}

// UMP-45: blocky square receiver, straight vertical magazine.
function drawUmp45(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.32, -0.05, 0.54, 0.14)); // boxy body
  rect(ctx, ...r(0.2, 0.0, 0.26, 0.045)); // barrel
  rect(ctx, ...r(0.02, 0.09, 0.11, 0.2)); // straight mag
  rect(ctx, ...r(-0.14, 0.09, 0.09, 0.13)); // grip
}

// MAC-10: boxy receiver, top charging handle, front sling loop, straight mag.
function drawMac10(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.28, -0.07, 0.52, 0.15)); // boxy body
  rect(ctx, ...r(0.22, 0.0, 0.2, 0.05)); // short barrel
  rect(ctx, ...r(-0.2, -0.11, 0.1, 0.045)); // top charging handle
  ringN(ctx, n, 0.16, -0.02, 0.06, 0.035); // front sling loop
  rect(ctx, ...r(0.0, 0.08, 0.1, 0.18)); // straight mag
}

// TMP: small body, forward vertical grip, straight magazine.
function drawTmp(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.22, -0.03, 0.44, 0.1));
  rect(ctx, ...r(0.2, 0.0, 0.2, 0.04)); // barrel
  rect(ctx, ...r(0.12, 0.07, 0.06, 0.15)); // foregrip
  rect(ctx, ...r(-0.06, 0.07, 0.09, 0.17)); // straight mag
  rect(ctx, ...r(-0.18, 0.07, 0.07, 0.12)); // grip
}

// MP7: compact, angled magazine, short foregrip.
function drawMp7(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.22, -0.03, 0.46, 0.11));
  rect(ctx, ...r(0.22, 0.0, 0.2, 0.05)); // short barrel
  polyN(ctx, n, [[0.0, 0.08], [0.08, 0.08], [0.14, 0.26], [0.04, 0.26]]); // angled mag
  rect(ctx, ...r(0.1, 0.08, 0.06, 0.14)); // foregrip
  rect(ctx, ...r(-0.16, 0.08, 0.08, 0.12)); // grip
}

// MP9: compact with folding stock and vertical magazine.
function drawMp9(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.22, -0.03, 0.46, 0.11));
  rect(ctx, ...r(0.22, 0.0, 0.2, 0.045)); // barrel
  rect(ctx, ...r(-0.02, 0.08, 0.1, 0.17)); // vertical mag
  rect(ctx, ...r(-0.16, 0.08, 0.08, 0.12)); // grip
  const w = n.p(1, 0)[0] * 0.045;
  lineN(ctx, n, w, -0.44, 0.0, -0.44, 0.14); // folding stock
  lineN(ctx, n, w, -0.44, 0.0, -0.3, 0.03);
  lineN(ctx, n, w, -0.44, 0.14, -0.3, 0.1);
}

// Generic SMG (kept for the old `smg` kind).
function drawSmg(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.34, 0.0, 0.66, 0.16));
  rect(ctx, ...r(0.32, 0.04, 0.16, 0.07));
  const w = n.p(1, 0)[0] * 0.035;
  lineN(ctx, n, w, -0.34, 0.04, -0.5, -0.08);
  lineN(ctx, n, w, -0.5, -0.08, -0.5, 0.22);
  lineN(ctx, n, w, -0.5, 0.22, -0.34, 0.16);
  rect(ctx, ...r(0.06, 0.16, 0.09, 0.24)); // vertical mag
  rect(ctx, ...r(-0.2, 0.16, 0.08, 0.16)); // grip
}

/* ─── pistol family ───────────────────────────────────────────────────── */

// Glock: boxy compact slide, square frame, slight grip angle.
function drawGlock(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.28, -0.12, 0.44, 0.1)); // slide
  rect(ctx, ...r(-0.28, -0.02, 0.32, 0.055)); // frame
  polyN(ctx, n, [[-0.24, 0.03], [-0.1, 0.03], [-0.08, 0.3], [-0.24, 0.3]]); // grip
  ringN(ctx, n, 0.02, 0.12, 0.08, 0.04); // trigger guard
}

// USP-S: boxy slide with a long suppressor cylinder.
function drawUsp(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.3, -0.11, 0.36, 0.09)); // slide
  rect(ctx, ...r(-0.28, -0.02, 0.3, 0.05)); // frame
  rect(ctx, ...r(0.06, -0.075, 0.4, 0.09)); // suppressor
  polyN(ctx, n, [[-0.24, 0.03], [-0.06, 0.03], [-0.04, 0.28], [-0.22, 0.28]]); // grip
  ringN(ctx, n, 0.06, 0.12, 0.08, 0.04); // trigger guard
}

// P250: rounded compact pistol.
function drawP250(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.26, -0.11, 0.36, 0.09)); // rounded slide
  rect(ctx, ...r(-0.24, -0.02, 0.28, 0.05));
  polyN(ctx, n, [[-0.2, 0.03], [-0.06, 0.03], [-0.06, 0.27], [-0.2, 0.27]]); // grip
  ringN(ctx, n, 0.04, 0.12, 0.08, 0.045); // trigger guard
}

// P228: rounded, slightly longer compact.
function drawP228(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.3, -0.11, 0.42, 0.09));
  rect(ctx, ...r(-0.28, -0.02, 0.32, 0.05));
  polyN(ctx, n, [[-0.22, 0.03], [-0.06, 0.03], [-0.06, 0.29], [-0.22, 0.29]]); // grip
  ringN(ctx, n, 0.06, 0.12, 0.085, 0.045); // trigger guard
}

// Desert Eagle: long heavy slide, large grip.
function drawDeagle(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.32, -0.12, 0.52, 0.1)); // long heavy slide
  rect(ctx, ...r(-0.28, -0.02, 0.38, 0.05));
  rect(ctx, ...r(0.2, -0.09, 0.1, 0.05)); // barrel
  polyN(ctx, n, [[-0.2, 0.03], [0.0, 0.03], [0.02, 0.28], [-0.2, 0.28]]); // grip
  ringN(ctx, n, 0.1, 0.12, 0.09, 0.045); // trigger guard
}

// FN57: long square slide, thin high-capacity grip.
function drawFn57(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.3, -0.11, 0.44, 0.09)); // long square slide
  rect(ctx, ...r(-0.28, -0.02, 0.32, 0.05));
  polyN(ctx, n, [[-0.16, 0.03], [-0.04, 0.03], [-0.04, 0.3], [-0.16, 0.3]]); // thin grip
  ringN(ctx, n, 0.08, 0.12, 0.08, 0.04); // trigger guard
}

// Tec-9: boxy body with a long forward-tilted straight magazine.
function drawTec9(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.26, -0.06, 0.44, 0.12)); // boxy body
  rect(ctx, ...r(0.18, -0.03, 0.24, 0.06)); // barrel
  polyN(ctx, n, [[-0.06, 0.06], [0.04, 0.06], [0.12, 0.3], [0.0, 0.3]]); // forward-tilt long mag
}

// CZ75: mid double-stack with rounded slide and exposed hammer.
function drawCz75(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.3, -0.11, 0.42, 0.09));
  rect(ctx, ...r(-0.28, -0.02, 0.34, 0.06));
  rect(ctx, ...r(-0.32, -0.12, 0.04, 0.05)); // hammer spur
  polyN(ctx, n, [[-0.22, 0.04], [-0.06, 0.04], [-0.05, 0.29], [-0.22, 0.29]]); // grip
  ringN(ctx, n, 0.07, 0.12, 0.085, 0.045); // trigger guard
}

// Dual Berettas (Beretta 92 style): exposed barrel over the open-top slide.
function drawElite(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.28, -0.06, 0.4, 0.06)); // slide
  rect(ctx, ...r(-0.28, -0.01, 0.36, 0.055)); // frame
  rect(ctx, ...r(-0.02, -0.11, 0.44, 0.045)); // exposed barrel on top
  rect(ctx, ...r(0.4, -0.1, 0.05, 0.03)); // muzzle
  polyN(ctx, n, [[-0.2, 0.04], [-0.04, 0.04], [-0.04, 0.29], [-0.2, 0.29]]); // grip
  ringN(ctx, n, 0.08, 0.13, 0.085, 0.045); // trigger guard
}

// Generic pistol (kept for the old `pistol` kind).
function drawPistol(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.36, -0.06, 0.6, 0.16));
  rect(ctx, ...r(0.24, -0.02, 0.14, 0.06));
  polyN(ctx, n, [[-0.18, 0.1], [-0.06, 0.1], [-0.02, 0.34], [-0.18, 0.38]]); // grip
  ringN(ctx, n, 0.04, 0.14, 0.09, 0.035); // trigger guard
}

/* ─── shotgun family ──────────────────────────────────────────────────── */

// Generic pump shotgun: stock, long barrel, under-barrel tube, pump.
function drawShotgun(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.0, 0.2, 0.13)); // stock
  rect(ctx, ...r(-0.26, 0.02, 0.24, 0.1)); // receiver
  rect(ctx, ...r(-0.02, 0.03, 0.48, 0.05)); // barrel
  rect(ctx, ...r(0.0, 0.09, 0.42, 0.045)); // tube
  rect(ctx, ...r(0.18, 0.08, 0.12, 0.06)); // pump slide
  rect(ctx, ...r(-0.16, 0.12, 0.08, 0.11)); // grip
}

// M3 (pump shotgun): prominent under-barrel tube + wooden pump.
function drawM3(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.46, 0.0, 0.2, 0.13)); // stock
  rect(ctx, ...r(-0.26, 0.02, 0.28, 0.1)); // receiver
  rect(ctx, ...r(0.02, 0.03, 0.46, 0.05)); // long barrel
  rect(ctx, ...r(0.02, 0.1, 0.42, 0.05)); // tube
  rect(ctx, ...r(0.14, 0.08, 0.16, 0.08)); // wooden pump
  rect(ctx, ...r(-0.16, 0.12, 0.08, 0.11)); // grip
}

// XM1014 (auto shotgun): boxy receiver, tube mag, thin stock.
function drawXm1014(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.44, 0.0, 0.16, 0.09)); // thin stock
  rect(ctx, ...r(-0.28, -0.04, 0.4, 0.13)); // boxy receiver
  rect(ctx, ...r(0.12, 0.02, 0.36, 0.045)); // barrel
  rect(ctx, ...r(0.1, 0.08, 0.34, 0.045)); // tube
  rect(ctx, ...r(0.3, -0.06, 0.03, 0.08)); // front sight
}

/* ─── MG family ───────────────────────────────────────────────────────── */

// Generic machine gun: long barrel, box magazine, stock.
function drawMg(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.44, 0.0, 0.16, 0.13)); // stock
  rect(ctx, ...r(-0.3, -0.05, 0.52, 0.15)); // big receiver
  rect(ctx, ...r(0.22, 0.0, 0.24, 0.05)); // barrel
  rect(ctx, ...r(0.34, -0.06, 0.028, 0.06)); // front sight
  rect(ctx, ...r(-0.04, 0.1, 0.12, 0.2)); // box magazine
  rect(ctx, ...r(-0.16, 0.1, 0.09, 0.14)); // grip
}

// M249 SAW: big receiver, ammo box, bipod, long barrel.
function drawM249(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r } = n;
  rect(ctx, ...r(-0.46, -0.04, 0.16, 0.14)); // stock
  rect(ctx, ...r(-0.32, -0.08, 0.54, 0.17)); // bulky receiver
  rect(ctx, ...r(0.2, 0.0, 0.26, 0.05)); // barrel
  rect(ctx, ...r(0.4, -0.06, 0.03, 0.06)); // front sight
  rect(ctx, ...r(-0.06, 0.09, 0.16, 0.18)); // ammo box
  rect(ctx, ...r(-0.04, 0.2, 0.12, 0.03)); // belt hint
  const w = n.p(1, 0)[0] * 0.05;
  ctx.lineCap = 'round';
  lineN(ctx, n, w, 0.26, 0.04, 0.16, 0.32); // bipod
  lineN(ctx, n, w, 0.26, 0.04, 0.36, 0.32);
  ctx.lineCap = 'butt';
  rect(ctx, ...r(-0.16, 0.09, 0.09, 0.14)); // grip
}

/* ─── gloves + sniper family reuses ───────────────────────────────────── */

// Sport glove closed fist + wrist cuff.
function drawGloves(ctx: CanvasRenderingContext2D, n: Norm) {
  const { p, r } = n;
  const px = n.p(1, 0)[0];
  ctx.beginPath();
  ctx.arc(...p(0.06, -0.05), px * 0.24, Math.PI * 0.85, Math.PI * 2 - Math.PI * 0.15, false);
  ctx.closePath();
  ctx.fill();
  rect(ctx, ...r(-0.32, -0.16, 0.16, 0.2)); // thumb
  rect(ctx, ...r(-0.3, 0.02, 0.62, 0.2)); // cuff
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const fx of [-0.02, 0.1, 0.22, 0.34]) {
    const [gx] = p(fx, 0);
    ctx.fillRect(gx - px * 0.02, -px * 0.24, px * 0.04, px * 0.3);
  }
  ctx.restore();
}

// Generic sniper (kept for the old `sniper` kind).
function drawSniper(ctx: CanvasRenderingContext2D, n: Norm) {
  const { r, p } = n;
  rect(ctx, ...r(-0.46, 0.02, 0.18, 0.14));
  rect(ctx, ...r(-0.3, 0.02, 0.62, 0.16));
  rect(ctx, ...r(0.34, 0.055, 0.16, 0.07));
  rect(ctx, ...r(0.0, -0.16, 0.22, 0.14));
  const px = n.p(1, 0)[0];
  rect(ctx, p(0.02, 0)[0] - px * 0.015, -px * 0.2, px * 0.03, px * 0.22);
  rect(ctx, p(0.2, 0)[0] - px * 0.015, -px * 0.2, px * 0.03, px * 0.22);
  rect(ctx, ...r(-0.16, 0.16, 0.09, 0.14));
  rect(ctx, ...r(0.06, 0.16, 0.1, 0.12));
}
