/*
 * "CSGO Roulette" — the classic case-opening reveal.
 *
 * The strip scrolls continuously with constant deceleration — exactly
 * like real CS:GO case openings: it moves fast at first, then glides to
 * a stop with the winning card inside the center highlight window. The
 * motion is unbroken (no per-card snapping), but the deceleration is
 * tuned so the last stretch passes a card every ~0.4-0.9s, keeping each
 * cell's weapon and rarity readable as it slows. A live readout under
 * the window names whatever card is currently in the winning slot.
 *
 * Probabilities: every card in the strip is drawn with the same two-level
 * roll as the real draw — tier by official color odds, item by its weight
 * inside the tier — so the on-screen strip is a fair probability sample.
 *
 * The reel always runs to completion on its own — there is no
 * user-initiated stopping of the spin itself.
 *
 * Rendering: card faces are pre-rendered once into HiDPI sprites, then
 * blitted each frame with velocity-scaled stretch and ghost trails for a
 * motion-blur feel; the center marker glows in sync with the tick sfx.
 */

import type { GachaSfx } from './gachaAudio.js';
import {
  GACHA_TIERS,
  rollGachaItem,
  type GachaItem,
  type GachaTier,
} from './gachaData.js';
import type { GachaOpenContext, GachaOpenMode, GachaOpenModeFactory } from './gachaModes.js';
import { drawWeaponIcon } from './gachaWeaponIcons.js';
import { clamp, drawGlow, fillGlassPanel, makeSprite, shade } from '../core/fx.js';

// ── Layout ──
const CARD_W = 124;
const CARD_GAP = 12;
const CARD_PITCH = CARD_W + CARD_GAP;
const REEL_Y = 150;
const REEL_H = 170;
const READOUT_Y = REEL_Y + REEL_H + 30;

// ── Motion: continuous constant deceleration (CS:GO-style) ──
// v(t) = v0 · (1 − t/T), s(t) = v0·t − ½·a·t²
const TIME_TOTAL = 4.6;     // seconds of spinning
const LAND_FLASH = 0.5;
const WIN_INDEX = 26;       // winner card position in the strip (0-based)
const STRIP_CARDS = 34;     // total cards in the strip

interface StripCard {
  item: GachaItem;
  tier: GachaTier;
}

export class CsgoStripMode implements GachaOpenMode {
  readonly id = 'csgo-roulette';

  private readonly ctx: GachaOpenContext;
  private readonly sfx: GachaSfx;
  private readonly dark: boolean;
  private cards: StripCard[] = [];
  private elapsed = 0;
  private traveled = 0;
  private totalDistance = 0;
  private accel = 0;
  private startVelocity = 0;
  private landed = false;
  private landFlash = 0;
  private lastTickedCenter = -1;
  private started = false;
  private readonly viewportLeft: number;
  private readonly viewportRight: number;

  // Pre-rendered card faces: index → sprite (winner has a lit variant)
  private readonly cardSprites = new Map<number, HTMLCanvasElement>();
  private winnerLandedSprite: HTMLCanvasElement | null = null;
  private markerPulse = 0;

  constructor(ctx: GachaOpenContext) {
    this.ctx = ctx;
    this.sfx = ctx.sfx;
    this.dark = ctx.dark;
    this.viewportLeft = 40;
    this.viewportRight = ctx.width - 40;
  }

  start() {
    if (this.started) return;
    this.started = true;

    const winner = this.ctx.roll;

    // Strip content: every cell is rolled with the real two-level odds
    // (color odds first, then item weight inside the color).
    const cards: StripCard[] = [];
    for (let i = 0; i < STRIP_CARDS; i++) {
      if (i === WIN_INDEX) {
        cards.push({ item: winner.item, tier: winner.tier });
        continue;
      }
      let pick = rollGachaItem();
      // Keep the winner cell a surprise: avoid its item near the winner slot.
      while (pick.item.id === winner.item.id && Math.abs(i - WIN_INDEX) < 6) {
        pick = rollGachaItem();
      }
      cards.push(pick);
    }
    this.cards = cards;

    // Distance the strip must travel so card WIN_INDEX lands centered.
    const cx = this.ctx.width / 2;
    this.totalDistance = this.viewportLeft + WIN_INDEX * CARD_PITCH - (cx - CARD_W / 2);
    // Constant deceleration from v0 to 0 over TIME_TOTAL: v0 = 2D/T, a = v0/T.
    this.accel = (2 * this.totalDistance) / (TIME_TOTAL * TIME_TOTAL);
    this.startVelocity = this.accel * TIME_TOTAL;

    this.sfx.caseOpen();
  }

