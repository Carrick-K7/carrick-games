/*
 * Hand-drawn weapon icons for the Gacha game — no image assets.
 * Each weapon kind renders as a simple vector silhouette that scales
 * with the size parameter; callers pass the rarity color.
 */

import type { WeaponKind } from './gachaData.js';

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
  kind: WeaponKind,
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
  switch (kind) {
    case 'knife': drawKnife(ctx, options.size); break;
    case 'gloves': drawGloves(ctx, options.size); break;
    case 'sniper': drawSniper(ctx, options.size); break;
    case 'rifle': drawRifle(ctx, options.size); break;
    case 'smg': drawSmg(ctx, options.size); break;
    case 'pistol': drawPistol(ctx, options.size); break;
  }
  ctx.restore();
}

/** SVG-ish path helper in normalized coordinates scaled from -0.5..0.5. */
function norm(ctx: CanvasRenderingContext2D, s: number): {
  p: (x: number, y: number) => [number, number];
  r: (x: number, y: number, w: number, h: number) => [number, number, number, number];
} {
  return {
    p: (x, y) => [x * s, y * s],
    r: (x, y, w, h) => [x * s, y * s, w * s, h * s],
  };
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillRect(x, y, w, h);
}

// Karambit-style tiger claw: curved blade + finger ring.
function drawKnife(ctx: CanvasRenderingContext2D, size: number) {
  const { p } = norm(ctx, size);
  const [x, y] = p(-0.22, -0.08);
  ctx.beginPath();
  ctx.moveTo(...p(-0.36, 0.14));            // heel of blade
  ctx.quadraticCurveTo(...p(-0.08, 0.1), ...p(0.06, -0.1)); // inner edge up
  ctx.quadraticCurveTo(...p(0.3, -0.32), ...p(0.38, -0.18)); // tip curve out
  ctx.quadraticCurveTo(...p(0.32, 0.06), ...p(0.06, 0.18));  // outer edge back
  ctx.quadraticCurveTo(...p(-0.2, 0.34), ...p(-0.36, 0.14)); // belly closes
  ctx.closePath();
  ctx.fill();
  // Finger ring
  ctx.beginPath();
  ctx.arc(...p(-0.28, 0.22), size * 0.13, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.09;
  ctx.stroke();
  void x; void y;
}

// Sport glove closed fist + wrist cuff.
function drawGloves(ctx: CanvasRenderingContext2D, size: number) {
  const { p, r } = norm(ctx, size);
  const [x, y] = p(-0.22, -0.08); void x; void y;
  // Knuckle block (rounded fist)
  ctx.beginPath();
  ctx.arc(...p(0.06, -0.05), size * 0.24, Math.PI * 0.85, Math.PI * 2 - Math.PI * 0.15, false);
  ctx.closePath();
  ctx.fill();
  // Thumb
  const [tx, ty, tw, th] = r(-0.32, -0.16, 0.16, 0.2);
  rect(ctx, tx, ty, tw, th);
  // Cuff
  const [cx2, cy2, cw, ch] = r(-0.3, 0.02, 0.62, 0.2);
  rect(ctx, cx2, cy2, cw, ch);
  // Finger grooves
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const fx of [-0.02, 0.1, 0.22, 0.34]) {
    const [gx] = p(fx, 0);
    ctx.fillRect(gx - size * 0.02, -size * 0.24, size * 0.04, size * 0.3);
  }
}

// Long barreled sniper with scope.
function drawSniper(ctx: CanvasRenderingContext2D, size: number) {
  const { p, r } = norm(ctx, size);
  // Stock
  const [sx, sy, sw, sh] = r(-0.46, 0.02, 0.18, 0.14);
  rect(ctx, sx, sy, sw, sh);
  // Body
  const [bx, by, bw, bh] = r(-0.3, 0.02, 0.62, 0.16);
  rect(ctx, bx, by, bw, bh);
  // Barrel
  const [arx, ary, arw, arh] = r(0.34, 0.055, 0.16, 0.07);
  rect(ctx, arx, ary, arw, arh);
  // Scope
  const [ox, oy, ow, oh] = r(0.0, -0.16, 0.22, 0.14);
  rect(ctx, ox, oy, ow, oh);
  // Scope rings
  const [rx1] = p(0.02, 0);
  const [rx2] = p(0.2, 0);
  rect(ctx, rx1 - size * 0.015, -size * 0.2, size * 0.03, size * 0.22);
  rect(ctx, rx2 - size * 0.015, -size * 0.2, size * 0.03, size * 0.22);
  // Grip + magazine
  const [gx, gy, gw, gh] = r(-0.16, 0.16, 0.09, 0.14);
  rect(ctx, gx, gy, gw, gh);
  const [mx, my, mw, mh] = r(0.06, 0.16, 0.1, 0.12);
  rect(ctx, mx, my, mw, mh);
}

