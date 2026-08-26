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
  Particles,
  ScreenShake,
  fx as fxPresets,
  drawGlow,
  fillGlassPanel,
  fillSphere,
  drawVignette,
  makeSprite,
  drawSprite,
  shade as shadeFx,
  withAlpha,
  clamp,
  lerp,
  ease,
  TAU,
} from '../core/fx.js';
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
import { drawWeaponIcon } from './gachaWeaponIcons.js';

type Screen = 'menu' | 'unlock' | 'opening' | 'result' | 'gallery' | 'stats';

interface DustMote {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  drift: number;
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
  private notify = '';
  private notifyTimer = 0;
  private statsPage = 0;
  private unlockT = 0;
  private startedOnce = false;

  /* ─── Visual-craft state (cosmetic only — never touches odds/state) ─── */
  private readonly burst = new Particles();
  private readonly shakeFx = new ScreenShake();
  private revealFlash = 0;   // fullscreen rarity flash on top-tier reveals
  private beamT = 0;         // result light-pillar timer
  private ambientT = 0;      // clock for dust drift and idle pulses
  private dustMotes: DustMote[] = [];
  private caseBodyCache: { dark: boolean; sprite: HTMLCanvasElement } | null = null;
  private readonly weaponSprites = new Map<string, HTMLCanvasElement>();

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
    this.burst.clear();
    this.shakeFx.reset();
    this.revealFlash = 0;
    this.beamT = 0;
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
    this.burst.clear();
    this.screen = 'result';
    this.canvas.dataset.gachaScreen = 'result';

    const tier = this.roll.tier;
    const cx = this.width / 2;
    const cy = this.height / 2 - 26;

    // Rarity-graded ceremony: common gets a small pop; classified adds a
    // shock ring; covert/gold get flash, confetti, light pillar, shake.
    if (!RESULT_PARTICLES_TIERS.has(tier.id)) {
      for (const cfg of fxPresets.pop(cx, cy, [tier.color, '#ffffff'])) this.burst.emit(cfg);
      return;
    }

    this.burst.emit({
      x: cx, y: cy, count: 1, speed: 0, life: 0.55, size: [12, 16],
      colors: ['#ffffff'], shape: 'ring', endScale: 10,
    });
    this.burst.emit({
      x: cx, y: cy, count: 20, speed: [70, 260], life: [0.3, 0.75], size: [1.5, 3],
      colors: [tier.color, '#ffffff'], shape: 'spark', drag: 2.4,
    });