  /** The card currently occupying the center highlight window. */
  private centerCard(): StripCard {
    const cx = this.ctx.width / 2;
    const centerAt = this.traveled + (cx - this.viewportLeft);
    const index = Math.max(0, Math.min(this.cards.length - 1, Math.floor(centerAt / CARD_PITCH)));
    return this.cards[index];
  }

  /** Current speed expressed as a fraction of the start velocity (0..1). */
  private speedRatio(): number {
    const v = Math.max(0, this.startVelocity - this.accel * Math.min(this.elapsed, TIME_TOTAL));
    return this.startVelocity > 0 ? Math.min(1, v / this.startVelocity) : 0;
  }

  update(dt: number): boolean {
    if (!this.started) this.start();

    this.elapsed = Math.min(TIME_TOTAL, this.elapsed + dt);
    const t = this.elapsed;
    // s(t) = v0·t − ½·a·t², v(t) = v0 − a·t  →  continuous, unbroken decay
    this.traveled = this.startVelocity * t - 0.5 * this.accel * t * t;
    if (!this.landed && this.elapsed >= TIME_TOTAL) {
      this.traveled = this.totalDistance;
      this.land();
    }

    if (this.landFlash > 0) this.landFlash = Math.max(0, this.landFlash - dt);
    if (this.markerPulse > 0) this.markerPulse = Math.max(0, this.markerPulse - dt * 3);

    // Tick when a card boundary crosses the window center line.
    const cx = this.ctx.width / 2;
    const centerAt = this.traveled + (cx - this.viewportLeft);
    const centerIndex = Math.floor(centerAt / CARD_PITCH);
    if (centerIndex !== this.lastTickedCenter) {
      if (this.lastTickedCenter >= 0 && centerIndex > this.lastTickedCenter) {
        this.sfx.tick(this.speedRatio());
        this.markerPulse = Math.max(this.markerPulse, 0.7);
      }
      this.lastTickedCenter = centerIndex;
    }

    return this.landed && this.landFlash <= 0;
  }

  private land() {
    if (this.landed) return;
    this.landed = true;
    this.landFlash = LAND_FLASH;
    this.markerPulse = 1;
    this.elapsed = TIME_TOTAL;
    this.traveled = this.totalDistance;
    this.sfx.land();
    this.sfx.reveal(GACHA_TIERS.findIndex((t) => t.id === this.ctx.roll.tier.id));
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.started) this.start();

    const cx = this.ctx.width / 2;
    const cy = REEL_Y + REEL_H / 2;
    const dark = this.dark;
    const speed = this.speedRatio();

