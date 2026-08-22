/*
 * Gacha — CS:GO-style case opening with official rarity odds.
 *
 * Screens: menu (case + tier strip + hint) → unlock (case shake + lid)
 * → opening (mode-driven reel) → result (rarity reveal), plus gallery
 * (prize showcase) and stats (pull statistics). Free draws: statistics
 * are the only economy.
 *
 * Visual language: modern, minimal, premium — dark glass panels, soft
 * gradients, hairline borders, restrained glow. Not pixel art: this
 * game renders the same design in both shell style modes.
 *
 * Opening animations are pluggable through src/games/gachaModes.ts; the
 * menu shows a mode switcher automatically once more than one exists.
 */

import { BaseGame, createDefaultGameHost, type GameHost } from '../core/game.js';
import { GachaSfx } from './gachaAudio.js';
import {
  GACHA_POOL,
  GACHA_TIERS,
  GACHA_TIER_ORDER,
  rollGachaItem,
  type GachaItem,
  type GachaRoll,
  type GachaTier,
} from './gachaData.js';
import {
  GACHA_STATS_STORAGE_KEY,
  defaultGachaStats,
  loadGachaStats,
  writeGachaStats,
  type GachaStats,
} from './gachaStorage.js';
import {
  createOpeningMode,
  openingModeCount,
  openingModeLabel,
  type GachaOpenContext,
  type GachaOpenMode,
} from './gachaModes.js';

type Screen = 'menu' | 'unlock' | 'opening' | 'result' | 'gallery' | 'stats';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const RESULT_PARTICLES_TIERS = new Set(['classified', 'covert', 'rarespecial']);
const UNLOCK_DURATION = 1.05; // seconds of case-unlock prelude before the reel

/* ───────── Modern design tokens ───────── */

interface GachaPalette {
  bgTop: string;
  bgBottom: string;
  text: string;
  textDim: string;
  textFaint: string;
  panel: string;       // glass panel fill
  panelBorder: string;
  panelBorderSoft: string;
  accent: string;
  accentSoft: string;
  cardFillTop: string; // sheet for item cards
  cardFillBottom: string;
  stroke: string;
  glow: string;
}

function palette(dark: boolean): GachaPalette {
  if (dark) {
    return {
      bgTop: '#0c0f14',
      bgBottom: '#10141b',
      text: '#eef1f6',
      textDim: 'rgba(238,241,246,0.62)',
      textFaint: 'rgba(238,241,246,0.38)',
      panel: 'rgba(255,255,255,0.045)',
      panelBorder: 'rgba(255,255,255,0.10)',
      panelBorderSoft: 'rgba(255,255,255,0.06)',
      accent: '#7dd3fc',
      accentSoft: 'rgba(125,211,252,0.14)',
      cardFillTop: 'rgba(255,255,255,0.05)',
      cardFillBottom: 'rgba(255,255,255,0.015)',
      stroke: 'rgba(255,255,255,0.12)',
      glow: 'rgba(125,211,252,0.16)',
    };
  }
  return {
    bgTop: '#f4f6fa',
    bgBottom: '#e9edf3',
    text: '#111827',
    textDim: 'rgba(17,24,39,0.62)',
    textFaint: 'rgba(17,24,39,0.38)',
    panel: 'rgba(255,255,255,0.72)',
    panelBorder: 'rgba(17,24,39,0.08)',
    panelBorderSoft: 'rgba(17,24,39,0.05)',
    accent: '#0284c7',
    accentSoft: 'rgba(2,132,199,0.09)',
    cardFillTop: 'rgba(255,255,255,0.85)',
    cardFillBottom: 'rgba(255,255,255,0.6)',
    stroke: 'rgba(17,24,39,0.10)',
    glow: 'rgba(2,132,199,0.10)',
  };
}

export class GachaGame extends BaseGame {
  /**
   * Injectable RNG for deterministic tests. Use a sequence to cover the
   * tier roll and the item roll: 0 → blue (first item), 0.9999 → gold.
   */
  random: () => number = Math.random;
  /** Stat snapshot (public read for tests and debugging). */
  stats: GachaStats;

