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
  type GachaTierId,
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
import { GAMES } from './catalog.js';
import { drawWeaponIcon, drawWeaponPhoto, preloadWeaponPhotos, weaponIconFitSize } from './gachaWeaponIcons.js';

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
  private galleryTier: GachaTierId = 'rarespecial';
  private unlockT = 0;
  private crackSparked = false; // one-shot spark burst when the lid cracks
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
  private caseBodyCache: { key: string; sprite: HTMLCanvasElement } | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 640, 480));
    this.stats = loadGachaStats();
  }

  /**
   * Responsive logical pixels: the game lays out in real display pixels, so
   * text stays legible on phones and spacing stays premium on desktop and
   * fullscreen. Portrait phones also switch the catalog box itself to a
   * tall 4:5 canvas (the shell reads canvasSize on every fit, so the next
   * refit converges); landscape keeps the classic 4:3.
   */
  override setDisplayScale(cssWidth: number) {
    if (Number.isFinite(cssWidth) && cssWidth > 0) {
      const meta = GAMES.find((g) => g.id === 'gacha');
      const portrait = typeof window !== 'undefined'
        && window.innerWidth < 700 && window.innerHeight > window.innerWidth * 1.05;
      const want = portrait ? { width: 480, height: 600 } : { width: 640, height: 480 };
      if (meta && (meta.canvasSize.width !== want.width || meta.canvasSize.height !== want.height)) {
        meta.canvasSize = want;
        this.canvas.dataset.logicalWidth = String(want.width);
        this.canvas.dataset.logicalHeight = String(want.height);
        // Same width, new aspect: ask the shell to refresh its cached vars.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
      }
      const logicalW = Math.round(clamp(cssWidth, 300, 1560));
      const logicalH = Math.round(logicalW * (want.height / want.width));
      if (logicalW !== this.width || logicalH !== this.height) {
        this.width = logicalW;
        this.height = logicalH;
        this.dustMotes = []; // reseed ambient dust for the new extent
      }
    }
    super.setDisplayScale(cssWidth);
    // Logical dimensions can change while DPR stays identical. Resizing
    // clears the backing canvas, including before the animation starts.
    this.renderFrame();
  }

  /** Narrow layout (phones): rails become chip rows, panels stack. */
  private get compact(): boolean {
    return this.width < 560;
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
      preloadWeaponPhotos();
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
    this.crackSparked = false;
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
    const cy = 50 + (this.height - 50 - 72) / 2;

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
    const caseH = this.unlockCaseH();
    const mouthX = this.width / 2;
    const mouthY = this.unlockCaseY() - caseH * 0.43;
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

  /** Golden sparks sprayed from the crack the moment the lid bursts. */
  private emitCrackSparks(mouthX: number, mouthY: number) {
    this.burst.emit({
      x: mouthX, y: mouthY, count: 26,
      angle: -Math.PI / 2, spread: 0.9,
      speed: [220, 560], life: [0.35, 0.9], size: [1, 2.6],
      colors: ['#fff3cf', '#ffd876', '#ffb84d'], shape: 'spark', gravity: 620, drag: 1.6,
    });
    this.burst.emit({
      x: mouthX, y: mouthY, count: 1, speed: 0, life: 0.5, size: [10, 13],
      colors: ['#fff6dd'], shape: 'ring', endScale: 16,
    });
  }

  /** Slow twinkling motes drifting around the result card on high tiers. */
  private emitResultSparkle(dt: number) {
    this.sparkleAcc += dt;
    if (this.sparkleAcc < 0.24 || this.burst.count > 220) return;
    this.sparkleAcc = 0;
    const tier = this.roll!.tier;
    const cx = this.width / 2;
    const cy = 50 + (this.height - 50 - 72) / 2;
    const x = cx + (Math.random() * 2 - 1) * Math.min(this.width * 0.4, 300);
    const y = cy + (Math.random() * 2 - 1) * Math.min(this.height * 0.38, 200);
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

    // Case — hero object, centered and scaled to the actual viewport: the
    // bigger the canvas, the grander the case. The home screen shows only
    // the case: no odds strip, no operation hints (per design review).
    const cx = this.width / 2;
    const cy = 54 + (this.height - 54) / 2 - 10;
    const caseW = Math.min(this.width * 0.56, (this.height - 84) * 0.78, 560);
    const caseH = caseW * (220 / 330);

    // Drafting reticle behind the case: a hairline circle with four
    // cardinal ticks, echoing the blueprint art direction.
    const reticleR = caseW * 0.6;
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
      ctx.moveTo(cx + Math.cos(a) * (reticleR - 7), cy + Math.sin(a) * (reticleR - 7));
      ctx.lineTo(cx + Math.cos(a) * (reticleR + 7), cy + Math.sin(a) * (reticleR + 7));
      ctx.stroke();
    }
    ctx.restore();

    // Radar pulse: a slow expanding hairline ring invites the click.
    const pulse = (t % 2.6) / 2.6;
    if (pulse < 0.92) {
      const pr = caseW * (0.45 + pulse * 0.33);
      ctx.save();
      ctx.globalAlpha = (1 - pulse) * 0.28 * (dark ? 1 : 0.7);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    this.drawCase(ctx, cx, cy, caseW, caseH);

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
    const u = w / 330; // detail scale: art was tuned at 330px wide

    // Ambient halo behind the case
    drawGlow(ctx, cx + bob, cy - 6, w * 0.72, accentColor, dark ? 0.16 + 0.05 * Math.sin(t * 1.1) : 0.1);

    ctx.save();
    ctx.translate(cx + bob, cy);

    // Layered ground shadow: broad soft pool + tight contact shadow
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.30)' : 'rgba(15,23,42,0.14)';
    ctx.beginPath();
    ctx.ellipse(0, hh - 2, hw * 0.78, 13 * u + 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.24)';
    ctx.beginPath();
    ctx.ellipse(0, hh - 3, hw * 0.56, 8 * u + 3, 0, 0, TAU);
    ctx.fill();

    // Pre-rendered brushed-metal body (rebuilt on theme/size change)
    const body = this.caseBody(dark, w, h);
    ctx.drawImage(body, -hw - 32 * u, -hh - 32 * u, w + 64 * u, h + 64 * u);

    // Slow sheen sweep across the brushed shell — a light band gliding
    // over the metal every few seconds, clipped to the body silhouette.
    const sweepT = t % 4.8;
    if (sweepT < 1.05) {
      const k = ease('inOutQuad', sweepT / 1.05);
      const bx = lerp(-hw - 70 * u, hw + 70 * u, k);
      ctx.save();
      roundRectPath(ctx, -hw, -hh + 16 * u, w, h - 16 * u, 18 * u);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(bx, 0);
      ctx.rotate(0.42);
      const band = ctx.createLinearGradient(-40 * u, 0, 40 * u, 0);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, dark ? 'rgba(226,238,249,0.12)' : 'rgba(255,255,255,0.4)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-40 * u, -hh, 80 * u, h * 2);
      ctx.restore();
    }

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
    roundRectPath(ctx, -hw + 10 * u, -hh + 14 * u, w - 20 * u, 3.5 * u, 1.75 * u);
    ctx.fill();
    ctx.restore();

    // Inner glow when the lid opens
    if (lidOpen > 0) {
      const glow = ctx.createRadialGradient(0, -hh + 30 * u, 4, 0, -hh + 30 * u, w * 0.9);
      glow.addColorStop(0, `rgba(255,244,205,${0.6 * lidOpen})`);
      glow.addColorStop(1, 'rgba(255,244,205,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-hw, -hh, w, h);
      ctx.font = `${Math.round(58 * u)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = lidOpen;
      ctx.fillText('✦', 0, -hh + 52 * u);
      ctx.globalAlpha = 1;
    }

    // Lid — live because it tilts back around its top-left corner
    const lidH = 34 * u;
    ctx.save();
    ctx.translate(-hw - 4 * u, -hh + 8 * u);
    if (lidOpen > 0) {
      ctx.rotate(-lidOpen * 0.55);
      ctx.translate(0, -lidOpen * 34 * u);
    }
    const lidGrad = ctx.createLinearGradient(0, 0, 0, lidH);
    lidGrad.addColorStop(0, dark ? '#4d5b74' : '#f2f5fa');
    lidGrad.addColorStop(0.5, dark ? '#323d50' : '#b6c1d0');
    lidGrad.addColorStop(1, dark ? '#202835' : '#8a97a8');
    ctx.fillStyle = lidGrad;
    roundRectPath(ctx, 0, 0, w + 8 * u, lidH, 12 * u);
    ctx.fill();
    // Sheen on the lid's top edge
    ctx.save();
    roundRectPath(ctx, 0, 0, w + 8 * u, lidH, 12 * u);
    ctx.clip();
    const lidSheen = ctx.createLinearGradient(0, 0, 0, lidH * 0.55);
    lidSheen.addColorStop(0, 'rgba(255,255,255,0.34)');
    lidSheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lidSheen;
    ctx.fillRect(0, 0, w + 8 * u, lidH * 0.55);
    // Contact shade where the lid meets the body
    const lidShade = ctx.createLinearGradient(0, lidH * 0.62, 0, lidH);
    lidShade.addColorStop(0, 'rgba(0,0,0,0)');
    lidShade.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = lidShade;
    ctx.fillRect(0, lidH * 0.62, w + 8 * u, lidH * 0.38);
    ctx.restore();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, 0.5, 0.5, w + 8 * u - 1, lidH - 1, 12 * u);
    ctx.stroke();
    // Recessed grip ribs on the lid
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.13)';
    for (const ry of [0.34, 0.52, 0.7]) {
      roundRectPath(ctx, 16 * u, lidH * ry, w - 24 * u, 3.2 * u, 1.6 * u);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  /** Static case body art, pre-rendered once per theme and size. */
  private caseBody(dark: boolean, w = 330, h = 220): HTMLCanvasElement {
    const key = `${dark}|${w}|${h}`;
    if (this.caseBodyCache && this.caseBodyCache.key === key) return this.caseBodyCache.sprite;
    const u = w / 330;
    const pad = 32 * u;
    const sprite = makeSprite(w + pad * 2, h + pad * 2, (c) => {
      c.translate((w + pad * 2) / 2, (h + pad * 2) / 2);
      const hw = w / 2;
      const hh = h / 2;
      const bodyTop = -hh + 16 * u;
      const bodyH = h - 16 * u;

      // Brushed-metal shell: bright crown, dark waist, near-black foot
      const grad = c.createLinearGradient(0, bodyTop, 0, hh);
      grad.addColorStop(0, dark ? '#3b4a60' : '#dde4ee');
      grad.addColorStop(0.38, dark ? '#232d3c' : '#a3b0c2');
      grad.addColorStop(0.72, dark ? '#161d27' : '#7c8a9e');
      grad.addColorStop(1, dark ? '#0d1118' : '#57657a');
      c.fillStyle = grad;
      roundRectPath(c, -hw, bodyTop, w, bodyH, 18 * u);
      c.fill();

      c.save();
      roundRectPath(c, -hw, bodyTop, w, bodyH, 18 * u);
      c.clip();

      // Edge vignette: darken the flanks so the shell reads cylindrical
      const flank = c.createLinearGradient(-hw, 0, hw, 0);
      flank.addColorStop(0, 'rgba(0,0,0,0.34)');
      flank.addColorStop(0.14, 'rgba(0,0,0,0)');
      flank.addColorStop(0.86, 'rgba(0,0,0,0)');
      flank.addColorStop(1, 'rgba(0,0,0,0.34)');
      c.fillStyle = flank;
      c.fillRect(-hw, bodyTop, w, bodyH);

      // Top bevel light / bottom shade
      const top = c.createLinearGradient(0, bodyTop, 0, bodyTop + 30 * u);
      top.addColorStop(0, 'rgba(255,255,255,0.26)');
      top.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = top;
      c.fillRect(-hw, bodyTop, w, 30 * u);
      const bottom = c.createLinearGradient(0, hh - 26 * u, 0, hh);
      bottom.addColorStop(0, 'rgba(0,0,0,0)');
      bottom.addColorStop(1, 'rgba(0,0,0,0.4)');
      c.fillStyle = bottom;
      c.fillRect(-hw, hh - 26 * u, w, 26 * u);

      // Brushed vertical striations with gentle alpha variation
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let x = -hw + 6 * u; x < hw - 4 * u; x += 2.2 * u) {
        c.globalAlpha = (dark ? 0.028 : 0.05) + rnd() * (dark ? 0.03 : 0.045);
        c.fillStyle = rnd() > 0.5 ? '#ffffff' : '#0b0f16';
        c.fillRect(x, bodyTop + 2 * u, 1, bodyH - 4 * u);
      }
      c.globalAlpha = 1;
      c.restore();

      // Hairline outer edge
      c.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)';
      c.lineWidth = 1;
      roundRectPath(c, -hw + 0.5, bodyTop + 0.5, w - 1, bodyH - 1, 18 * u);
      c.stroke();

      // Recessed emblem plate with inner shadow and a double frame
      const plateX = -hw + 26 * u;
      const plateY = bodyTop + 26 * u;
      const plateW = w - 52 * u;
      const plateH = bodyH - 44 * u;
      const plate = c.createLinearGradient(0, plateY, 0, plateY + plateH);
      plate.addColorStop(0, dark ? 'rgba(0,0,0,0.3)' : 'rgba(15,23,42,0.16)');
      plate.addColorStop(0.18, dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.3)');
      plate.addColorStop(1, dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.12)');
      c.fillStyle = plate;
      roundRectPath(c, plateX, plateY, plateW, plateH, 12 * u);
      c.fill();
      c.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(15,23,42,0.22)';
      c.lineWidth = 1;
      roundRectPath(c, plateX + 0.5, plateY + 0.5, plateW - 1, plateH - 1, 12 * u);
      c.stroke();
      c.strokeStyle = dark ? 'rgba(125,211,252,0.32)' : 'rgba(2,132,199,0.38)';
      roundRectPath(c, plateX + 3.5 * u, plateY + 3.5 * u, plateW - 7 * u, plateH - 7 * u, 9 * u);
      c.stroke();

      // Emblem: thin ring, diamond, and a keyhole slot underneath
      const ey = plateY + plateH * 0.4;
      c.strokeStyle = dark ? 'rgba(224,242,254,0.75)' : 'rgba(3,105,161,0.7)';
      c.lineWidth = 1.4 * u;
      c.beginPath();
      c.arc(0, ey, 22 * u, 0, TAU);
      c.stroke();
      c.save();
      c.translate(0, ey);
      c.rotate(Math.PI / 4);
      const dg = c.createLinearGradient(-9 * u, -9 * u, 9 * u, 9 * u);
      dg.addColorStop(0, dark ? 'rgba(224,242,254,0.95)' : 'rgba(3,105,161,0.9)');
      dg.addColorStop(1, dark ? 'rgba(125,211,252,0.55)' : 'rgba(2,132,199,0.5)');
      c.fillStyle = dg;
      const ds = 8.5 * u;
      roundRectPath(c, -ds, -ds, ds * 2, ds * 2, 2 * u);
      c.fill();
      c.restore();
      // Keyhole
      c.fillStyle = dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.4)';
      c.beginPath();
      c.arc(0, ey + 34 * u, 4.2 * u, 0, TAU);
      c.fill();
      roundRectPath(c, -2.4 * u, ey + 34 * u, 4.8 * u, 10 * u, 2.4 * u);
      c.fill();
      c.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, ey + 34 * u, 5.4 * u, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();

      // Corner bolts
      const boltBase = dark ? '#61738c' : '#c3cddd';
      const boltIn = 13 * u;
      const boltTop = bodyTop + 11 * u;
      const boltBot = hh - 11 * u;
      for (const [rx, ry] of [[-hw + boltIn, boltTop], [hw - boltIn, boltTop], [-hw + boltIn, boltBot], [hw - boltIn, boltBot]] as const) {
        fillSphere(c, rx, ry, 3 * u, boltBase, { rim: 0.25 });
      }

      // Twin lid clasps straddling the seam line
      for (const sign of [-1, 1]) {
        const cxp = sign * w * 0.3;
        const clasp = c.createLinearGradient(0, bodyTop - 4 * u, 0, bodyTop + 10 * u);
        clasp.addColorStop(0, dark ? '#55637c' : '#e6ecf4');
        clasp.addColorStop(1, dark ? '#232c3a' : '#93a1b3');
        c.fillStyle = clasp;
        roundRectPath(c, cxp - 9 * u, bodyTop - 4 * u, 18 * u, 12 * u, 3 * u);
        c.fill();
        c.strokeStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.25)';
        c.lineWidth = 1;
        roundRectPath(c, cxp - 8.5 * u, bodyTop - 3.5 * u, 17 * u, 11 * u, 3 * u);
        c.stroke();
        c.fillStyle = dark ? 'rgba(125,211,252,0.5)' : 'rgba(2,132,199,0.45)';
        roundRectPath(c, cxp - 1.5 * u, bodyTop + 1 * u, 3 * u, 4 * u, 1 * u);
        c.fill();
      }
    }, 2);
    this.caseBodyCache = { key, sprite };
    return sprite;
  }


  /* ─── Unlock prelude ─── */

  /** Case geometry for the unlock stage, sized to the live viewport. */
  private unlockCaseW() { return Math.min(this.width * 0.52, (this.height - 96) * 0.76, 520); }
  private unlockCaseH() { return this.unlockCaseW() * (206 / 310); }
  private unlockCaseY() { return this.height * 0.47; }

  private drawUnlock(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const t = this.unlockT / UNLOCK_DURATION;
    const dark = this.isDarkTheme();

    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '解锁中…' : 'UNLOCKING…', this.width / 2, 34);

    // Navigation stays live during the prelude too.
    this.drawNav(ctx, p);

    const cx = this.width / 2;
    const cy = this.unlockCaseY();
    const caseW = this.unlockCaseW();
    const caseH = this.unlockCaseH();
    // Charge-up tremble: amplitude grows as energy builds toward the pop,
    // then settles while the lid swings open.
    const charge = clamp(t / 0.45, 0, 1);
    const shake = t < 0.5
      ? Math.sin(t * 90) * (1.2 + 7 * charge * charge)
      : Math.sin(t * 40) * 1.5 * (1 - t);
    const lidOpen = Math.min(1, Math.max(0, (t - 0.35) / 0.5));

    // Cinematic focus: the room falls away as the charge builds.
    if (t > 0.08) {
      const focus = Math.min(1, t / 0.4) * (1 - lidOpen * 0.55);
      const dim = ctx.createRadialGradient(cx, cy, caseW * 0.5, cx, cy, Math.max(this.width, this.height) * 0.78);
      dim.addColorStop(0, 'rgba(6,8,12,0)');
      dim.addColorStop(1, `rgba(6,8,12,${(dark ? 0.42 : 0.18) * focus})`);
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Overhead key light: a soft cone gathering over the case.
    if (t > 0.05) {
      const coneA = 0.16 * clamp(t / 0.5, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cone = ctx.createLinearGradient(0, 0, 0, cy);
      cone.addColorStop(0, `rgba(255,236,190,${coneA})`);
      cone.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(cx - caseW * 0.22, 0);
      ctx.lineTo(cx + caseW * 0.22, 0);
      ctx.lineTo(cx + caseW * 0.62, cy);
      ctx.lineTo(cx - caseW * 0.62, cy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    this.drawCase(ctx, cx, cy, caseW, caseH, lidOpen, shake);

    // ── Photoreal crack lighting: hot core, volumetric shafts, anamorphic
    // flare and ground spill — all additive, all breathing with the lid. ──
    if (lidOpen > 0) {
      const mouthX = cx;
      const mouthY = cy - caseH * 0.43;

      if (!this.crackSparked) {
        this.crackSparked = true;
        this.emitCrackSparks(mouthX, mouthY);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Hot core: white-hot heart wrapped in amber falloff.
      drawGlow(ctx, mouthX, mouthY, 46 + 90 * lidOpen, '#fff4d2', 0.85 * lidOpen);
      drawGlow(ctx, mouthX, mouthY, 120 + 170 * lidOpen, '#ffcf7a', 0.5 * lidOpen);
      drawGlow(ctx, mouthX, mouthY, 240 + 220 * lidOpen, '#ff9d3c', 0.22 * lidOpen);

      // Volumetric shafts: gradient wedges fanning up from the mouth,
      // slowly sweeping and flickering like real light through a crack.
      const shaftCount = 7;
      for (let i = 0; i < shaftCount; i++) {
        const frac = i / (shaftCount - 1);
        const baseA = lerp(-Math.PI + 0.32, -0.32, frac);
        const sweep = Math.sin(this.ambientT * 0.9 + i * 1.7) * 0.06;
        const a = baseA + sweep;
        const flicker = 0.72 + 0.28 * Math.sin(this.ambientT * 7.3 + i * 2.4);
        const len = (caseH * 0.9 + this.height * 0.52 * lidOpen) * flicker;
        const halfWidth = (7 + 13 * Math.abs(Math.sin(i * 2.1))) * (0.6 + 0.6 * lidOpen);
        const alpha = (0.34 - Math.abs(frac - 0.5) * 0.22) * lidOpen * flicker * (dark ? 1 : 0.75);
        const beam = ctx.createLinearGradient(mouthX, mouthY, mouthX + Math.cos(a) * len, mouthY + Math.sin(a) * len);
        beam.addColorStop(0, `rgba(255,226,158,${alpha})`);
        beam.addColorStop(0.55, `rgba(255,200,110,${alpha * 0.45})`);
        beam.addColorStop(1, 'rgba(255,190,100,0)');
        ctx.fillStyle = beam;
        const nx = Math.cos(a + Math.PI / 2);
        const ny = Math.sin(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(mouthX - nx * halfWidth, mouthY - ny * halfWidth);
        ctx.lineTo(mouthX + nx * halfWidth, mouthY + ny * halfWidth);
        ctx.lineTo(mouthX + Math.cos(a) * len, mouthY + Math.sin(a) * len);
        ctx.closePath();
        ctx.fill();
      }

      // Anamorphic lens flare: an ultra-wide horizontal streak through the
      // crack plus a tight hot line at its heart.
      ctx.translate(mouthX, mouthY);
      ctx.scale(1, 0.016);
      const flare = ctx.createRadialGradient(0, 0, 0, 0, 0, this.width * 0.62);
      flare.addColorStop(0, `rgba(255,240,200,${0.5 * lidOpen})`);
      flare.addColorStop(0.4, `rgba(255,206,120,${0.22 * lidOpen})`);
      flare.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(0, 0, this.width * 0.62, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const streak = ctx.createLinearGradient(mouthX - this.width * 0.3, 0, mouthX + this.width * 0.3, 0);
      streak.addColorStop(0, 'rgba(255,236,190,0)');
      streak.addColorStop(0.5, `rgba(255,246,220,${0.65 * lidOpen})`);
      streak.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = streak;
      ctx.fillRect(mouthX - this.width * 0.3, mouthY - 1.2, this.width * 0.6, 2.4);

      // Ground spill: warm light pooling under the case as it opens.
      const spill = ctx.createRadialGradient(cx, cy + caseH * 0.5, 6, cx, cy + caseH * 0.5, caseW * (0.5 + 0.5 * lidOpen));
      spill.addColorStop(0, `rgba(255,205,120,${0.28 * lidOpen})`);
      spill.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = spill;
      ctx.beginPath();
      ctx.ellipse(cx, cy + caseH * 0.5, caseW * (0.5 + 0.5 * lidOpen), 14 + 22 * lidOpen, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // White-out handoff into the reel, warmed at the edges.
    if (t > 0.86) {
      const k = (t - 0.86) / 0.14;
      ctx.fillStyle = `rgba(255,246,214,${k * 0.34})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, cx, cy - caseH * 0.43, 300 + 500 * k, '#ffedbe', 0.55 * k);
      ctx.restore();
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
    const cx = this.width / 2;
    const topTier = tier.id === 'covert' || tier.id === 'rarespecial';

    // Landscape result card: weapons are far wider than tall, so the card
    // and its photo panel follow the weapon instead of fighting it.
    const cw = Math.min(this.width - 36, 580);
    const chh = Math.min(this.height - 150, cw * 0.72);
    const cardCy = 50 + (this.height - 50 - 72) / 2;

    // Rarity radial wash (restrained on light theme to avoid a heavy blob)
    const grad = ctx.createRadialGradient(cx, cardCy, 20, cx, cardCy, Math.max(this.width, this.height) * 0.6);
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
      ctx.fillRect(cx - cw * 0.18, 0, cw * 0.36, this.height);
      drawGlow(ctx, cx, cardCy, cw * 0.72, tier.color, (dark ? 0.3 : 0.2) * beamA);
    }

    // No tier kicker: the frame, ring, and glow colors carry the prestige.
    // Middle baseline keeps badge and caption text vertically centered.
    ctx.textBaseline = 'middle';
    // Rotating segmented rarity ring behind the card, with cardinal ticks
    const ringR = Math.max(cw, chh) * 0.62;
    ctx.save();
    ctx.translate(cx, cardCy);
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
      ctx.arc(0, 0, ringR - 16, a0, a1);
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
      ctx.moveTo(cx + Math.cos(a) * (ringR + 4), cardCy + Math.sin(a) * (ringR + 4));
      ctx.lineTo(cx + Math.cos(a) * (ringR + 12), cardCy + Math.sin(a) * (ringR + 12));
      ctx.stroke();
    }
    ctx.restore();

    // Card pop-in
    const pop = Math.min(1, this.revealT * 3);
    const scale = 0.86 + 0.14 * ease('outBack', pop);

    // Breathing rarity halo behind the card
    drawGlow(ctx, cx, cardCy, cw * 0.72, tier.color, (dark ? 0.28 : 0.18) * (0.7 + 0.3 * Math.sin(this.ambientT * 2.4)));

    ctx.save();
    ctx.translate(cx, cardCy);
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
      roundRectPath(ctx, cw / 2 - 66, -chh / 2 + 14, 52, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#12151b';
      ctx.font = '700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEW', cw / 2 - 40, -chh / 2 + 25);
      ctx.restore();
    }

    // Content — the weapon's real inventory render floating on clean glass;
    // no blueprint grid or guides: the rarity glow alone frames it.
    // Silhouette stands in while the texture streams in.
    const iconId = item.icon ?? item.kind;
    const panelX = -cw / 2 + 16;
    const panelY = -chh / 2 + 16;
    const panelW = cw - 32;
    const panelH = chh * 0.52;
    const iconCy = panelY + panelH / 2;

    ctx.save();
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 26;
    drawWeaponPhoto(ctx, iconId, 0, iconCy, panelW - 22, panelH - 20, {
      fallbackColor: tier.color,
    });
    ctx.restore();

    // Caption block vertically centered in the space under the weapon:
    // item name only — tier text is never shown, color carries the prestige.
    const restTop = panelY + panelH;
    const restH = chh / 2 - 16 - restTop;
    const hasSub = item.name !== item.nameZh;
    const nameY = restTop + restH / 2 - (hasSub ? 12 : 0);
    ctx.textAlign = 'center';
    ctx.font = '600 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.text;
    ctx.fillText(truncate(item.nameZh, 14), 0, nameY);
    // Subtitle only when the English name differs (pure-weapon names would
    // otherwise print the same string twice).
    if (hasSub) {
      ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textDim;
      ctx.fillText(truncate(item.name, 30), 0, nameY + 26);
    }

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

  /* ─── Gallery (collection book: tier rail + large showcase cards) ─── */

  /** Tier picker geometry: a left rail on desktop, a chip row on phones. */
  private galleryRailRows(): { tierId: GachaTierId; x: number; y: number; w: number; h: number }[] {
    const order = [...GACHA_TIER_ORDER].reverse();
    if (this.compact) {
      const gap = 8;
      const w = (this.width - 48 - gap * (order.length - 1)) / order.length;
      return order.map((tierId, i) => ({ tierId, x: 24 + i * (w + gap), y: 68, w, h: 46 }));
    }
    const rowH = 62;
    const gap = 10;
    const railW = clamp(this.width * 0.21, 140, 196);
    return order.map((tierId, i) => ({
      tierId,
      x: 24,
      y: 76 + i * (rowH + gap),
      w: railW,
      h: rowH,
    }));
  }

  /** Showcase area beside/below the tier picker. */
  private galleryArea() {
    if (this.compact) {
      return { x: 24, y: 124, w: this.width - 48, h: this.height - 124 - 34 };
    }
    const railW = clamp(this.width * 0.21, 140, 196);
    const x = 24 + railW + 18;
    return { x, y: 76, w: this.width - x - 24, h: this.height - 76 - 40 };
  }

  /**
   * Landscape-first card grid: weapons are much wider than tall, so cards
   * are too. Picks the column count that maximizes the displayed weapon
   * scale (a ~2:1 silhouette inside a card with a caption strip).
   */
  private galleryGrid(n: number, areaW: number, areaH: number, gap: number) {
    let best = { cols: 1, rows: n, cw: areaW, ch: (areaH - gap * (n - 1)) / n, score: -1 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (areaW - gap * (cols - 1)) / cols;
      const ch = (areaH - gap * (rows - 1)) / rows;
      const score = Math.min(cw / 2.05, ch - 52);
      if (score > best.score) best = { cols, rows, cw, ch, score };
    }
    return best;
  }

  private galleryRailAt(x: number, y: number): GachaTierId | null {
    const row = this.galleryRailRows().find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    return row?.tierId ?? null;
  }

  private drawGallery(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();
    const compact = this.compact;

    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.text;
    ctx.fillText(zh ? '收藏册' : 'COLLECTION', 26, 32);
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(this.width - 24, 58);
    ctx.stroke();
    this.drawNav(ctx, p);

    // ── Tier rail/chips: pick one rarity, browse its weapons large. ──
    for (const row of this.galleryRailRows()) {
      const tier = GACHA_TIERS.find((t) => t.id === row.tierId)!;
      const items = GACHA_POOL[row.tierId];
      const ownedCount = items.filter((it) => (this.stats.itemCounts[it.id] ?? 0) > 0).length;
      const selected = row.tierId === this.galleryTier;

      ctx.save();
      if (selected) drawGlow(ctx, row.x + row.w / 2, row.y + row.h / 2, 64, tier.color, dark ? 0.16 : 0.1);
      ctx.fillStyle = selected
        ? withAlpha(tier.color, dark ? 0.14 : 0.08)
        : dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.42)';
      roundRectPath(ctx, row.x, row.y, row.w, row.h, 12);
      ctx.fill();
      ctx.strokeStyle = selected ? withAlpha(tier.color, 0.75) : p.panelBorderSoft;
      ctx.lineWidth = selected ? 1.5 : 1;
      roundRectPath(ctx, row.x + 0.5, row.y + 0.5, row.w - 1, row.h - 1, 12);
      ctx.stroke();

      if (compact) {
        // Chip: rarity color bar on top, name + count centered.
        ctx.fillStyle = tier.color;
        roundRectPath(ctx, row.x + row.w / 2 - 14, row.y + 5, 28, 2.5, 1.25);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '600 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = selected ? tier.color : p.text;
        ctx.fillText(truncate(zh ? tier.nameZh : tier.name, zh ? 4 : 9), row.x + row.w / 2, row.y + 21);
        ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = ownedCount > 0 ? tier.color : p.textFaint;
        ctx.fillText(`${ownedCount}/${items.length}`, row.x + row.w / 2, row.y + 36);
      } else {
        // Color spine
        ctx.fillStyle = tier.color;
        roundRectPath(ctx, row.x + 10, row.y + 12, 3.5, row.h - 24, 1.75);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = selected ? tier.color : p.text;
        ctx.fillText(zh ? tier.nameZh : tier.name, row.x + 24, row.y + 20);
        ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = p.textFaint;
        ctx.fillText(weaponFamilyLabel(zh, row.tierId), row.x + 24, row.y + 38);

        // Owned progress, right-aligned
        ctx.textAlign = 'right';
        ctx.font = '600 12px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = ownedCount > 0 ? tier.color : p.textFaint;
        ctx.fillText(`${ownedCount}/${items.length}`, row.x + row.w - 12, row.y + row.h - 16);
      }
      ctx.restore();
    }

    // ── Showcase cards: the selected tier's weapons in a landscape-first
    // grid, each fitted by its true aspect — photos when owned. ──
    const tier = GACHA_TIERS.find((t) => t.id === this.galleryTier) ?? GACHA_TIERS[GACHA_TIERS.length - 1];
    const items = GACHA_POOL[tier.id] ?? [];
    const n = Math.max(1, items.length);
    const area = this.galleryArea();
    const gap = compact ? 10 : 14;
    const grid = this.galleryGrid(n, area.w, area.h, gap);
    const gridH = grid.ch * grid.rows + gap * (grid.rows - 1);
    const y0 = area.y + (area.h - gridH) / 2;

    items.forEach((item, i) => {
      const r = Math.floor(i / grid.cols);
      const c = i % grid.cols;
      // Center a short last row under the full rows above it.
      const inRow = Math.min(grid.cols, n - r * grid.cols);
      const rowW = grid.cw * inRow + gap * (inRow - 1);
      const x0 = area.x + (area.w - rowW) / 2;
      this.drawCollectionCard(ctx, x0 + c * (grid.cw + gap), y0 + r * (grid.ch + gap), grid.cw, grid.ch, tier, item, this.stats.itemCounts[item.id] ?? 0, p);
    });

    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = p.textFaint;
    ctx.fillText(zh ? '← → 切换稀有度' : '← → switch tier', this.width - 26, this.height - 14);
  }

  private drawCollectionCard(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    tier: GachaTier, item: GachaItem, owned: number,
    p: GachaPalette,
  ) {
    const locked = owned <= 0;
    const dark = this.isDarkTheme();

    // Sheet with a faint tier tint rising from the bottom
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (locked) {
      grad.addColorStop(0, dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, dark ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.3)');
    } else {
      grad.addColorStop(0, p.cardFillTop);
      grad.addColorStop(0.62, p.cardFillBottom);
      grad.addColorStop(1, withAlpha(tier.color, dark ? 0.1 : 0.06));
    }
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.fill();

    // Faint blueprint grid inside the card, echoing the result reveal
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.clip();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(2,132,199,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = x + 16; gx < x + w; gx += 18) {
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
    }
    for (let gy = y + 16; gy < y + h; gy += 18) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    ctx.restore();

    // Border: rarity gradient frame when owned, neutral hairline when locked
    if (locked) {
      ctx.strokeStyle = p.panelBorderSoft;
    } else {
      const frame = ctx.createLinearGradient(x, y, x, y + h);
      frame.addColorStop(0, withAlpha(tier.color, 0.65));
      frame.addColorStop(1, withAlpha(tier.color, 0.18));
      ctx.strokeStyle = frame;
    }
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14);
    ctx.stroke();

    // Rarity top accent
    ctx.fillStyle = tier.color;
    ctx.globalAlpha = locked ? 0.35 : 0.9;
    roundRectPath(ctx, x + w / 2 - 16, y + 7, 32, 2.5, 1.25);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Weapon art: the real inventory render once owned; a monochrome
    // silhouette while locked. Sized by the weapon's true aspect so wide
    // snipers fill the card and tall knives stay inside it.
    const iconId = item.icon ?? item.kind;
    const iconAreaH = h - 52;
    const iconCy = y + 12 + (iconAreaH - 12) / 2;
    if (locked) {
      const iconSize = weaponIconFitSize(iconId, w - 28, iconAreaH - 14);
      drawWeaponIcon(ctx, iconId, x + w / 2, iconCy, {
        color: dark ? '#cbd5e1' : '#475569',
        alpha: 0.55,
        size: iconSize,
        mono: true,
      });
    } else {
      drawGlow(ctx, x + w / 2, iconCy, Math.min(w, iconAreaH) * 0.5, tier.color, dark ? 0.2 : 0.12);
      drawWeaponPhoto(ctx, iconId, x + w / 2, iconCy, w - 24, iconAreaH - 12, {
        fallbackColor: dark ? '#eef2f8' : '#2b3648',
      });
    }

    // Name + subtitle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = locked ? p.textFaint : p.text;
    ctx.fillText(truncate(this.isZhLang() ? item.nameZh : item.name, 14), x + w / 2, y + h - 30);
    if (item.name !== item.nameZh) {
      ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = p.textFaint;
      ctx.fillText(truncate(item.name, 30), x + w / 2, y + h - 13);
    }

    // Ownership badge / locked tag
    if (locked) {
      ctx.font = '600 9px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = p.textFaint;
      ctx.textAlign = 'right';
      ctx.fillText(this.isZhLang() ? '未获得' : 'LOCKED', x + w - 12, y + 16);
    } else {
      ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = tier.color;
      ctx.textAlign = 'right';
      ctx.fillText(`×${owned}`, x + w - 12, y + 17);
    }
  }

  /* ─── Stats ─── */

  private drawStats(ctx: CanvasRenderingContext2D, p: GachaPalette) {
    const zh = this.isZhLang();
    const total = this.stats.totalPulls;
    const compact = this.compact;

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
    const dcx = compact ? this.width * 0.26 : this.width * 0.24;
    const dcy = compact ? 140 : 100 + (this.height - 100) * 0.42;
    const radius = compact
      ? clamp(Math.min(this.width, this.height) * 0.15, 44, 58)
      : clamp(Math.min(this.width, this.height) * 0.2, 72, 118);
    const ringW = Math.max(14, radius * 0.3);
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
    drawGlow(ctx, dcx, dcy, radius * 0.62, p.accent, this.isDarkTheme() ? 0.14 : 0.08);
    ctx.textAlign = 'center';
    ctx.font = `700 ${compact ? 22 : 32}px ui-monospace, SFMono-Regular, monospace`;
    ctx.fillStyle = p.text;
    ctx.fillText(String(total), dcx, dcy - 4);
    ctx.font = `${compact ? 9 : 11}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '累计抽取' : 'TOTAL PULLS', dcx, dcy + (compact ? 16 : 22));

    // ── Per-tier rows with thin progress bars. ──
    const rowX = compact ? this.width * 0.5 : this.width * 0.48;
    const rowW = this.width - rowX - (compact ? 24 : 30);
    const step = compact ? 36 : clamp((this.height - 220) / 5, 44, 58);
    let y = compact ? 92 : 118;
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
      y += step;
    }

    // ── Recent pulls: real renders as colored chips. ──
    const hy = compact ? Math.max(y + 16, this.height - 108) : this.height - 56;
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = p.textDim;
    ctx.fillText(zh ? '最近抽取' : 'RECENT PULLS', 30, hy - 14);
    const allItems = GACHA_TIERS.flatMap((tier) => GACHA_POOL[tier.id].map((item) => ({ item, tier })));
    const recent = this.stats.history.slice(0, 14);
    let hx = 30;
    const chipStep = compact ? 38 : 44;
    const chipW = compact ? 30 : 34;
    const chipH = compact ? 18 : 20;
    for (const entry of recent) {
      const tier = GACHA_TIERS.find((t) => t.id === entry.tierId);
      const item = allItems.find((e) => e.item.id === entry.itemId)?.item;
      if (!tier || !item) continue;
      const iconId = item.icon ?? item.kind;
      drawWeaponPhoto(ctx, iconId, hx + chipW / 2, hy + 6, chipW, chipH, {
        fallbackColor: p.textDim as string,
      });
      ctx.beginPath();
      ctx.fillStyle = tier.color;
      ctx.arc(hx + chipW / 2, hy + 26, 2.5, 0, Math.PI * 2);
      ctx.fill();
      hx += chipStep;
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

  private hitAgain() {
    const w = Math.min(220, this.width * 0.55);
    return { x: this.width / 2 - w / 2, y: this.height - 62, w, h: 46 };
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
      // Gallery: arrow keys walk the tier rail.
      if (this.screen === 'gallery' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const order = [...GACHA_TIER_ORDER].reverse();
        const i = Math.max(0, order.indexOf(this.galleryTier));
        const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        this.galleryTier = order[(i + dir + order.length) % order.length];
        this.sfx.click();
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
      const overRail = this.screen === 'gallery' && pt !== null && this.galleryRailAt(pt.x, pt.y) !== null;
      const clickable = hover !== null || overRail || this.screen === 'menu' || this.screen === 'result';
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
      this.galleryTier = 'rarespecial';
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
      case 'gallery': {
        // Tier rail selection; clicks elsewhere on this screen are inert.
        const tierId = this.galleryRailAt(x, y);
        if (tierId && tierId !== this.galleryTier) {
          this.galleryTier = tierId;
          this.sfx.click();
        }
        return;
      }
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
