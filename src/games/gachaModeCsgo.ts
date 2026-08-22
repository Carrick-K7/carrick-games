/*
 * "CSGO Roulette" — the classic case-opening reveal.
 *
 * A horizontal strip of rarity-colored item cards scrolls with constant
 * deceleration (CS:GO-style physics: velocity ramps linearly down to
 * zero) and lands with the winning item exactly inside the center
 * highlight window. Tick sounds fire every time a card boundary crosses
 * the window line; pitch and loudness track strip speed.
 */

import type { GachaSfx } from './gachaAudio.js';
import { GACHA_POOL, GACHA_TIERS, type GachaItem } from './gachaData.js';
import type { GachaOpenContext, GachaOpenMode, GachaOpenModeFactory } from './gachaModes.js';

// ── Layout ──
const CARD_W = 110;
const CARD_GAP = 8;
const CARD_PITCH = CARD_W + CARD_GAP;
const REEL_Y = 128;
const REEL_H = 148;

// ── Physics ──
const TIME_TOTAL = 4.0;     // seconds of spinning
const WIN_INDEX = 46;       // winner card position in the strip (0-based)
const STRIP_CARDS = 54;     // total cards in the strip

export const CSGO_STRIP_DURATION = TIME_TOTAL;

interface StripCard {
  item: GachaItem;
  tier: typeof GACHA_TIERS[number];
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

  canSkip(): boolean {
    return this.elapsed > 0.7 && !this.landed;
  }

  start() {
    if (this.started) return;
    this.started = true;

    const zh = this.ctx.zh;
    const rng = Math.random;
    const winner = this.ctx.roll;
    const allItems: StripCard[] = GACHA_TIERS.flatMap((tier) =>
      GACHA_POOL[tier.id].map((item) => ({ item, tier })),
    );

    const cards: StripCard[] = [];
    for (let i = 0; i < STRIP_CARDS; i++) {
      if (i === WIN_INDEX) {
        cards.push({ item: winner.item, tier: winner.tier });
        continue;
      }
      // Decoy: uniform over all items, but avoid showing the winner card
      // near the winner slot so the landing stays readable.
      let pick: StripCard;
      do {
        pick = allItems[Math.floor(rng() * allItems.length)];
      } while (pick.item.id === winner.item.id && Math.abs(i - WIN_INDEX) < 8);
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

  update(dt: number, skip: boolean): boolean {
    if (!this.started) this.start();

    if (skip && this.canSkip()) {
      this.land();
    } else {
      this.elapsed = Math.min(TIME_TOTAL, this.elapsed + dt);
      const t = this.elapsed;
      // s(t) = v0·t − ½·a·t², v(t) = v0 − a·t
      this.traveled = this.startVelocity * t - 0.5 * this.accel * t * t;
      if (!this.landed && this.elapsed >= TIME_TOTAL) {
        this.traveled = this.totalDistance;
        this.land();
      }
    }

    if (this.landFlash > 0) this.landFlash = Math.max(0, this.landFlash - dt);

    // Tick when a card boundary crosses the window center line.
    const cx = this.ctx.width / 2;
    const centerAt = this.traveled + (cx - this.viewportLeft);
    const centerIndex = Math.floor(centerAt / CARD_PITCH);
    if (centerIndex !== this.lastTickedCenter) {
      if (this.lastTickedCenter >= 0 && centerIndex > this.lastTickedCenter) {
        const speedRatio = Math.max(0, Math.min(1, (this.startVelocity - this.accel * this.elapsed) / this.startVelocity));
        this.sfx.tick(speedRatio);
      }
      this.lastTickedCenter = centerIndex;
    }

    return this.landed && this.landFlash <= 0;
  }

  private land() {
    if (this.landed) return;
    this.landed = true;
    this.landFlash = 0.45;
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

    // Reel backdrop
    ctx.fillStyle = dark ? 'rgba(8,12,20,0.9)' : 'rgba(244,246,250,0.9)';
    ctx.fillRect(this.viewportLeft - 24, REEL_Y - 14, this.viewportRight - this.viewportLeft + 48, REEL_H + 28);

    // Visible card range
    const firstVisible = Math.max(0, Math.floor((this.traveled - CARD_W) / CARD_PITCH));
    const lastVisible = Math.min(this.cards.length - 1, Math.floor((this.traveled + (this.viewportRight - this.viewportLeft) + CARD_W) / CARD_PITCH));

    const speedRatio = Math.max(0, Math.min(1, (this.startVelocity - this.accel * Math.min(this.elapsed, TIME_TOTAL)) / this.startVelocity));

    for (let i = firstVisible; i <= lastVisible; i++) {
      const card = this.cards[i];
      const x = this.viewportLeft + i * CARD_PITCH - this.traveled;
      const isWinner = i === WIN_INDEX;

      // Motion streaks at high speed
      if (speedRatio > 0.5 && !this.landed) {
        ctx.globalAlpha = 0.18 * speedRatio;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - CARD_W * 0.5, REEL_Y + REEL_H * 0.2, CARD_W * 0.5, REEL_H * 0.6);
        ctx.globalAlpha = 1;
      }

      this.drawCard(ctx, x, card, isWinner, speedRatio);
    }

    // Center highlight window
    const winX = cx - CARD_W / 2;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
    ctx.fillRect(winX, REEL_Y - 6, CARD_W, REEL_H + 12);

    if (this.landed && this.landFlash > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${this.landFlash * 2})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(winX - 2, REEL_Y - 8, CARD_W + 4, REEL_H + 16);
      ctx.restore();
    }

    // Frame + center line
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.viewportLeft - 20, cy);
    ctx.lineTo(cx - CARD_W / 2 - 8, cy);
    ctx.moveTo(cx + CARD_W / 2 + 8, cy);
    ctx.lineTo(this.viewportRight + 20, cy);
    ctx.stroke();