    // Reel backdrop — glass track
    fillGlassPanel(ctx, this.viewportLeft - 24, REEL_Y - 14, this.viewportRight - this.viewportLeft + 48, REEL_H + 28, 18, {
      fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
      fill2: dark ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.45)',
      border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.09)',
    });

    // Speed streaks inside the track while the strip is at full tilt
    if (speed > 0.45) {
      ctx.save();
      ctx.globalAlpha = (speed - 0.45) * 0.45;
      ctx.strokeStyle = dark ? 'rgba(226,238,249,0.5)' : 'rgba(71,85,105,0.4)';
      ctx.lineWidth = 1;
      const trackW = this.viewportRight - this.viewportLeft;
      for (let i = 0; i < 6; i++) {
        const y = REEL_Y + 16 + ((i * 53) % (REEL_H - 28));
        const x0 = this.viewportLeft - 10 + ((i * 197 + Math.floor(this.elapsed * 900)) % trackW);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + 30 + 60 * speed, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Visible card range
    const firstVisible = Math.max(0, Math.floor((this.traveled - CARD_W) / CARD_PITCH));
    const lastVisible = Math.min(this.cards.length - 1, Math.floor((this.traveled + (this.viewportRight - this.viewportLeft) + CARD_W) / CARD_PITCH));
    const centerIndex = Math.floor((this.traveled + (cx - this.viewportLeft)) / CARD_PITCH);

    for (let i = firstVisible; i <= lastVisible; i++) {
      const card = this.cards[i];
      const x = this.viewportLeft + i * CARD_PITCH - this.traveled;
      const isWinnerLanded = i === WIN_INDEX && this.landed;
      const sprite = isWinnerLanded ? this.winnerSprite() : this.cardSprite(i, card);

      // Motion stretch while fast; approaching-card pulse while slow
      const stretch = 1 + 0.3 * speed;
      let scale = 1;
      if (!this.landed && speed < 0.3 && i === centerIndex) {
        scale = 1 + 0.05 * clamp(1 - speed / 0.3, 0, 1) * (0.5 + 0.5 * Math.sin(this.elapsed * 14));
      }
      const dw = CARD_W * stretch * scale;
      const dh = REEL_H * scale;
      const dx = x + (CARD_W - dw) / 2;
      const dy = REEL_Y + (REEL_H - dh) / 2;

      if (x > this.ctx.width || x + CARD_W < 0) continue;

      // Ghost trail behind the direction of travel (strip moves left)
      if (speed > 0.35 && !isWinnerLanded) {
        ctx.save();
        ctx.globalAlpha = 0.2 * speed;
        ctx.drawImage(sprite, dx + 7 * speed, dy, dw, dh);
        ctx.globalAlpha = 0.1 * speed;
        ctx.drawImage(sprite, dx + 15 * speed, dy, dw, dh);
        ctx.restore();
      }

      if (isWinnerLanded) {
        ctx.save();
        ctx.shadowColor = card.tier.color;
        ctx.shadowBlur = 24;
        ctx.drawImage(sprite, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, dx, dy, dw, dh);
      }
    }

    // Edge fades so cards melt into the track ends
    const fadeW = 44;
    const edge = dark ? '13,16,22' : '243,245,249';
    const leftFade = ctx.createLinearGradient(this.viewportLeft - 24, 0, this.viewportLeft - 24 + fadeW, 0);
    leftFade.addColorStop(0, `rgba(${edge},0.95)`);
    leftFade.addColorStop(1, `rgba(${edge},0)`);
    ctx.fillStyle = leftFade;
    ctx.fillRect(this.viewportLeft - 24, REEL_Y - 14, fadeW, REEL_H + 28);
    const rightFade = ctx.createLinearGradient(this.viewportRight + 24, 0, this.viewportRight + 24 - fadeW, 0);
    rightFade.addColorStop(0, `rgba(${edge},0.95)`);
    rightFade.addColorStop(1, `rgba(${edge},0)`);
    ctx.fillStyle = rightFade;
    ctx.fillRect(this.viewportRight + 24 - fadeW, REEL_Y - 14, fadeW, REEL_H + 28);

    // Center highlight window — soft inner glow, not a hard box
    const winX = cx - CARD_W / 2;
    const winGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, CARD_W * 0.9);
    winGrad.addColorStop(0, dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.07)');
    winGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = winGrad;
    ctx.fillRect(winX, REEL_Y - 6, CARD_W, REEL_H + 12);

    if (this.landed && this.landFlash > 0) {
      drawGlow(ctx, cx, cy, 130, this.ctx.roll.tier.color, this.landFlash * 1.2);
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${this.landFlash * 1.8})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(winX - 2, REEL_Y - 8, CARD_W + 4, REEL_H + 16);
      ctx.restore();
    }

    // Center line — fine hairlines with rounded caps
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(17,24,39,0.3)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.viewportLeft - 16, cy);
    ctx.lineTo(cx - CARD_W / 2 - 10, cy);
    ctx.moveTo(cx + CARD_W / 2 + 10, cy);
    ctx.lineTo(this.viewportRight + 16, cy);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Markers — chevrons with a glow that pulses on every tick
    const markerColor = dark ? '#7dd3fc' : '#0284c7';
    const glowStrength = 0.35 + this.markerPulse * 0.6;
    drawGlow(ctx, cx - CARD_W / 2 - 13, cy, 18, markerColor, glowStrength * 0.7);
    drawGlow(ctx, cx + CARD_W / 2 + 13, cy, 18, markerColor, glowStrength * 0.7);
    ctx.fillStyle = dark ? 'rgba(125,211,252,0.9)' : 'rgba(2,132,199,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - CARD_W / 2 - 18, cy - 8);
    ctx.lineTo(cx - CARD_W / 2 - 7, cy);
    ctx.lineTo(cx - CARD_W / 2 - 18, cy + 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + CARD_W / 2 + 18, cy - 8);
    ctx.lineTo(cx + CARD_W / 2 + 7, cy);
    ctx.lineTo(cx + CARD_W / 2 + 18, cy + 8);
    ctx.fill();

    // Current-cell readout: what the winning slot holds right now.
    const current = this.centerCard();
    const tier = current.tier;
    const name = this.ctx.zh ? current.item.nameZh : current.item.name;
    const tierName = this.ctx.zh ? tier.nameZh : tier.name;
    const label = `${name} · ${tierName}`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = tier.color;
    ctx.fillText(label, cx, READOUT_Y + 8);
  }

  /* ─── Card face sprites ─── */

  private cardSprite(index: number, card: StripCard): HTMLCanvasElement {
    let sprite = this.cardSprites.get(index);
    if (!sprite) {
      sprite = makeSprite(CARD_W, REEL_H, (c) => this.renderCardFace(c, card, false), 2);
      this.cardSprites.set(index, sprite);
    }
    return sprite;
  }

  private winnerSprite(): HTMLCanvasElement {
    if (!this.winnerLandedSprite) {
      this.winnerLandedSprite = makeSprite(CARD_W, REEL_H, (c) => this.renderCardFace(c, this.cards[WIN_INDEX], true), 2);
    }
    return this.winnerLandedSprite;
  }

  /** Static card art, drawn once into a sprite at origin (0,0). */
  private renderCardFace(c: CanvasRenderingContext2D, card: StripCard, landed: boolean) {
    const tier = card.tier;
    const dark = this.dark;

    // Sheet: glassy neutral base, rarity-tinted gradient on top
    const grad = c.createLinearGradient(0, 0, 0, REEL_H);
    if (landed) {
      grad.addColorStop(0, shade(tier.color, 0.15));
      grad.addColorStop(1, shade(tier.color, -0.5));
    } else {
      grad.addColorStop(0, dark ? shade(tier.color, -0.62) : shade(tier.color, -0.05));
      grad.addColorStop(1, dark ? shade(tier.color, -0.75) : shade(tier.color, -0.45));
    }
    roundRectPath(c, 0, 0, CARD_W, REEL_H, 14);
    c.fillStyle = grad;
    c.fill();

    // Glass sheen across the top third
    c.save();
    roundRectPath(c, 0, 0, CARD_W, REEL_H, 14);
    c.clip();
    const sheen = c.createLinearGradient(0, 0, 0, REEL_H * 0.4);
    sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, CARD_W, REEL_H * 0.4);
    c.restore();

    // Inner hairline
    c.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)';
    c.lineWidth = 1;
    roundRectPath(c, 0.5, 0.5, CARD_W - 1, REEL_H - 1, 13.5);
    c.stroke();

    // Rarity chip — small pill under the weapon
    c.fillStyle = dark ? 'rgba(9,11,16,0.55)' : 'rgba(255,255,255,0.75)';
    roundRectPath(c, CARD_W / 2 - 34, REEL_H - 30, 68, 16, 8);
    c.fill();
    c.fillStyle = dark ? '#e6edf5' : '#3d4a5c';
    c.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(this.ctx.zh ? tier.nameZh : tier.name, CARD_W / 2, REEL_H - 22);

    // The same flat, supersampled front view used by results and inventory.
    drawWeaponIcon(c, card.item.icon ?? card.item.kind, CARD_W / 2, REEL_H / 2 - 12, {
      color: dark ? '#f1f5f9' : '#ffffff',
      alpha: 0.95,
      size: 96,
      mono: false,
    });

    // Item name
    c.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    c.fillStyle = dark ? '#f1f5f9' : '#ffffff';
    c.fillText(truncate(this.ctx.zh ? card.item.nameZh : card.item.name, 14), CARD_W / 2, REEL_H / 2 + 36);
  }
}

// ── helpers ──

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

export const createCsgoStripMode: GachaOpenModeFactory = {
  name: 'CSGO Roulette',
  nameZh: 'CSGO 转轮',
  create: (ctx: GachaOpenContext) => new CsgoStripMode(ctx),
};