    if (tier.id !== 'classified') {
      this.revealFlash = tier.id === 'rarespecial' ? 1 : 0.6;
      this.beamT = 2.6;
      this.shakeFx.add(tier.id === 'rarespecial' ? 0.75 : 0.45);
      this.burst.emit(fxPresets.confetti(cx, cy - 40, [tier.color, '#ffd700', '#ffffff']));
      if (tier.id === 'rarespecial') {
        this.burst.emit(fxPresets.confetti(cx - 150, cy - 90, [tier.color, '#ffe9a8', '#ffffff']));
        this.burst.emit(fxPresets.confetti(cx + 150, cy - 90, [tier.color, '#ffe9a8', '#ffffff']));
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
    this.ambientT += dt;
    this.burst.update(dt);
    this.shakeFx.update(dt);
    if (this.revealFlash > 0) this.revealFlash = Math.max(0, this.revealFlash - dt * 1.6);
    if (this.beamT > 0) this.beamT = Math.max(0, this.beamT - dt);

    if (this.screen === 'result') {
      this.revealT += dt;
      return;
    }

    if (this.screen === 'unlock') {
      this.unlockT += dt;
      this.emitChargeParticles();
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

  /** Energy motes converge on the case mouth as the unlock charge builds. */
  private emitChargeParticles() {
    if (this.burst.count > 150) return;
    const t = clamp(this.unlockT / UNLOCK_DURATION, 0, 1);
    if (Math.random() > 0.3 + t * 0.65) return;
    const mouthX = this.width / 2;
    const mouthY = 216 - 46;
    const a = Math.random() * TAU;
    const r = 80 + Math.random() * 80;
    const sx = mouthX + Math.cos(a) * r * 1.5;
    const sy = mouthY + Math.sin(a) * r * 0.85;
    const speed = 130 + 240 * t;
    this.burst.emit({
      x: sx,
      y: sy,
      count: 2,
      angle: Math.atan2(mouthY - sy, mouthX - sx),
      spread: 0.22,
      speed,
      life: (r / speed) * (0.85 + Math.random() * 0.3),
      size: [1, 2.6],
      colors: ['#ffe9a8', '#ffd076', '#7dd3fc'],
      shape: 'glow',
    });
  }

  /* ─── Draw ─── */

  draw(ctx: CanvasRenderingContext2D) {
    const dark = this.isDarkTheme();
    const p = palette(dark);

    this.shakeFx.apply(ctx, () => {
      drawBg(ctx, this.width, this.height, p);
      if (this.screen !== 'opening') this.drawDust(ctx, dark);

      switch (this.screen) {
        case 'menu': this.drawMenu(ctx, p); break;
        case 'unlock': this.drawUnlock(ctx, p); break;
        case 'opening': this.drawOpening(ctx, p); break;
        case 'result': this.drawResult(ctx, p); break;
        case 'gallery': this.drawGallery(ctx, p); break;
        case 'stats': this.drawStats(ctx, p); break;
      }

      drawVignette(ctx, this.width, this.height, dark ? 0.3 : 0.12);
    });

    // Burst overlay (charge motes, shock rings, confetti)
    this.burst.draw(ctx);

    // Rarity flash — brief fullscreen bloom on top-tier reveals
    if (this.revealFlash > 0) {
      ctx.fillStyle = `rgba(255,248,230,${(this.revealFlash * 0.8).toFixed(3)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

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

  /** Slow ambient dust drifting behind the panels. */
  private drawDust(ctx: CanvasRenderingContext2D, dark: boolean) {
    if (this.dustMotes.length === 0) {
      for (let i = 0; i < 24; i++) {
        const h1 = hash01(i * 3 + 1);
        const h2 = hash01(i * 3 + 7);
        const h3 = hash01(i * 3 + 13);
        this.dustMotes.push({
          x: h1 * this.width,
          y: h2 * this.height,
          r: 0.6 + h3 * 1.5,
          phase: h1 * TAU,
          speed: 0.35 + h2 * 0.5,
          drift: 5 + h3 * 12,
        });
      }
    }
    const t = this.ambientT;
    const span = this.height + 48;
    ctx.save();
    ctx.fillStyle = dark ? '#dbe7f3' : '#8aa0b8';
    for (const mote of this.dustMotes) {
      const x = mote.x + Math.sin(t * mote.speed + mote.phase) * mote.drift;
      const y = (((mote.y - t * 7 * mote.speed) % span) + span) % span - 24;
      const tw = 0.5 + 0.5 * Math.sin(t * 0.9 + mote.phase * 2);
      ctx.globalAlpha = (dark ? 0.05 : 0.07) + 0.09 * tw;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─── Menu ─── */

  private drawMenu(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const t = performance.now() / 1000;

    // Header bar
    fillGlassPanel(ctx, 24, 14, this.width - 48, 40, 12, {
      fill: p.panel,
      border: p.panelBorder,
      glow: p.accent,
    });
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
      // Glowing tab underline under the active mode label
      const tabPulse = 0.55 + 0.3 * Math.sin(t * 2.2);
      ctx.globalAlpha = tabPulse;
      ctx.fillStyle = p.accent;
      roundRectPath(ctx, cx - 42, 366, 84, 2, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawGlow(ctx, cx, 367, 34, p.accent, 0.22 * tabPulse);
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
    const dark = this.isDarkTheme();
    const accentColor = dark ? '#7dd3fc' : '#0284c7';
    const t = this.ambientT;
    const bob = Math.sin(t * 1.55) * 3.5 + shake;

    // Ambient halo behind the case
    drawGlow(ctx, cx + bob, cy - 6, w * 0.72, accentColor, dark ? 0.16 + 0.05 * Math.sin(t * 1.1) : 0.1);

    ctx.save();
    ctx.translate(cx + bob, cy);

    // Soft ground shadow
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.32)' : 'rgba(15,23,42,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, hh - 4, hw * 0.64, 10, 0, 0, TAU);
    ctx.fill();

    // Pre-rendered brushed-metal body (rebuilt on theme switch)
    const body = this.caseBody(dark);
    ctx.drawImage(body, -hw - 28, -hh - 28, w + 56, h + 56);

    // Glowing seam along the lid line — breathes, brightens while opening
    const seamPulse = clamp(0.45 + 0.3 * Math.sin(t * 2.2) + lidOpen * 0.6, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = seamPulse * (dark ? 0.55 : 0.4);
    const seam = ctx.createLinearGradient(-hw, 0, hw, 0);
    seam.addColorStop(0, 'rgba(125,211,252,0)');
    seam.addColorStop(0.5, dark ? 'rgba(125,211,252,0.9)' : 'rgba(2,132,199,0.8)');
    seam.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = seam;
    roundRectPath(ctx, -hw + 8, -hh + 12, w - 16, 3, 1.5);
    ctx.fill();
    ctx.restore();

    // Inner glow when the lid opens
    if (lidOpen > 0) {
      const glow = ctx.createRadialGradient(0, -hh + 26, 4, 0, -hh + 26, w * 0.9);
      glow.addColorStop(0, `rgba(255,244,205,${0.6 * lidOpen})`);
      glow.addColorStop(1, 'rgba(255,244,205,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-hw, -hh, w, h);
      ctx.font = '52px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = lidOpen;
      ctx.fillText('✦', 0, -hh + 44);
      ctx.globalAlpha = 1;
    }

    // Lid — live because it tilts back around its top-left corner
    ctx.save();
    ctx.translate(-hw - 3, -hh + 6);
    if (lidOpen > 0) {
      ctx.rotate(-lidOpen * 0.55);
      ctx.translate(0, -lidOpen * 30);
    }
    const lidGrad = ctx.createLinearGradient(0, 0, 0, 30);
    lidGrad.addColorStop(0, dark ? '#46536a' : '#eef2f7');
    lidGrad.addColorStop(0.55, dark ? '#2b3444' : '#aeb9c8');
    lidGrad.addColorStop(1, dark ? '#1d2430' : '#8a97a8');
    ctx.fillStyle = lidGrad;
    roundRectPath(ctx, 0, 0, w + 6, 24, 10);
    ctx.fill();
    // Sheen on the lid's top edge
    ctx.save();
    roundRectPath(ctx, 0, 0, w + 6, 24, 10);
    ctx.clip();
    const lidSheen = ctx.createLinearGradient(0, 0, 0, 12);
    lidSheen.addColorStop(0, 'rgba(255,255,255,0.28)');
    lidSheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lidSheen;
    ctx.fillRect(0, 0, w + 6, 12);
    ctx.restore();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, 0.5, 0.5, w + 5, 23, 10);
    ctx.stroke();
    // Recessed grip rib on the lid
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.12)';
    roundRectPath(ctx, 14, 10, w - 22, 4, 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /** Static case body art, pre-rendered once per theme. */
  private caseBody(dark: boolean): HTMLCanvasElement {
    if (this.caseBodyCache && this.caseBodyCache.dark === dark) return this.caseBodyCache.sprite;
    const w = 200;
    const h = 134;
    const sprite = makeSprite(w + 56, h + 56, (c) => {
      c.translate((w + 56) / 2, (h + 56) / 2);
      const hw = w / 2;
      const hh = h / 2;

      // Brushed-metal shell
      const grad = c.createLinearGradient(0, -hh, 0, hh);
      grad.addColorStop(0, dark ? '#333f51' : '#d7dee8');
      grad.addColorStop(0.45, dark ? '#1e2632' : '#9aa7b8');
      grad.addColorStop(1, dark ? '#10141b' : '#5f6c7f');
      c.fillStyle = grad;
      roundRectPath(c, -hw, -hh + 14, w, h - 14, 16);
      c.fill();

      c.save();
      roundRectPath(c, -hw, -hh + 14, w, h - 14, 16);
      c.clip();
      // Top bevel light / bottom shade
      const top = c.createLinearGradient(0, -hh + 14, 0, -hh + 42);
      top.addColorStop(0, 'rgba(255,255,255,0.22)');
      top.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = top;
      c.fillRect(-hw, -hh + 14, w, 28);
      const bottom = c.createLinearGradient(0, hh - 22, 0, hh);
      bottom.addColorStop(0, 'rgba(0,0,0,0)');
      bottom.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = bottom;
      c.fillRect(-hw, hh - 22, w, 22);
      // Brushed vertical striations
      c.globalAlpha = dark ? 0.05 : 0.08;
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        c.fillRect(-hw + 18 + i * 26, -hh + 16, 1, h - 18);
      }
      c.globalAlpha = 1;
      c.restore();

      // Hairline edge
      c.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
      roundRectPath(c, -hw + 0.5, -hh + 14.5, w - 1, h - 15, 16);
      c.stroke();

      // Recessed emblem plate
      const plate = c.createLinearGradient(0, -hh + 46, 0, hh - 18);
      plate.addColorStop(0, dark ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.35)');
      plate.addColorStop(1, dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.12)');
      c.fillStyle = plate;
      roundRectPath(c, -hw + 20, -hh + 46, w - 40, h - 64, 12);
      c.fill();
      c.strokeStyle = dark ? 'rgba(125,211,252,0.4)' : 'rgba(2,132,199,0.45)';
      c.lineWidth = 1;
      roundRectPath(c, -hw + 20.5, -hh + 46.5, w - 41, h - 65, 12);
      c.stroke();
      c.font = '40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = dark ? 'rgba(224,242,254,0.92)' : 'rgba(3,105,161,0.85)';
      c.fillText('◇', 0, 16);

      // Corner rivets
      const rivetBase = dark ? '#5b6b82' : '#b8c2d0';
      for (const [rx, ry] of [[-hw + 12, -hh + 26], [hw - 12, -hh + 26], [-hw + 12, hh - 12], [hw - 12, hh - 12]] as const) {
        fillSphere(c, rx, ry, 2.6, rivetBase, { rim: 0.2 });
      }

      // Latch — accent gradient bar
      const latch = c.createLinearGradient(-13, 0, 13, 0);
      latch.addColorStop(0, dark ? 'rgba(125,211,252,0.25)' : 'rgba(2,132,199,0.3)');
      latch.addColorStop(0.5, dark ? 'rgba(125,211,252,0.9)' : 'rgba(2,132,199,0.85)');
      latch.addColorStop(1, dark ? 'rgba(125,211,252,0.25)' : 'rgba(2,132,199,0.3)');
      c.fillStyle = latch;
      roundRectPath(c, -13, 26, 26, 3, 1.5);
      c.fill();
    }, 2);
    this.caseBodyCache = { dark, sprite };
    return sprite;
  }

  private drawTierStrip(ctx: CanvasRenderingContext2D, p: GachaPalette, x: number, y: number, w: number, h: number) {
    const zh = this.isZhLang();
    const gap = 8;
    const segW = (w - gap * (GACHA_TIERS.length - 1)) / GACHA_TIERS.length;

    for (let i = 0; i < GACHA_TIERS.length; i++) {
      const tier = GACHA_TIERS[i];
      const sx = x + i * (segW + gap);

      // Glass cell with a soft vertical falloff
      const cell = ctx.createLinearGradient(0, y, 0, y + h);
      cell.addColorStop(0, p.cardFillTop);
      cell.addColorStop(1, p.cardFillBottom);
      ctx.fillStyle = cell;
      roundRectPath(ctx, sx, y, segW, h, 10);
      ctx.fill();
      ctx.strokeStyle = p.panelBorderSoft;
      ctx.lineWidth = 1;
      roundRectPath(ctx, sx, y, segW, h, 10);
      ctx.stroke();

      // Rarity underline with a soft glow
      ctx.fillStyle = tier.color;
      ctx.globalAlpha = 0.85;
      roundRectPath(ctx, sx + segW / 2 - 14, y, 28, 2.5, 1.2);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawGlow(ctx, sx + segW / 2, y + 2, 16, tier.color, this.isDarkTheme() ? 0.35 : 0.2);

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

    // Browse chips are live during the prelude too.
    this.chipButton(ctx, this.hitPrizeChip(), zh ? '奖品' : 'PRIZES', p);
    this.chipButton(ctx, this.hitHomeChip(), zh ? '首页' : 'HOME', p);

    const cx = this.width / 2;
    const cy = 216;
    // Charge-up tremble: amplitude grows as energy builds toward the pop,
    // then settles while the lid swings open.
    const charge = clamp(t / 0.45, 0, 1);
    const shake = t < 0.5
      ? Math.sin(t * 90) * (1.2 + 7 * charge * charge)
      : Math.sin(t * 40) * 1.5 * (1 - t);
    const lidOpen = Math.min(1, Math.max(0, (t - 0.35) / 0.5));
    this.drawCase(ctx, cx, cy, 200, 134, lidOpen, shake);

    if (lidOpen > 0) {
      // Warm energy welling out of the case mouth
      drawGlow(ctx, cx, cy - 46, 60 + 90 * lidOpen, '#ffe9a8', 0.5 * lidOpen);
    }

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

    // Keep browsing alive during the spin: prizes + home take priority.
    this.chipButton(ctx, this.hitPrizeChip(), zh ? '奖品' : 'PRIZES', p, false);
    this.chipButton(ctx, this.hitHomeChip(), zh ? '首页' : 'HOME', p, false);
  }

  /* ─── Result ─── */

  private drawResult(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    if (!this.roll) return;
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();
    const tier = this.roll.tier;
    const item = this.roll.item;
    const owned = this.stats.itemCounts[item.id] ?? 0;
    const cx = this.width / 2;
    const topTier = tier.id === 'covert' || tier.id === 'rarespecial';

    // Rarity radial wash (restrained on light theme to avoid a heavy blob)
    const grad = ctx.createRadialGradient(cx, this.height / 2 - 26, 20, cx, this.height / 2 - 26, 340);
    grad.addColorStop(0, tier.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = dark ? 1 : 0.5;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    // Light pillar behind the card for top tiers (while the beam timer runs)
    if (this.beamT > 0 && topTier) {
      const beamA = clamp(this.beamT / 2.6, 0, 1) * (0.55 + 0.2 * Math.sin(this.ambientT * 6));
      const beam = ctx.createLinearGradient(0, 0, 0, this.height);
      beam.addColorStop(0, withAlpha(tier.color, 0));
      beam.addColorStop(0.5, withAlpha(tier.color, 0.26 * beamA));
      beam.addColorStop(1, withAlpha(tier.color, 0));
      ctx.fillStyle = beam;
      ctx.fillRect(cx - 46, 0, 92, this.height);
      drawGlow(ctx, cx, this.height / 2 - 26, 200, tier.color, (dark ? 0.3 : 0.2) * beamA);
    }

    // Tier kicker
    ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tier.color;
    ctx.fillText(`${tier.nameZh.toUpperCase()} · ${(tier.odds * 100).toFixed(2)}%`, cx, 38);

    // Card pop-in
    const cw = 252;
    const chh = 296;
    const pop = Math.min(1, this.revealT * 3);
    const scale = 0.86 + 0.14 * ease('outBack', pop);

    // Breathing rarity halo behind the card
    drawGlow(ctx, cx, 216, 190, tier.color, (dark ? 0.28 : 0.18) * (0.7 + 0.3 * Math.sin(this.ambientT * 2.4)));

    ctx.save();
    ctx.translate(cx, 216);
    ctx.scale(scale, scale);

    // Glass sheet with rarity edge glow
    fillGlassPanel(ctx, -cw / 2, -chh / 2, cw, chh, 22, {
      fill: dark ? 'rgba(38,44,54,0.96)' : 'rgba(255,255,255,0.96)',
      fill2: dark ? 'rgba(18,21,27,0.96)' : 'rgba(237,241,247,0.96)',
      border: withAlpha(tier.color, 0.35),
      glow: tier.color,
    });

    // Rarity border (gradient frame)
    const frame = ctx.createLinearGradient(0, -chh / 2, 0, chh / 2);
    frame.addColorStop(0, tier.color);
    frame.addColorStop(1, shadeFx(tier.color, -0.5));
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    roundRectPath(ctx, -cw / 2, -chh / 2, cw, chh, 22);
    ctx.stroke();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)';
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

    // Content — pre-rendered weapon silhouette with a rarity-colored aura
    const icon = this.weaponSprite(item.icon ?? item.kind, tier.color, 0.95);
    drawSprite(ctx, icon, 0, -30, 195, 195, { shadowColor: tier.color, shadowBlur: 26 });
    ctx.font = '600 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.text;
    ctx.fillText(truncate(item.nameZh, 14), 0, 52);
    // Subtitle only when the English name differs (pure-weapon names would
    // otherwise print the same string twice).
    if (item.name !== item.nameZh) {
      ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textDim;
      ctx.fillText(truncate(item.name, 30), 0, 80);
    }
    ctx.fillStyle = tier.color;
    ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(zh ? `拥有 ×${owned}` : `OWNED ×${owned}`, 0, 118);

    // Diagonal shine sweep across the card, looping with a rest period
    const sweepT = (this.revealT - 0.4) % 3.6;
    if (this.revealT > 0.4 && sweepT < 1.2) {
      const k = ease('inOutQuad', sweepT / 1.2);
      const bx = lerp(-cw * 0.75, cw * 0.75, k);
      ctx.save();
      roundRectPath(ctx, -cw / 2, -chh / 2, cw, chh, 22);
      ctx.clip();
      ctx.translate(bx, 0);
      ctx.rotate(0.42);
      const band = ctx.createLinearGradient(-34, 0, 34, 0);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.5)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-34, -chh, 68, chh * 2);
      ctx.restore();
    }

    ctx.restore();

    // Buttons — one primary action only
    const again = this.hitAgain();
    this.primaryButton(ctx, again, zh ? '再抽一次' : 'DRAW AGAIN', p);
  }

  /** Pre-rendered weapon silhouette, cached per icon + color. */
  private weaponSprite(iconId: string, color: string, alpha: number): HTMLCanvasElement {
    const key = `${iconId}|${color}|${alpha}`;
    let sprite = this.weaponSprites.get(key);
    if (!sprite) {
      sprite = makeSprite(120, 120, (c) => {
        drawWeaponIcon(c, iconId, 60, 60, { color, alpha, size: 104 });
      }, 2);
      this.weaponSprites.set(key, sprite);
    }
    return sprite;
  }

  /* ─── Gallery (prize showcase, all prizes on one page) ─── */

  private drawGallery(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();

    fillGlassPanel(ctx, 24, 14, this.width - 48, 40, 12, {
      fill: p.panel,
      border: p.panelBorder,
    });
    ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '全部奖品' : 'ALL PRIZES', 42, 34);
    this.chipButton(ctx, this.hitBack(), zh ? '菜单' : 'MENU', p);

    // One row per rarity color: tier label on the left, its items in a row.
    const labelW = 128;
    const gap = 8;
    const cardH = 58;
    let y = 68;

    for (const tierId of [...GACHA_TIER_ORDER].reverse()) {
      const tier = GACHA_TIERS.find((t) => t.id === tierId)!;
      const items = GACHA_POOL[tierId];
      const cardW = (this.width - 48 - labelW - gap * (items.length - 1)) / items.length;

      // Tier label column
      ctx.textAlign = 'left';
      ctx.fillStyle = tier.color;
      roundRectPath(ctx, 26, y + 4, 3, 20, 1.5);
      ctx.fill();
      ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(tier.nameZh, 36, y + 12);
      ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textDim;
      ctx.fillText(`${(tier.odds * 100).toFixed(2)}% · ${items.length}`, 36, y + 28);
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(weaponFamilyLabel(zh, tierId), 36, y + 42);

      // Items row
      for (let i = 0; i < items.length; i++) {
        const owned = this.stats.itemCounts[items[i].id] ?? 0;
        this.drawItemCard(ctx, 24 + labelW + i * (cardW + gap), y, cardW, cardH, tier, items[i], owned, p);
      }

      y += cardH + 22;
      if (y > this.height - 6) break;
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

    // Border: rarity gradient frame when owned, neutral hairline when locked
    if (locked) {
      ctx.strokeStyle = p.panelBorderSoft;
    } else {
      const frame = ctx.createLinearGradient(x, y, x, y + h);
      frame.addColorStop(0, withAlpha(tier.color, 0.6));
      frame.addColorStop(1, withAlpha(tier.color, 0.15));
      ctx.strokeStyle = frame;
    }
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const iconSize = Math.min(w * 0.62, 46);
    const blit = iconSize * 1.16;

    if (locked) {
      const icon = this.weaponSprite(item.icon ?? item.kind, dark ? '#cbd5e1' : '#475569', 1);
      drawSprite(ctx, icon, x + w / 2, y + h / 2 - 6, blit, blit, { alpha: 0.28 });
      ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 9), x + w / 2, y + h / 2 + 15);
      return;
    }

    // Rarity top accent + corner diamond badge
    ctx.fillStyle = tier.color;
    ctx.globalAlpha = 0.9;
    roundRectPath(ctx, x + w / 2 - 12, y + 5, 24, 2, 1);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x + w - 8, y + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = tier.color;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();

    const icon = this.weaponSprite(item.icon ?? item.kind, dark ? '#e8edf4' : '#334155', 0.9);
    drawSprite(ctx, icon, x + w / 2, y + h / 2 - 6, blit, blit);
    ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 9), x + w / 2, y + h / 2 + 15);

    ctx.font = '600 9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = p.textFaint;
    ctx.textAlign = 'right';
    ctx.fillText(`×${owned}`, x + w - 6, y + h / 2 - 12);
  }

  /* ─── Stats ─── */

  private drawStats(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const total = this.stats.totalPulls;

    fillGlassPanel(ctx, 24, 14, this.width - 48, 40, 12, {
      fill: p.panel,
      border: p.panelBorder,
    });
    ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '抽取统计' : 'PULL STATS', 42, 34);
    this.chipButton(ctx, this.hitBack(), zh ? '菜单' : 'MENU', p);

    if (this.statsPage === 0) {
      // Total pulls — hero number with a soft halo
      drawGlow(ctx, this.width / 2, 92, 70, p.accent, this.isDarkTheme() ? 0.18 : 0.1);
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

        // Track + gradient fill with a glowing tip
        ctx.fillStyle = this.isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.07)';
        roundRectPath(ctx, barX, y - 6, barW, 12, 6);
        ctx.fill();
        if (pct > 0) {
          const fillW = Math.max(3, (barW * pct) / 100);
          const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
          barGrad.addColorStop(0, shadeFx(tier.color, -0.25));
          barGrad.addColorStop(1, tier.color);
          ctx.fillStyle = barGrad;
          roundRectPath(ctx, barX, y - 6, fillW, 12, 6);
          ctx.fill();
          drawGlow(ctx, barX + fillW, y, 9, tier.color, 0.4);
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
        ctx.textAlign = 'center';
        drawWeaponIcon(ctx, item.icon ?? item.kind, hx + 12, hy + 20, { color: p.textDim, size: 22 });
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
  /** Chips shown while the reel runs: browse prizes or bail to home. */
  private hitPrizeChip() { return { x: this.width - 254, y: 22, w: 52, h: 24 }; }
  private hitHomeChip() { return { x: this.width - 104, y: 22, w: 56, h: 24 }; }

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
      // While a prelude or reel is running, only browsing shortcuts work:
      // Escape/R exits to the menu; the spin never skips ahead.
      if (this.screen === 'unlock' || this.screen === 'opening') {
        if (e.key === 'Escape' || e.key === 'r' || e.key === 'R') {
          this.gotoMenu();
        }
        return;
      }
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
        // Browsing intent wins over the running spin: prizes or home.
        if (this.canvasHit(x, y, this.hitPrizeChip())) {
          this.sfx.click();
          // Bailing mid-spin is allowed: the pull is already recorded.
          this.animMode = null;
          this.screen = 'gallery';
          this.canvas.dataset.gachaScreen = 'gallery';
          return;
        }
        if (this.canvasHit(x, y, this.hitHomeChip())) {
          this.sfx.click();
          this.gotoMenu();
          return;
        }
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

/** Deterministic 0..1 hash for seeded ambient dust. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function weaponFamilyLabel(zh: boolean, tierId: string): string {
  switch (tierId) {
    case 'rarespecial': return zh ? '刀 · 手套' : 'knife · gloves';
    case 'covert': return zh ? '狙击枪' : 'snipers';
    case 'classified': return zh ? '步枪' : 'rifles';
    case 'restricted': return zh ? '冲锋枪' : 'SMGs';
    case 'milspec': return zh ? '手枪' : 'pistols';
    default: return '';
  }
}