  private screen: Screen = 'menu';
  private sfx = new GachaSfx();
  private roll: GachaRoll | null = null;
  private animMode: GachaOpenMode | null = null;
  private animModeIndex = 0;
  private revealT = 0;
  private isNewItem = false;
  private particles: Particle[] = [];
  private notify = '';
  private notifyTimer = 0;
  private statsPage = 0;
  private unlockT = 0;
  private startedOnce = false;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 640, 480));
    this.stats = loadGachaStats();
  }

  /* ─── Lifecycle ─── */

  init() {
    this.stats = loadGachaStats();
    this.screen = 'menu';
    this.animMode = null;
    this.roll = null;
    this.revealT = 0;
    this.particles = [];
    this.statsPage = 0;
    this.unlockT = 0;
    this.isNewItem = false;
  }

  override onStart() {
    if (!this.startedOnce) {
      this.startedOnce = true;
      // Holds the audio context open so the first pull already has sound.
      this.sfx.prime();
    }
  }

  destroy() {
    this.sfx.close();
    this.stop();
  }

  /* ─── Opening flow ─── */

  /** Menu click on the case: roll, record, and play the unlock prelude. */
  private startUnlock() {
    // Roll once per draw (both tier and item come from the same RNG).
    this.roll = rollGachaItem(this.random);
    const roll = this.roll;

    // Record the pull once, at open time (matches CS:GO: the draw settles
    // the moment the strip starts).
    const hadItem = (this.stats.itemCounts[roll.item.id] ?? 0) > 0;
    this.stats.totalPulls++;
    this.stats.tierCounts[roll.tier.id]++;
    this.stats.itemCounts[roll.item.id] = (this.stats.itemCounts[roll.item.id] ?? 0) + 1;
    this.stats.history.unshift({ itemId: roll.item.id, tierId: roll.tier.id, at: Date.now() });
    if (this.stats.history.length > 50) this.stats.history.length = 50;
    writeGachaStats(this.stats);
    this.isNewItem = !hadItem;

    this.unlockT = 0;
    this.screen = 'unlock';
    this.canvas.dataset.gachaScreen = 'unlock';
    this.canvas.dataset.gachaTier = roll.tier.id;
    this.sfx.caseOpen();
  }

  /** Unlock prelude complete: build the reel mode and spin. */
  private beginReel() {
    if (!this.roll) return;
    this.animMode = createOpeningMode(this.animModeIndex, this.buildModeContext(this.roll));
    this.screen = 'opening';
    this.canvas.dataset.gachaScreen = 'opening';
  }

  private buildModeContext(roll: GachaRoll): GachaOpenContext {
    return {
      width: this.width,
      height: this.height,
      dark: this.isDarkTheme(),
      zh: this.isZhLang(),
      sfx: this.sfx,
      roll,
    };
  }

  private finishOpening() {
    if (!this.roll) return;
    this.revealT = 0;
    this.particles = [];
    this.screen = 'result';
    this.canvas.dataset.gachaScreen = 'result';
    if (RESULT_PARTICLES_TIERS.has(this.roll.tier.id)) {
      const count = this.roll.tier.id === 'rarespecial' ? 70 : 42;
      const color = this.roll.tier.color;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: this.width / 2 + (Math.random() - 0.5) * 260,
          y: this.height / 2 - 40 + (Math.random() - 0.5) * 200,
          vx: (Math.random() - 0.5) * 260,
          vy: -Math.random() * 180 - 40,
          life: 1.2 + Math.random() * 1.4,
          maxLife: 2.6,
          color: Math.random() < 0.3 ? '#ffd700' : color,
          size: 2 + Math.random() * 4,
        });
      }
    }
  }

  private gotoMenu() {
    this.screen = 'menu';
    this.animMode = null;
    this.roll = null;
    this.canvas.dataset.gachaScreen = 'menu';
    delete this.canvas.dataset.gachaTier;
  }

  private resetStats() {
    try {
      localStorage.removeItem(GACHA_STATS_STORAGE_KEY);
    } catch {
      // best-effort; in-memory reset below still applies
    }
    this.stats = defaultGachaStats();
    this.notify = this.isZhLang() ? '统计已重置' : 'Stats reset';
    this.notifyTimer = 2.2;
  }

  /* ─── Update ─── */

  update(dt: number) {
    if (this.notifyTimer > 0) this.notifyTimer -= dt;

    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.life -= dt;
      return p.life > 0;
    });

    if (this.screen === 'result') {
      this.revealT += dt;
      return;
    }

    if (this.screen === 'unlock') {
      this.unlockT += dt;
      if (this.unlockT >= UNLOCK_DURATION) {
        this.beginReel();
      }
      return;
    }

    if (this.screen === 'opening' && this.animMode) {
      if (this.animMode.update(dt)) {
        this.finishOpening();
      }
    }
  }

  /* ─── Draw ─── */

  draw(ctx: CanvasRenderingContext2D) {
    const p = palette(this.isDarkTheme());
    drawBg(ctx, this.width, this.height, p);

    switch (this.screen) {
      case 'menu': this.drawMenu(ctx, p); break;
      case 'unlock': this.drawUnlock(ctx, p); break;
      case 'opening': this.drawOpening(ctx, p); break;
      case 'result': this.drawResult(ctx, p); break;
      case 'gallery': this.drawGallery(ctx, p); break;
      case 'stats': this.drawStats(ctx, p); break;
    }

    // Particle overlay
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;

    // Notification
    if (this.notifyTimer > 0) {
      ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.text;
      ctx.globalAlpha = Math.min(1, this.notifyTimer);
      ctx.fillText(this.notify, this.width / 2, 60);
      ctx.globalAlpha = 1;
    }
  }

  /* ─── Menu ─── */

  private drawMenu(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const t = performance.now() / 1000;

    // Header bar
    glassPanel(ctx, 24, 14, this.width - 48, 40, p, 12);
    ctx.font = '600 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '抽卡' : 'Gacha', 42, 34);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? `已抽取 ${this.stats.totalPulls} 次` : `${this.stats.totalPulls} pulls`, 42, 50);

    // Right-side icon chips
    this.chipButton(ctx, this.hitPrizes(), zh ? '奖品' : 'PRIZES', p);
    this.chipButton(ctx, this.hitStats(), zh ? '统计' : 'STATS', p);
    this.chipButton(ctx, this.hitSound(), this.sfx.enabled ? (zh ? '声音' : 'SOUND') : (zh ? '静音' : 'MUTED'), p);

    // Case — hero object, centered.
    const cx = this.width / 2;
    this.drawCase(ctx, cx, 205, 200, 134);

    // Animated hint
    const hintY = 312;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    const arrowBob = Math.sin(t * 2.2) * 3;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.font = '500 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '点击箱子开箱' : 'Click the case to open', cx, hintY);
    ctx.globalAlpha = 1;
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.accent;
    ctx.fillText('▾', cx, hintY + 18 + arrowBob);

    // Mode switcher (only when more than one animation exists)
    if (openingModeCount() > 1) {
      const label = openingModeLabel(this.animModeIndex);
      ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textDim;
      ctx.fillText(zh ? `动画 · ${label.nameZh} ◂ ▸` : `Mode · ${label.name} ◂ ▸`, cx, 356);
    }

    // Tier odds strip
    this.drawTierStrip(ctx, p, 24, 382, this.width - 48, 52);

    // Key hints
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.textFaint;
    ctx.fillText(
      zh ? 'R 返回 · M 音效 · Shift+R 重置统计' : 'R menu · M sound · Shift+R reset stats',
      this.width / 2, this.height - 13,
    );
  }

  private chipButton(
    ctx: CanvasRenderingContext2D,
    hit: { x: number; y: number; w: number; h: number },
    label: string,
    p: GachaPalette,
    accentText = false,
  ) {
    const dark = this.isDarkTheme();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.75)';
    roundRectPath(ctx, hit.x, hit.y, hit.w, hit.h, hit.h / 2);
    ctx.fill();
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, hit.x, hit.y, hit.w, hit.h, hit.h / 2);
    ctx.stroke();
    ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentText ? p.accent : p.textDim;
    ctx.fillText(label, hit.x + hit.w / 2, hit.y + hit.h / 2 + 1);
  }

  private drawCase(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, lidOpen = 0, shake = 0) {
    const hw = w / 2;
    const hh = h / 2;
    const bob = Math.sin(performance.now() / 640) * 3.5 + shake;
    const dark = this.isDarkTheme();
    const accentColor = dark ? '#7dd3fc' : '#0284c7';

    ctx.save();
    ctx.translate(cx + bob, cy);

    // Soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, hh - 6, hw * 0.62, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body — dark glass with metal sheen
    const grad = ctx.createLinearGradient(0, -hh, 0, hh);
    grad.addColorStop(0, dark ? '#2c3644' : '#cbd5e1');
    grad.addColorStop(0.5, dark ? '#1b222d' : '#94a3b8');
    grad.addColorStop(1, dark ? '#12161d' : '#64748b');
    ctx.fillStyle = grad;
    roundRectPath(ctx, -hw, -hh + 14, w, h - 14, 16);
    ctx.fill();

    // Hairline sheen
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, -hw + 0.5, -hh + 14.5, w - 1, h - 15, 16);
    ctx.stroke();

    // Inner glow when the lid opens
    if (lidOpen > 0) {
      const glow = ctx.createRadialGradient(0, -hh + 26, 4, 0, -hh + 26, w * 0.9);
      glow.addColorStop(0, `rgba(255,244,205,${0.6 * lidOpen})`);
      glow.addColorStop(1, 'rgba(255,244,205,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-hw, -hh, w, h);
      ctx.font = '56px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = lidOpen;
      ctx.fillText('✦', 0, -hh + 44);
      ctx.globalAlpha = 1;
    }

    // Lid — tilts back around its top-left corner as it opens.
    ctx.save();
    ctx.translate(-hw - 3, -hh + 6);
    if (lidOpen > 0) {
      ctx.rotate(-lidOpen * 0.55);
      ctx.translate(0, -lidOpen * 30);
    }
    const lidGrad = ctx.createLinearGradient(0, 0, 0, 30);
    lidGrad.addColorStop(0, dark ? '#3a4554' : '#e2e8f0');
    lidGrad.addColorStop(1, dark ? '#242c38' : '#94a3b8');
    ctx.fillStyle = lidGrad;
    roundRectPath(ctx, 0, 0, w + 6, 24, 10);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, 0.5, 0.5, w + 5, 23, 10);
    ctx.stroke();
    ctx.restore();

    // Emblem — centered rarity-agnostic spark (monochrome, premium)
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRectPath(ctx, -hw + 20, -hh + 46, w - 40, h - 64, 12);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(125,211,252,0.35)' : 'rgba(2,132,199,0.4)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, -hw + 20.5, -hh + 46.5, w - 41, h - 65, 12);
    ctx.stroke();
    ctx.font = '40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.fillText('◇', 0, 16);
    ctx.globalAlpha = 1;

    // Latch — accent hairline
    ctx.fillStyle = dark ? 'rgba(125,211,252,0.75)' : 'rgba(2,132,199,0.75)';
    roundRectPath(ctx, -13, 26, 26, 3, 1.5);
    ctx.fill();

    // Ambient glow behind the box
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 900);
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.10;
    ctx.fillRect(-hw - 16, -hh - 10, w + 32, h + 24);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private drawTierStrip(ctx: CanvasRenderingContext2D, p: GachaPalette, x: number, y: number, w: number, h: number) {
    const zh = this.isZhLang();
    const gap = 8;
    const segW = (w - gap * (GACHA_TIERS.length - 1)) / GACHA_TIERS.length;

    for (let i = 0; i < GACHA_TIERS.length; i++) {
      const tier = GACHA_TIERS[i];
      const sx = x + i * (segW + gap);

      // Glass cell
      ctx.fillStyle = p.cardFillTop;
      roundRectPath(ctx, sx, y, segW, h, 10);
      ctx.fill();
      ctx.strokeStyle = p.panelBorderSoft;
      ctx.lineWidth = 1;
      roundRectPath(ctx, sx, y, segW, h, 10);
      ctx.stroke();

      // Accent hairline on top edge
      ctx.fillStyle = tier.color;
      ctx.globalAlpha = 0.85;
      roundRectPath(ctx, sx + segW / 2 - 14, y, 28, 2.5, 1.2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.text;
      ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(tier.nameZh, sx + segW / 2, y + 18);
      ctx.fillStyle = tier.color;
      ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(`${(tier.odds * 100).toFixed(2)}%`, sx + segW / 2, y + 36);
      void zh;
    }
  }

  /* ─── Unlock prelude ─── */

  private drawUnlock(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const t = this.unlockT / UNLOCK_DURATION;

    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '解锁中…' : 'UNLOCKING…', this.width / 2, 34);

    const cx = this.width / 2;
    const cy = 216;
    const shake = t < 0.45 ? Math.sin(t * 82) * 6 * (1 - t / 0.45) : 0;
    const lidOpen = Math.min(1, Math.max(0, (t - 0.35) / 0.5));
    this.drawCase(ctx, cx, cy, 200, 134, lidOpen, shake);

    if (lidOpen > 0) {
      ctx.save();
      ctx.translate(cx, cy - 46);
      ctx.globalAlpha = lidOpen;
      ctx.strokeStyle = 'rgba(255,238,180,0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i - 5.5) * 0.15 + Math.sin(t * 6 + i) * 0.03;
        const len = 70 + 100 * lidOpen;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (t > 0.86) {
      ctx.fillStyle = `rgba(255,246,214,${(t - 0.86) / 0.14 * 0.34})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /* ─── Opening (mode-driven) ─── */

  private drawOpening(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    if (!this.animMode) return;
    this.animMode.draw(ctx);

    const zh = this.isZhLang();
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '开箱中…' : 'OPENING…', this.width / 2, 28);
  }

  /* ─── Result ─── */

  private drawResult(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    if (!this.roll) return;
    const zh = this.isZhLang();
    const tier = this.roll.tier;
    const item = this.roll.item;
    const owned = this.stats.itemCounts[item.id] ?? 0;
    const cx = this.width / 2;

    // Rarity radial wash
    const grad = ctx.createRadialGradient(cx, this.height / 2 - 26, 20, cx, this.height / 2 - 26, 340);
    grad.addColorStop(0, tier.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Tier kicker
    ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tier.color;
    ctx.fillText(`${tier.nameZh.toUpperCase()} · ${(tier.odds * 100).toFixed(2)}%`, cx, 38);

    // Card
    const cw = 252;
    const chh = 296;
    const pop = Math.min(1, this.revealT * 3);
    const scale = 0.86 + 0.14 * easeOutBack(pop);
    ctx.save();
    ctx.translate(cx, 216);
    ctx.scale(scale, scale);

    // Sheet
    const sheetGrad = ctx.createLinearGradient(-cw / 2, -chh / 2, cw / 2, chh / 2);
    sheetGrad.addColorStop(0, this.isDarkTheme() ? 'rgba(38,44,54,0.98)' : 'rgba(255,255,255,0.98)');
    sheetGrad.addColorStop(1, this.isDarkTheme() ? 'rgba(18,21,27,0.98)' : 'rgba(237,241,247,0.98)');
    ctx.fillStyle = sheetGrad;
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur = 48;
    roundRectPath(ctx, -cw / 2, -chh / 2, cw, chh, 22);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rarity border (gradient frame)
    const frame = ctx.createLinearGradient(0, -chh / 2, 0, chh / 2);
    frame.addColorStop(0, tier.color);
    frame.addColorStop(1, shade(tier.color, -0.5));
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    roundRectPath(ctx, -cw / 2, -chh / 2, cw, chh, 22);
    ctx.stroke();
    ctx.strokeStyle = this.isDarkTheme() ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, -cw / 2 + 3, -chh / 2 + 3, cw - 6, chh - 6, 19);
    ctx.stroke();

    // NEW badge
    if (this.isNewItem) {
      ctx.save();
      ctx.rotate(-0.1);
      ctx.fillStyle = tier.color;
      roundRectPath(ctx, cw / 2 - 58, -chh / 2 + 12, 46, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#12151b';
      ctx.font = '700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(zh ? 'NEW' : 'NEW', cw / 2 - 35, -chh / 2 + 22);
      ctx.restore();
    }

    // Content
    ctx.font = '56px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.text;
    ctx.fillText(item.emoji, 0, -38);
    ctx.font = '600 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(truncate(item.nameZh, 14), 0, 44);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(truncate(item.name, 30), 0, 74);
    ctx.fillStyle = tier.color;
    ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(zh ? `拥有 ×${owned}` : `OWNED ×${owned}`, 0, 116);
    ctx.restore();

    // Buttons — one primary action only
    const again = this.hitAgain();
    this.primaryButton(ctx, again, zh ? '再抽一次' : 'DRAW AGAIN', p);
  }

  /* ─── Gallery (prize showcase, all prizes on one page) ─── */

  private drawGallery(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();

    glassPanel(ctx, 24, 14, this.width - 48, 40, p, 12);
    ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '全部奖品' : 'ALL PRIZES', 42, 34);
    this.chipButton(ctx, this.hitBack(), zh ? '菜单' : 'MENU', p);

    // Rarity legend row: swatch + name, one per grade.
    const legendW = (this.width - 48 - 8 * (GACHA_TIERS.length - 1)) / GACHA_TIERS.length;
    for (let i = 0; i < GACHA_TIERS.length; i++) {
      const tier = GACHA_TIERS[i];
      const x = 24 + i * (legendW + 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = tier.color;
      roundRectPath(ctx, x, 68, 3, 14, 1.5);
      ctx.fill();
      ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(tier.nameZh, x + 9, 71);
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(`${GACHA_POOL[tier.id].length} · ${(tier.odds * 100).toFixed(2)}%`, x + 9, 84);
    }

    // Compact grid: all prizes on one page. High tiers first.
    const perLine = 6;
    const gap = 8;
    const cardW = (this.width - 48 - gap * (perLine - 1)) / perLine;
    const cardH = 52;
    const startY = 104;
    const items: { item: GachaItem; tier: GachaTier }[] = [];
    for (const tierId of [...GACHA_TIER_ORDER].reverse()) {
      const tier = GACHA_TIERS.find((t) => t.id === tierId)!;
      for (const item of GACHA_POOL[tierId]) items.push({ item, tier });
    }

    for (let i = 0; i < items.length; i++) {
      const col = i % perLine;
      const row = Math.floor(i / perLine);
      const x = 24 + col * (cardW + gap);
      const y = startY + row * (cardH + 6);
      const owned = this.stats.itemCounts[items[i].item.id] ?? 0;
      this.drawItemCard(ctx, x, y, cardW, cardH, items[i].tier, items[i].item, owned, p);
    }
  }

  private drawItemCard(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    tier: GachaTier, item: GachaItem, owned: number,
    p: GachaPalette,
  ) {
    const locked = owned <= 0;
    const dark = this.isDarkTheme();

    // Sheet
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (locked) {
      grad.addColorStop(0, dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, dark ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.3)');
    } else {
      grad.addColorStop(0, p.cardFillTop);
      grad.addColorStop(1, p.cardFillBottom);
    }
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();

    // Border: rarity hairline when owned, neutral when locked
    ctx.strokeStyle = locked ? p.panelBorderSoft : p.panelBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.stroke();

    // Rarity top edge
    if (!locked) {
      ctx.fillStyle = tier.color;
      ctx.globalAlpha = 0.9;
      roundRectPath(ctx, x + w / 2 - 12, y + 5, 24, 2, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (locked) {
      ctx.globalAlpha = 0.3;
      ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
      ctx.fillText(item.emoji, x + w / 2, y + h / 2 - 6);
      ctx.globalAlpha = 1;
      ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 8), x + w / 2, y + h / 2 + 16);
      return;
    }

    ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(item.emoji, x + w / 2, y + h / 2 - 6);
    ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 8), x + w / 2, y + h / 2 + 16);

    ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textFaint;
    ctx.textAlign = 'right';
    ctx.fillText(`×${owned}`, x + w - 6, y + h / 2 - 12);
  }

  /* ─── Stats ─── */

  private drawStats(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const total = this.stats.totalPulls;

    glassPanel(ctx, 24, 14, this.width - 48, 40, p, 12);
    ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '抽取统计' : 'PULL STATS', 42, 34);
    this.chipButton(ctx, this.hitBack(), zh ? '菜单' : 'MENU', p);

    if (this.statsPage === 0) {
      // Total pulls — hero number
      ctx.textAlign = 'center';
      ctx.font = '600 30px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = p.text;
      ctx.fillText(String(total), this.width / 2, 92);
      ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textDim;
      ctx.fillText(zh ? '累计抽取次数' : 'TOTAL PULLS', this.width / 2, 118);

      // Per-tier bars (high tiers first)
      const barX = 64;
      const barW = this.width - 240;
      let y = 150;
      for (const tierId of [...GACHA_TIER_ORDER].reverse()) {
        const tier = GACHA_TIERS.find((t) => t.id === tierId)!;
        const count = this.stats.tierCounts[tierId];
        const pct = total > 0 ? (count / total) * 100 : 0;
        ctx.textAlign = 'left';
        ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = p.textDim;
        ctx.fillText(tier.nameZh, 36, y);

        // Track + fill
        ctx.fillStyle = this.isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.07)';
        roundRectPath(ctx, barX, y - 6, barW, 12, 6);
        ctx.fill();
        if (pct > 0) {
          ctx.fillStyle = tier.color;
          roundRectPath(ctx, barX, y - 6, Math.max(3, (barW * pct) / 100), 12, 6);
          ctx.fill();
        }
        ctx.fillStyle = p.text;
        ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(count), this.width - 146, y);
        ctx.fillStyle = p.textFaint;
        ctx.fillText(`${pct.toFixed(1)}%`, this.width - 84, y);
        y += 34;
      }
    } else {
      // Item counts + recent pulls
      const allItems = GACHA_TIERS.flatMap((tier) => GACHA_POOL[tier.id].map((item) => ({ item, tier })));
      const cardW = 88;
      const cardH = 48;
      const cols = 6;
      const gapX = (this.width - 60 - cardW * cols) / (cols - 1);
      let idx = 0;
      const rowStartY = 70;
      const rows = Math.ceil(allItems.length / cols);
      for (const entry of allItems) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        this.drawItemCard(ctx, 30 + col * (cardW + gapX), rowStartY + row * (cardH + 6), cardW, cardH, entry.tier, entry.item, this.stats.itemCounts[entry.item.id] ?? 0, p);
        idx++;
      }

      const hy = rowStartY + rows * (cardH + 6) + 8;
      ctx.textAlign = 'left';
      ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.text;
      ctx.fillText(zh ? '最近抽取' : 'RECENT PULLS', 30, hy);
      const recent = this.stats.history.slice(0, 12);
      let hx = 30;
      for (const entry of recent) {
        const tier = GACHA_TIERS.find((t) => t.id === entry.tierId);
        const item = allItems.find((e) => e.item.id === entry.itemId)?.item;
        if (!tier || !item) continue;
        ctx.font = '15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = p.textDim;
        ctx.fillText(item.emoji, hx + 12, hy + 20);
        ctx.beginPath();
        ctx.fillStyle = tier.color;
        ctx.arc(hx + 12, hy + 34, 2.5, 0, Math.PI * 2);
        ctx.fill();
        hx += 40;
        if (hx > this.width - 50) break;
      }
      if (recent.length === 0) {
        ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = p.textFaint;
        ctx.fillText(zh ? '还没有抽取记录' : 'No pulls yet', 30, hy + 20);
      }
    }

    this.pager(ctx, this.statsPage, 2, p);

    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = p.textFaint;
    ctx.fillText('Shift+R ' + (zh ? '重置统计' : 'reset stats'), this.width - 26, this.height - 12);
  }

  private pager(ctx: CanvasRenderingContext2D, page: number, totalPages: number, p: GachaPalette) {
    const y = this.height - 30;
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.textDim;
    ctx.fillText(`${page + 1} / ${totalPages}`, this.width / 2, y);
    ctx.fillStyle = page > 0 ? p.textDim : p.textFaint;
    ctx.textAlign = 'left';
    ctx.fillText('‹', 168, y);
    ctx.fillStyle = page < totalPages - 1 ? p.textDim : p.textFaint;
    ctx.textAlign = 'right';
    ctx.fillText('›', this.width - 168, y);
  }

  /* ─── Shared drawing helpers ─── */

  private primaryButton(
    ctx: CanvasRenderingContext2D,
    hit: { x: number; y: number; w: number; h: number },
    label: string,
    p: GachaPalette,
  ) {
    const dark = this.isDarkTheme();
    const grad = ctx.createLinearGradient(0, hit.y, 0, hit.y + hit.h);
    if (dark) {
      grad.addColorStop(0, 'rgba(125,211,252,0.2)');
      grad.addColorStop(1, 'rgba(125,211,252,0.08)');
    } else {
      grad.addColorStop(0, 'rgba(2,132,199,0.14)');
      grad.addColorStop(1, 'rgba(2,132,199,0.05)');
    }
    ctx.fillStyle = grad;
    roundRectPath(ctx, hit.x, hit.y, hit.w, hit.h, hit.h / 2);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(125,211,252,0.5)' : 'rgba(2,132,199,0.45)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, hit.x, hit.y, hit.w, hit.h, hit.h / 2);
    ctx.stroke();
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#bae6fd' : '#075985';
    ctx.fillText(label, hit.x + hit.w / 2, hit.y + hit.h / 2 + 1);
  }

  /* ─── Hit regions ─── */

  private hitSound() { return { x: this.width - 138, y: 22, w: 58, h: 24 }; }
  private hitStats() { return { x: this.width - 196, y: 22, w: 52, h: 24 }; }
  private hitPrizes() { return { x: this.width - 254, y: 22, w: 52, h: 24 }; }
  private hitBack() { return { x: this.width - 104, y: 22, w: 56, h: 24 }; }
  private hitAgain() { return { x: this.width / 2 - 92, y: 402, w: 184, h: 44 }; }

  private canvasHit(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /* ─── Input ─── */

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.type !== 'keydown' || e.repeat) return;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

      if ((e.key === 'r' || e.key === 'R') && e.shiftKey) {
        if (this.screen !== 'unlock' && this.screen !== 'opening') this.resetStats();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        this.sfx.enabled = !this.sfx.enabled;
        if (this.sfx.enabled) this.sfx.prime();
        return;
      }
      // While a prelude or reel is running, nothing but the sound toggle
      // responds: the animation always runs to completion on its own.
      if (this.screen === 'unlock' || this.screen === 'opening') return;
      if (e.key === 'Escape') {
        if (this.screen === 'gallery' || this.screen === 'stats' || this.screen === 'result') this.gotoMenu();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (this.screen !== 'menu') this.gotoMenu();
        return;
      }
      if (e.key === ' ') {
        if (this.screen === 'menu') {
          this.sfx.prime();
          this.sfx.click();
          this.startUnlock();
        } else if (this.screen === 'result') {
          this.sfx.click();
          this.startUnlock();
        }
        return;
      }
      return;
    }

    // Pointer input
    const isDown = e instanceof MouseEvent ? e.type === 'mousedown' : e.type === 'touchstart';
    if (!isDown) return;
    this.sfx.prime();

    let clientX: number;
    let clientY: number;
    if (e instanceof MouseEvent) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      const touch = e.changedTouches?.[0] ?? e.touches?.[0];
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    }

    const pt = this.canvasPoint(clientX, clientY);
    if (!pt) return;
    const { x, y } = pt;

    switch (this.screen) {
      case 'menu': {
        if (this.canvasHit(x, y, this.hitPrizes())) { this.sfx.click(); this.screen = 'gallery'; this.canvas.dataset.gachaScreen = 'gallery'; return; }
        if (this.canvasHit(x, y, this.hitStats())) { this.sfx.click(); this.statsPage = 0; this.screen = 'stats'; this.canvas.dataset.gachaScreen = 'stats'; return; }
        if (this.canvasHit(x, y, this.hitSound())) { this.sfx.enabled = !this.sfx.enabled; if (this.sfx.enabled) this.sfx.prime(); return; }
        // Mode switcher (only when > 1 mode registered)
        if (openingModeCount() > 1) {
          if (x < this.width / 2 - 10 && x > this.width / 2 - 120 && Math.abs(y - 356) < 12) {
            this.animModeIndex = (this.animModeIndex - 1 + openingModeCount()) % openingModeCount();
            this.sfx.click();
            return;
          }
          if (x > this.width / 2 + 10 && x < this.width / 2 + 120 && Math.abs(y - 356) < 12) {
            this.animModeIndex = (this.animModeIndex + 1) % openingModeCount();
            this.sfx.click();
            return;
          }
        }
        // Click the case → unlock prelude, then reel.
        this.sfx.click();
        this.startUnlock();
        return;
      }
      case 'unlock':
      case 'opening': {
        // The prelude and the reel run to completion on their own.
        return;
      }
      case 'result': {
        this.sfx.click();
        this.startUnlock();
        return;
      }
      case 'gallery': {
        if (this.canvasHit(x, y, this.hitBack())) { this.sfx.click(); this.gotoMenu(); return; }
        return;
      }
      case 'stats': {
        if (this.canvasHit(x, y, this.hitBack())) { this.sfx.click(); this.gotoMenu(); return; }
        if (this.canvasHit(x, y, { x: 130, y: this.height - 44, w: 60, h: 24 }) && this.statsPage > 0) { this.statsPage = 0; this.sfx.click(); return; }
        if (this.canvasHit(x, y, { x: this.width - 190, y: this.height - 44, w: 60, h: 24 }) && this.statsPage < 1) { this.statsPage = 1; this.sfx.click(); return; }
        return;
      }
    }
  }
}

/* ── drawing helpers ── */

function drawBg(ctx: CanvasRenderingContext2D, width: number, height: number, p: GachaPalette) {
  const grad = ctx.createLinearGradient(0, 0, width * 0.25, height);
  grad.addColorStop(0, p.bgTop);
  grad.addColorStop(1, p.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Soft ambient accent
  const ambient = ctx.createRadialGradient(width / 2, height * 0.35, 30, width / 2, height * 0.35, width * 0.75);
  ambient.addColorStop(0, p.glow);
  ambient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);
}

function glassPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  p: GachaPalette,
  radius: number,
) {
  ctx.fillStyle = p.panel;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = p.panelBorder;
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
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

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + Math.round(amount * 255)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round(amount * 255)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round(amount * 255)));
  return `rgb(${r},${g},${b})`;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
