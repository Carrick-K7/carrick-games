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

    // Tick when a card boundary crosses the window center line.
    const cx = this.ctx.width / 2;
    const centerAt = this.traveled + (cx - this.viewportLeft);
    const centerIndex = Math.floor(centerAt / CARD_PITCH);
    if (centerIndex !== this.lastTickedCenter) {
      if (this.lastTickedCenter >= 0 && centerIndex > this.lastTickedCenter) {
        this.sfx.tick(this.speedRatio());
      }
      this.lastTickedCenter = centerIndex;
    }

    return this.landed && this.landFlash <= 0;
  }

  private land() {
    if (this.landed) return;
    this.landed = true;
    this.landFlash = LAND_FLASH;
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

    // Reel backdrop — glass track
    const trackGrad = ctx.createLinearGradient(0, REEL_Y - 14, 0, REEL_Y + REEL_H + 14);
    trackGrad.addColorStop(0, dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.7)');
    trackGrad.addColorStop(1, dark ? 'rgba(255,255,255,0.012)' : 'rgba(255,255,255,0.4)');
    ctx.fillStyle = trackGrad;
    roundRectPath(ctx, this.viewportLeft - 24, REEL_Y - 14, this.viewportRight - this.viewportLeft + 48, REEL_H + 28, 18);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(17,24,39,0.08)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, this.viewportLeft - 24, REEL_Y - 14, this.viewportRight - this.viewportLeft + 48, REEL_H + 28, 18);
    ctx.stroke();

    // Visible card range
    const firstVisible = Math.max(0, Math.floor((this.traveled - CARD_W) / CARD_PITCH));
    const lastVisible = Math.min(this.cards.length - 1, Math.floor((this.traveled + (this.viewportRight - this.viewportLeft) + CARD_W) / CARD_PITCH));

    for (let i = firstVisible; i <= lastVisible; i++) {
      const card = this.cards[i];
      const x = this.viewportLeft + i * CARD_PITCH - this.traveled;
      const isWinner = i === WIN_INDEX;
      this.drawCard(ctx, x, card, isWinner);
    }

    // Center highlight window — soft inner glow, not a hard box
    const winX = cx - CARD_W / 2;
    const winGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, CARD_W * 0.9);
    winGrad.addColorStop(0, dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.07)');
    winGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = winGrad;
    ctx.fillRect(winX, REEL_Y - 6, CARD_W, REEL_H + 12);

    if (this.landed && this.landFlash > 0) {
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

    // Marker — soft chevrons, premium accent
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
    ctx.fillText(label, cx, READOUT_Y);
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = dark ? 'rgba(148,163,184,0.65)' : 'rgba(91,107,128,0.7)';
    ctx.fillText(this.ctx.zh ? `当前格 · ${(tier.odds * 100).toFixed(2)}%` : `Cell · ${(tier.odds * 100).toFixed(2)}%`, cx, READOUT_Y + 22);
  }

  private drawCard(ctx: CanvasRenderingContext2D, x: number, card: StripCard, isWinner: boolean) {
    if (x > this.ctx.width || x + CARD_W < 0) return;

    const tier = card.tier;
    const dark = this.dark;

    // Sheet: glassy neutral base, rarity-tinted gradient on top
    const grad = ctx.createLinearGradient(x, REEL_Y, x, REEL_Y + REEL_H);
    if (isWinner && this.landed) {
      grad.addColorStop(0, tier.color);
      grad.addColorStop(1, shade(tier.color, -0.5));
    } else {
      grad.addColorStop(0, dark ? shade(tier.color, -0.62) : shade(tier.color, -0.05));
      grad.addColorStop(1, dark ? shade(tier.color, -0.75) : shade(tier.color, -0.45));
    }

    ctx.save();
    roundRectPath(ctx, x, REEL_Y, CARD_W, REEL_H, 14);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner hairline
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, REEL_Y + 0.5, CARD_W - 1, REEL_H - 1, 13.5);
    ctx.stroke();

    // Rarity chip — small pill under the weapon
    ctx.fillStyle = dark ? 'rgba(9,11,16,0.55)' : 'rgba(255,255,255,0.75)';
    roundRectPath(ctx, x + CARD_W / 2 - 34, REEL_Y + REEL_H - 30, 68, 16, 8);
    ctx.fill();
    ctx.fillStyle = dark ? '#e6edf5' : '#3d4a5c';
    ctx.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.ctx.zh ? tier.nameZh : tier.name, x + CARD_W / 2, REEL_Y + REEL_H - 22);

    // Weapon silhouette
    drawWeaponIcon(ctx, card.item.kind, x + CARD_W / 2, REEL_Y + REEL_H / 2 - 12, { color: dark ? '#f1f5f9' : '#ffffff', alpha: 0.95, size: 74 });

    // Item name
    ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = dark ? '#f1f5f9' : '#ffffff';
    ctx.fillText(truncate(this.ctx.zh ? card.item.nameZh : card.item.name, 14), x + CARD_W / 2, REEL_Y + REEL_H / 2 + 36);

    ctx.restore();
  }
}

// ── helpers ──

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + Math.round(amount * 255)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round(amount * 255)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round(amount * 255)));
  return `rgb(${r},${g},${b})`;
}

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
