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
 * Art direction: engineering-blueprint orthographic. The crate and the
 * weapons both use the 正视图 principal view (flat profile facing the
 * viewer), and backdrop grids/crosshairs reinforce the drafting mood.
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
  private hoverBtn: string | null = null; // nav icon button under the pointer
  private sparkleAcc = 0;    // cadence for ambient result-screen sparkles
  private dustMotes: DustMote[] = [];
  private caseBodyCache: { dark: boolean; sprite: HTMLCanvasElement } | null = null;

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
      if (this.roll && RESULT_PARTICLES_TIERS.has(this.roll.tier.id)) this.emitResultSparkle(dt);
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

  /** Energy motes converge on the case mouth as the unlock charge builds. */private emitChargeParticles() {
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

  /** Slow twinkling motes drifting around the result card on high tiers. */
  private emitResultSparkle(dt: number) {
    this.sparkleAcc += dt;
    if (this.sparkleAcc < 0.24 || this.burst.count > 220) return;
    this.sparkleAcc = 0;
    const tier = this.roll!.tier;
    const cx = this.width / 2;
    const x = cx + (Math.random() * 2 - 1) * 175;
    const y = 216 + (Math.random() * 2 - 1) * 165;
    this.burst.emit({
      x,
      y,
      count: 1,
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.9,
      spread: 0.2,
      speed: [5, 16],
      life: [0.5, 1.05],
      size: [1, 2.4],
      colors: [tier.color, '#ffffff'],
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
    const dark = this.isDarkTheme();
    const t = performance.now() / 1000;

    // Slim header: plain title + ghost chips, hairline divider.
    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '抽卡' : 'Gacha', 26, 32);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textFaint;
    ctx.fillText(zh ? `已抽取 ${this.stats.totalPulls} 次` : `${this.stats.totalPulls} pulls`, 26, 48);
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(this.width - 24, 58);
    ctx.stroke();

    // Right-side icon chips
    this.drawNav(ctx, p);

    // Case — hero object, centered. The home screen shows only the case:
    // no odds strip, no operation hints (per design review).
    const cx = this.width / 2;
    const cy = 54 + (this.height - 54) / 2 - 10;

    // Drafting reticle behind the case: a hairline circle with four
    // cardinal ticks, echoing the blueprint art direction.
    const reticleR = 132;
    ctx.save();
    ctx.strokeStyle = p.panelBorder;
    ctx.globalAlpha = dark ? 0.5 : 0.8;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.arc(cx, cy, reticleR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4 * 0; // cardinal points
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (reticleR - 6), cy + Math.sin(a) * (reticleR - 6));
      ctx.lineTo(cx + Math.cos(a) * (reticleR + 6), cy + Math.sin(a) * (reticleR + 6));
      ctx.stroke();
    }
    ctx.restore();

    // Radar pulse: a slow expanding hairline ring invites the click.
    const pulse = (t % 2.6) / 2.6;
    if (pulse < 0.92) {
      const pr = 96 + pulse * 76;
      ctx.save();
      ctx.globalAlpha = (1 - pulse) * 0.28 * (dark ? 1 : 0.7);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    this.drawCase(ctx, cx, cy, 216, 144);

    // Mode switcher (only when more than one animation exists)
    if (openingModeCount() > 1) {
      const label = openingModeLabel(this.animModeIndex);
      ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.textDim;
      ctx.fillText(zh ? `动画 · ${label.nameZh} ◂ ▸` : `Mode · ${label.name} ◂ ▸`, cx, this.height - 30);
      // Glowing tab underline under the active mode label
      const tabPulse = 0.55 + 0.3 * Math.sin(t * 2.2);
      ctx.globalAlpha = tabPulse;
      ctx.fillStyle = p.accent;
      roundRectPath(ctx, cx - 42, this.height - 20, 84, 2, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawGlow(ctx, cx, this.height - 19, 34, p.accent, 0.22 * tabPulse);
    }
  }

  /* ─── Navigation (icon buttons) ─── */

  /** Top-right icon buttons for the current screen. */
  private navButtons(): { id: 'prizes' | 'stats' | 'sound' | 'home' | 'back'; cx: number; cy: number }[] {
    const cy = 32;
    const right = this.width - 34;
    switch (this.screen) {
      case 'menu':
        return [
          { id: 'prizes', cx: right - 88, cy },
          { id: 'stats', cx: right - 44, cy },
          { id: 'sound', cx: right, cy },
        ];
      case 'unlock':
      case 'opening':
        // Browsing stays alive during the spin: prizes or bail home.
        return [
          { id: 'prizes', cx: right - 44, cy },
          { id: 'home', cx: right, cy },
        ];
      case 'gallery':
      case 'stats':
        return [{ id: 'back', cx: right, cy }];
      default:
        return [];
    }
  }

  private navButtonAt(x: number, y: number): string | null {
    for (const b of this.navButtons()) {
      const dx = x - b.cx;
      const dy = y - b.cy;
      if (dx * dx + dy * dy <= 19 * 19) return b.id;
    }
    return null;
  }

  /** Circular glass icon buttons with a hover lift and accent ring. */
  private drawNav(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const dark = this.isDarkTheme();
    for (const b of this.navButtons()) {
      const hover = this.hoverBtn === b.id;
      const iconId = b.id === 'sound' && !this.sfx.enabled ? 'mute' : b.id;
      ctx.save();
      ctx.translate(b.cx, b.cy);
      if (hover) drawGlow(ctx, 0, 0, 22, p.accent, dark ? 0.3 : 0.18);
      const s = hover ? 1.1 : 1;
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 0, 15.5, 0, TAU);
      ctx.fillStyle = hover ? p.accentSoft : p.panel;
      ctx.fill();
      ctx.strokeStyle = hover ? p.accent : p.panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      this.drawNavIcon(ctx, iconId, hover ? p.accent : p.textDim);
      ctx.restore();
    }
  }

  /** Stroke/fill glyph centered at the origin, ~15px across. */
  private drawNavIcon(ctx: CanvasRenderingContext2D, id: string, color: string) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (id) {
      case 'prizes': {
        // 2×2 grid of rounded squares
        for (const [gx, gy] of [[-6.2, -6.2], [1.7, -6.2], [-6.2, 1.7], [1.7, 1.7]] as const) {
          roundRectPath(ctx, gx, gy, 4.5, 4.5, 1.2);
          ctx.fill();
        }
        break;
      }
      case 'stats': {
        // bar chart
        for (const [bx, bh] of [[-5, 5], [0, 9.5], [5, 7]] as const) {
          roundRectPath(ctx, bx - 1.3, 5.5 - bh, 2.6, bh, 1);
          ctx.fill();
        }
        break;
      }
      case 'sound':
      case 'mute': {
        ctx.beginPath();
        ctx.moveTo(-6.5, -2.5);
        ctx.lineTo(-3.5, -2.5);
        ctx.lineTo(0.5, -6);
        ctx.lineTo(0.5, 6);
        ctx.lineTo(-3.5, 2.5);
        ctx.lineTo(-6.5, 2.5);
        ctx.closePath();
        ctx.fill();
        if (id === 'mute') {
          ctx.beginPath();
          ctx.moveTo(3.5, -3.5);
          ctx.lineTo(8, 3.5);
          ctx.moveTo(8, -3.5);
          ctx.lineTo(3.5, 3.5);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(1.5, 0, 4.5, -0.9, 0.9);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(1.5, 0, 7.5, -0.75, 0.75);
          ctx.stroke();
        }
        break;
      }
      case 'home': {
        ctx.beginPath();
        ctx.moveTo(-7, -0.5);
        ctx.lineTo(0, -7);
        ctx.lineTo(7, -0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-4.5, 0.5);
        ctx.lineTo(-4.5, 6.5);
        ctx.lineTo(4.5, 6.5);
        ctx.lineTo(4.5, 0.5);
        ctx.stroke();
        break;
      }
      case 'back': {
        ctx.beginPath();
        ctx.moveTo(5.5, 0);
        ctx.lineTo(-5.5, 0);
        ctx.moveTo(-1.5, -4.5);
        ctx.lineTo(-5.5, 0);
        ctx.lineTo(-1.5, 4.5);
        ctx.stroke();
        break;
      }
    }
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
      ctx.fillText(zh ? tier.nameZh : tier.name, sx + segW / 2, y + h / 2);
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

    // Navigation stays live during the prelude too.
    this.drawNav(ctx, p);

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
    this.drawNav(ctx, p);
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

    // Tier kicker — letter-spaced rarity name; odds are never shown,
    // the color and name carry the prestige.
    ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tier.color;
    fillSpacedText(ctx, (zh ? tier.nameZh : tier.name).toUpperCase(), cx, 38, 3);

    // Rotating segmented rarity ring behind the card, with cardinal ticks
    const ringR = 172;
    ctx.save();
    ctx.translate(cx, 216);
    ctx.rotate(this.ambientT * 0.18);
    ctx.strokeStyle = tier.color;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.5;
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = a0 + (TAU / segs) * 0.58;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, a0, a1);
      ctx.stroke();
    }
    ctx.rotate(-this.ambientT * 0.36);
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = a0 + (TAU / segs) * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, ringR - 14, a0, a1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = tier.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (ringR + 4), 216 + Math.sin(a) * (ringR + 4));
      ctx.lineTo(cx + Math.cos(a) * (ringR + 12), 216 + Math.sin(a) * (ringR + 12));
      ctx.stroke();
    }
    ctx.restore();

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

    // Content — the same orthographic front view used by every thumbnail,
    // presented on a blueprint backdrop inside the card.
    const iconId = item.icon ?? item.kind;
    const resultIconSize = item.kind === 'pistol' ? 220 : item.kind === 'knife' ? 230 : 270;

    // Blueprint panel behind the weapon: hairline grid + center crosshair
    ctx.save();
    roundRectPath(ctx, -cw / 2 + 14, -chh / 2 + 14, cw - 28, 190, 14);
    ctx.clip();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(2,132,199,0.045)';
    ctx.fillRect(-cw / 2 + 14, -chh / 2 + 14, cw - 28, 190);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(2,132,199,0.09)';
    ctx.lineWidth = 1;
    for (let gx = -cw / 2 + 14; gx <= cw / 2 - 14; gx += 18) {
      ctx.beginPath();
      ctx.moveTo(gx, -chh / 2 + 14);
      ctx.lineTo(gx, -chh / 2 + 204);
      ctx.stroke();
    }
    for (let gy = -chh / 2 + 14; gy <= -chh / 2 + 204; gy += 18) {
      ctx.beginPath();
      ctx.moveTo(-cw / 2 + 14, gy);
      ctx.lineTo(cw / 2 - 14, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(tier.color, 0.4);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(-cw / 2 + 14, -46);
    ctx.lineTo(cw / 2 - 14, -46);
    ctx.moveTo(0, -chh / 2 + 14);
    ctx.lineTo(0, -chh / 2 + 204);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 26;
    drawWeaponIcon(ctx, iconId, 0, -46, { color: tier.color, size: resultIconSize, mono: false });
    ctx.restore();
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

  /* ─── Gallery (prize showcase, all prizes on one page) ─── */

  private drawGallery(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();

    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '全部奖品' : 'ALL PRIZES', 26, 32);
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(this.width - 24, 58);
    ctx.stroke();
    this.drawNav(ctx, p);

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
      ctx.fillText(zh ? `${items.length} 件` : `${items.length} items`, 36, y + 28);
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
    const iconSize = Math.min(w - 10, 74);

    if (locked) {
      drawWeaponIcon(ctx, item.icon ?? item.kind, x + w / 2, y + h / 2 - 12, {
        color: dark ? '#cbd5e1' : '#475569',
        alpha: 0.66,
        size: iconSize,
        mono: false,
      });
      ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 9), x + w / 2, y + h / 2 + 18);
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

    drawWeaponIcon(ctx, item.icon ?? item.kind, x + w / 2, y + h / 2 - 12, {
      color: dark ? '#e8edf4' : '#334155',
      size: iconSize,
      mono: false,
    });
    ctx.font = '600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 9), x + w / 2, y + h / 2 + 18);

    ctx.font = '600 9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = p.textFaint;
    ctx.textAlign = 'right';
    ctx.fillText(`×${owned}`, x + w - 6, y + h / 2 - 12);
  }

  /* ─── Stats ─── */

  private drawStats(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const total = this.stats.totalPulls;

    // Slim header
    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '抽取统计' : 'PULL STATS', 26, 32);
    this.drawNav(ctx, p);
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(this.width - 24, 58);
    ctx.stroke();

    // ── Donut: tier distribution, total in the middle. ──
    const dcx = 168;
    const dcy = 246;
    const radius = 96;
    const ringW = 30;
    const tiersHighFirst = [...GACHA_TIER_ORDER].reverse();

    // Track ring
    ctx.strokeStyle = this.isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.08)';
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(dcx, dcy, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (total > 0) {
      let a0 = -Math.PI / 2;
      for (const tierId of tiersHighFirst) {
        const tier = GACHA_TIERS.find((t) => t.id === tierId)!;
        const count = this.stats.tierCounts[tierId];
        if (count <= 0) continue;
        const frac = count / total;
        const a1 = a0 + frac * Math.PI * 2;
        ctx.strokeStyle = tier.color;
        ctx.lineWidth = ringW;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(dcx, dcy, radius, a0 + 0.012, Math.max(a0 + 0.012, a1 - 0.012));
        ctx.stroke();
        a0 = a1;
      }
    }
    ctx.lineCap = 'butt';

    // Center total
    drawGlow(ctx, dcx, dcy, 60, p.accent, this.isDarkTheme() ? 0.14 : 0.08);
    ctx.textAlign = 'center';
    ctx.font = '700 32px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = p.text;
    ctx.fillText(String(total), dcx, dcy - 6);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '累计抽取' : 'TOTAL PULLS', dcx, dcy + 22);

    // ── Right: per-tier rows with thin progress bars. ──
    const rowX = 316;
    const rowW = this.width - rowX - 30;
    let y = 116;
    for (const tierId of tiersHighFirst) {
      const tier = GACHA_TIERS.find((t) => t.id === tierId)!;
      const count = this.stats.tierCounts[tierId];
      const pct = total > 0 ? (count / total) * 100 : 0;

      // color chip + name + count
      ctx.fillStyle = tier.color;
      roundRectPath(ctx, rowX, y - 6, 4, 16, 2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.text;
      ctx.fillText(zh ? tier.nameZh : tier.name, rowX + 12, y);
      ctx.textAlign = 'right';
      ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = p.text;
      // Counts and bar lengths only — never probability numbers.
      ctx.fillText(`${count}`, rowX + rowW, y);

      // thin bar
      ctx.fillStyle = this.isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.07)';
      roundRectPath(ctx, rowX + 12, y + 12, rowW - 12, 4, 2);
      ctx.fill();
      if (pct > 0) {
        const fillW = Math.max(3, ((rowW - 12) * pct) / 100);
        const barGrad = ctx.createLinearGradient(rowX, 0, rowX + fillW, 0);
        barGrad.addColorStop(0, shadeFx(tier.color, -0.25));
        barGrad.addColorStop(1, tier.color);
        ctx.fillStyle = barGrad;
        roundRectPath(ctx, rowX + 12, y + 12, fillW, 4, 2);
        ctx.fill();
      }
      y += 54;
    }

    // ── Bottom: recent pulls as colored icon chips. ──
    const hy = 424;
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '最近抽取' : 'RECENT PULLS', 30, hy - 14);
    const allItems = GACHA_TIERS.flatMap((tier) => GACHA_POOL[tier.id].map((item) => ({ item, tier })));
    const recent = this.stats.history.slice(0, 14);
    let hx = 30;
    for (const entry of recent) {
      const tier = GACHA_TIERS.find((t) => t.id === entry.tierId);
      const item = allItems.find((e) => e.item.id === entry.itemId)?.item;
      if (!tier || !item) continue;
      const iconId = item.icon ?? item.kind;
      drawWeaponIcon(ctx, iconId, hx + 14, hy + 8, { color: p.textDim, size: 26, mono: true });
      ctx.beginPath();
      ctx.fillStyle = tier.color;
      ctx.arc(hx + 14, hy + 26, 2.5, 0, Math.PI * 2);
      ctx.fill();
      hx += 42;
      if (hx > this.width - 60) break;
    }
    if (recent.length === 0) {
      ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(zh ? '还没有抽取记录' : 'No pulls yet', 30, hy + 10);
    }

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

  private hitAgain() { return { x: this.width / 2 - 92, y: 402, w: 184, h: 44 }; }

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

    // Hover tracking for the icon buttons
    if (e instanceof MouseEvent && e.type === 'mousemove') {
      const pt = this.canvasPoint(e.clientX, e.clientY);
      const hover = pt ? this.navButtonAt(pt.x, pt.y) : null;
      const clickable = hover !== null || this.screen === 'menu' || this.screen === 'result';
      this.hoverBtn = hover;
      this.canvas.style.cursor = clickable ? 'pointer' : '';
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

    // Icon navigation buttons first.
    const nav = this.navButtonAt(x, y);
    if (nav === 'sound') {
      this.sfx.enabled = !this.sfx.enabled;
      if (this.sfx.enabled) this.sfx.prime();
      return;
    }
    if (nav === 'prizes') {
      this.sfx.click();
      // Bailing mid-spin is allowed: the pull is already recorded.
      this.animMode = null;
      this.screen = 'gallery';
      this.canvas.dataset.gachaScreen = 'gallery';
      return;
    }
    if (nav === 'stats') {
      this.sfx.click();
      this.statsPage = 0;
      this.screen = 'stats';
      this.canvas.dataset.gachaScreen = 'stats';
      return;
    }
    if (nav === 'home' || nav === 'back') {
      this.sfx.click();
      this.gotoMenu();
      return;
    }

    switch (this.screen) {
      case 'menu': {
        // Mode switcher (only when > 1 mode registered)
        if (openingModeCount() > 1) {
          if (x < this.width / 2 - 10 && x > this.width / 2 - 120 && Math.abs(y - (this.height - 30)) < 12) {
            this.animModeIndex = (this.animModeIndex - 1 + openingModeCount()) % openingModeCount();
            this.sfx.click();
            return;
          }
          if (x > this.width / 2 + 10 && x < this.width / 2 + 120 && Math.abs(y - (this.height - 30)) < 12) {
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
        // Nav already handled; the spin itself never skips ahead.
        return;
      }
      case 'result': {
        this.sfx.click();
        this.startUnlock();
        return;
      }
      default:
        return;
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

  // Drafting grid, barely-there — the blueprint behind the whole scene
  ctx.strokeStyle = p.textFaint;
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 24; gx < width; gx += 36) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
  }
  for (let gy = 24; gy < height; gy += 36) {
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Soft ambient accent
  const ambient = ctx.createRadialGradient(width / 2, height * 0.35, 30, width / 2, height * 0.35, width * 0.75);
  ambient.addColorStop(0, p.glow);
  ambient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);
}

/** Centered letter-spaced text (canvas has no letter-spacing). */
function fillSpacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((acc, w) => acc + w, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + spacing;
  }
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