    // Marker triangles
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(cx - CARD_W / 2 - 16, cy - 9);
    ctx.lineTo(cx - CARD_W / 2 - 6, cy);
    ctx.lineTo(cx - CARD_W / 2 - 16, cy + 9);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + CARD_W / 2 + 16, cy - 9);
    ctx.lineTo(cx + CARD_W / 2 + 6, cy);
    ctx.lineTo(cx + CARD_W / 2 + 16, cy + 9);
    ctx.fill();
  }

  private drawCard(ctx: CanvasRenderingContext2D, x: number, card: StripCard, isWinner: boolean, speedRatio: number) {
    if (x > this.ctx.width || x + CARD_W < 0) return;

    const tier = card.tier;

    // Card gradient (rarity tint)
    const top = isWinner && this.landed ? tier.color : shade(tier.color, this.landed || speedRatio < 0.3 ? 0 : -0.12);
    const bottom = shade(tier.color, -0.45);
    const grad = ctx.createLinearGradient(x, REEL_Y, x, REEL_Y + REEL_H);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);

    ctx.save();
    roundRectPath(ctx, x, REEL_Y, CARD_W, REEL_H, 8);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    ctx.strokeStyle = isWinner && this.landed ? '#ffffff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = isWinner && this.landed ? 2 : 1;
    ctx.stroke();

    // Rarity ribbon
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    roundRectPath(ctx, x + CARD_W / 2 - 26, REEL_Y + REEL_H - 22, 52, 10, 3);
    ctx.fill();
    ctx.fillStyle = shade(tier.color, -0.55);
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.ctx.zh ? tier.nameZh : tier.name, x + CARD_W / 2, REEL_Y + REEL_H - 17);

    // Item emoji
    ctx.font = '30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(card.item.emoji, x + CARD_W / 2, REEL_Y + REEL_H / 2 - 6);

    // Item name
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(truncate(this.ctx.zh ? card.item.nameZh : card.item.name, 12), x + CARD_W / 2, REEL_Y + REEL_H / 2 + 30);

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