// Rifle: solid body, stock, curved mag.
function drawRifle(ctx: CanvasRenderingContext2D, size: number) {
  const { p, r } = norm(ctx, size);
  // Stock
  const [sx, sy, sw, sh] = r(-0.48, 0.02, 0.16, 0.12);
  rect(ctx, sx, sy, sw, sh);
  // Body
  const [bx, by, bw, bh] = r(-0.32, 0.0, 0.62, 0.14);
  rect(ctx, bx, by, bw, bh);
  // Barrel
  const [arx, ary, arw, arh] = r(0.32, 0.035, 0.18, 0.06);
  rect(ctx, arx, ary, arw, arh);
  // Magazine (slight forward curve)
  ctx.beginPath();
  ctx.moveTo(...p(0.02, 0.14));
  ctx.lineTo(...p(0.12, 0.14));
  ctx.lineTo(...p(0.16, 0.3));
  ctx.lineTo(...p(0.05, 0.3));
  ctx.closePath();
  ctx.fill();
  // Grip
  const [gx, gy, gw, gh] = r(-0.2, 0.14, 0.08, 0.12);
  rect(ctx, gx, gy, gw, gh);
  // Front sight + handguard highlight
  const [hx, hy, hw, hh] = r(0.14, -0.09, 0.1, 0.09);
  rect(ctx, hx, hy, hw, hh);
}

// Compact SMG with big vertical mag.
function drawSmg(ctx: CanvasRenderingContext2D, size: number) {
  const { p, r } = norm(ctx, size);
  // Body
  const [bx, by, bw, bh] = r(-0.34, 0.0, 0.66, 0.16);
  rect(ctx, bx, by, bw, bh);
  // Barrel
  const [arx, ary, arw, arh] = r(0.32, 0.04, 0.16, 0.07);
  rect(ctx, arx, ary, arw, arh);
  // Wire stock
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.moveTo(...p(-0.34, 0.04));
  ctx.lineTo(...p(-0.5, -0.08));
  ctx.lineTo(...p(-0.5, 0.22));
  ctx.lineTo(...p(-0.34, 0.16));
  ctx.stroke();
  // Big vertical magazine
  const [mx, my, mw, mh] = r(0.06, 0.16, 0.09, 0.24);
  rect(ctx, mx, my, mw, mh);
  // Grip
  const [gx, gy, gw, gh] = r(-0.2, 0.16, 0.08, 0.16);
  rect(ctx, gx, gy, gw, gh);
}

// Pistol: slide + grip.
function drawPistol(ctx: CanvasRenderingContext2D, size: number) {
  const { p, r } = norm(ctx, size);
  // Slide
  const [sx, sy, sw, sh] = r(-0.36, -0.06, 0.6, 0.16);
  rect(ctx, sx, sy, sw, sh);
  // Barrel tip
  const [tx, ty, tw, th] = r(0.24, -0.02, 0.14, 0.06);
  rect(ctx, tx, ty, tw, th);
  // Grip (angled)
  ctx.beginPath();
  ctx.moveTo(...p(-0.18, 0.1));
  ctx.lineTo(...p(-0.06, 0.1));
  ctx.lineTo(...p(-0.02, 0.34));
  ctx.lineTo(...p(-0.18, 0.38));
  ctx.closePath();
  ctx.fill();
  // Trigger guard
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(...p(0.04, 0.14), size * 0.09, 0, Math.PI * 2);
  ctx.stroke();
}
