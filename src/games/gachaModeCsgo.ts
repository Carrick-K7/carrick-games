/*
 * "CSGO Roulette" — the classic case-opening reveal, tuned for legibility.
 *
 * The strip moves in clearly readable card steps: each card advances
 * into the center highlight window with its own eased segment, so every
 * cell's item and rarity color can be seen before the next one arrives.
 * Steps start brisk and slow gradually; the winning card lands exactly
 * inside the center window, then flashes.
 *
 * Probabilities: every card in the strip is drawn with the same two-level
 * roll as the real draw — tier by official color odds, item by its weight
 * inside the tier — so the on-screen strip is a fair probability sample.
 *
 * The reel always runs to completion on its own — there is no
 * user-initiated skipping. While it spins, the card currently under the
 * center line is read out right below it (name + rarity), so the player
 * always sees exactly what is in the winning slot.
 */

import type { GachaSfx } from './gachaAudio.js';
import {
  GACHA_TIERS,
  rollGachaItem,
  type GachaItem,
  type GachaTier,
} from './gachaData.js';
import type { GachaOpenContext, GachaOpenMode, GachaOpenModeFactory } from './gachaModes.js';

// ── Layout ──
const CARD_W = 124;
const CARD_GAP = 12;
const CARD_PITCH = CARD_W + CARD_GAP;
const REEL_Y = 150;
const REEL_H = 170;
const READOUT_Y = REEL_Y + REEL_H + 30;

// ── Motion: one eased step per card, readable pace ──
const STEP_FAST = 0.36;  // seconds per card at the start
const STEP_SLOW = 0.70;  // seconds per card near the end
const FINAL_STEP = 0.4;  // seconds for the last partial step
const LAND_FLASH = 0.45;

const WIN_INDEX = 14;    // winner card position in the strip (0-based)
const STRIP_CARDS = 22;  // total cards in the strip

interface StripCard {
  item: GachaItem;
  tier: GachaTier;
}

interface Step {
  from: number;
  to: number;
  duration: number;
}

export class CsgoStripMode implements GachaOpenMode {
  readonly id = 'csgo-roulette';

  private readonly ctx: GachaOpenContext;
  private readonly sfx: GachaSfx;
  private readonly dark: boolean;
  private cards: StripCard[] = [];
  private steps: Step[] = [];
  private elapsed = 0;
  private traveled = 0;
  private totalDistance = 0;
  private totalTime = 0;
  private stepCursor = 0;
  private landed = false;
  private landFlash = 0;
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

    // Per-card step schedule: full card steps, then the partial remainder.
    const fullSteps = Math.floor(this.totalDistance / CARD_PITCH);
    const remainder = this.totalDistance - fullSteps * CARD_PITCH;
    this.steps = [];
    for (let i = 0; i < fullSteps; i++) {
      const t = fullSteps > 1 ? i / (fullSteps - 1) : 0;
      const duration = STEP_FAST + (STEP_SLOW - STEP_FAST) * t;
      this.steps.push({ from: i * CARD_PITCH, to: (i + 1) * CARD_PITCH, duration });
    }
    if (remainder > 1) {
      this.steps.push({ from: fullSteps * CARD_PITCH, to: this.totalDistance, duration: FINAL_STEP });
    }
    this.totalTime = this.steps.reduce((acc, step) => acc + step.duration, 0);

    this.sfx.caseOpen();
  }

  /** The card currently occupying the center highlight window. */
  private centerCard(): StripCard {
    const cx = this.ctx.width / 2;
    const centerAt = this.traveled + (cx - this.viewportLeft);
    const index = Math.max(0, Math.min(this.cards.length - 1, Math.floor(centerAt / CARD_PITCH)));
    return this.cards[index];
  }

  update(dt: number): boolean {
    if (!this.started) this.start();

    this.elapsed = Math.min(this.totalTime, this.elapsed + dt);

    // Locate the active step by cumulative time.
    let cumulative = 0;
    let activeStep = this.steps.length - 1;
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (this.elapsed < cumulative + step.duration) {
        activeStep = i;
        break;
      }
      cumulative += step.duration;
    }
    const step = this.steps[activeStep];
    const u = Math.min(1, Math.max(0, (this.elapsed - cumulative) / step.duration));
    this.traveled = step.from + (step.to - step.from) * easeInOutCubic(u);

    // One tick per card step; steps get slower over time, so early steps
    // tick high-pitched and late ones low.
    if (activeStep !== this.stepCursor && !this.landed) {
      this.stepCursor = activeStep;
      if (activeStep > 0) {
        const dur = this.steps[activeStep].duration;
        const speed = 1 - (dur - STEP_FAST) / (STEP_SLOW - STEP_FAST);
        this.sfx.tick(Math.max(0, Math.min(1, speed)));
      }
    }

    if (!this.landed && this.elapsed >= this.totalTime) {
      this.land();
    }

    if (this.landFlash > 0) this.landFlash = Math.max(0, this.landFlash - dt);

    return this.landed && this.landFlash <= 0;
  }

  private land() {
    if (this.landed) return;
    this.landed = true;
    this.landFlash = LAND_FLASH;
    this.elapsed = this.totalTime;
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
    const label = `${current.item.emoji} ${name} · ${tierName}`;

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

    // Rarity chip — small pill under the item
    ctx.fillStyle = dark ? 'rgba(9,11,16,0.55)' : 'rgba(255,255,255,0.75)';
    roundRectPath(ctx, x + CARD_W / 2 - 34, REEL_Y + REEL_H - 30, 68, 16, 8);
    ctx.fill();
    ctx.fillStyle = dark ? '#e6edf5' : '#3d4a5c';
    ctx.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.ctx.zh ? tier.nameZh : tier.name, x + CARD_W / 2, REEL_Y + REEL_H - 22);

    // Item emoji
    ctx.font = '38px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(card.item.emoji, x + CARD_W / 2, REEL_Y + REEL_H / 2 - 12);

    // Item name
    ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = dark ? '#f1f5f9' : '#ffffff';
    ctx.fillText(this.ctx.zh ? card.item.nameZh : card.item.name, x + CARD_W / 2, REEL_Y + REEL_H / 2 + 36);

    ctx.restore();
  }
}

// ── helpers ──

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

export const createCsgoStripMode: GachaOpenModeFactory = {
  name: 'CSGO Roulette',
  nameZh: 'CSGO 转轮',
  create: (ctx: GachaOpenContext) => new CsgoStripMode(ctx),
};
