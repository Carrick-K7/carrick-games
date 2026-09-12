// csHud.ts — canvas HUD, menu and overlay rendering for the migrated CS engine.
//
// The standalone carrick-cs app drove a DOM HUD; in the shell everything is
// drawn onto the game's 2D canvas. This module renders menu screens, the
// in-match HUD and all overlay panels (buy / scoreboard / tactical map /
// pause / settings / match end / touch controls) from the engine's `hud`
// view-model, and registers immediate-mode hit regions that cs.ts routes
// mouse/touch input through.
//
// Layout is responsive: draw() receives the live CSS viewport size and every
// panel is positioned through computeHudLayout() (safe-area insets, the
// top-right shell button reserve, compact/short breakpoints). Menus that do
// not fit short screens scroll internally (wheel + touch drag) instead of
// shrinking text below readable sizes; hit regions are registered in the same
// pass that draws, so draw and hit-testing never disagree.

import type { CsEngine } from './csEngine.js';
import { MAPS } from './csMaps.js';
import {
  buttonHit,
  computeHudLayout,
  computeTouchControls,
  ellipsize,
  healthPanelRect,
  HudScroll,
  menuHeaderLayout,
  normalizeSafeArea,
  scoreboardRect,
  scoreStripRect,
  TOUCH_TARGET,
  weaponPanelRect,
  type HudLayout,
  type HudSafeArea,
  type TouchButton,
  type TouchButtonId,
} from './csHudLayout.js';

export interface HudRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  id?: string;
  disabled?: boolean;
  down?: (x: number, y: number) => void;
  up?: () => void;
  drag?: (x: number, y: number) => void;
  /**
   * Touch-only: inside scrollable panels the tap action is deferred to
   * touchend; a vertical drag past the tap threshold instead scrolls the
   * `scroll` panel. Mouse input always fires `down` immediately.
   */
  deferTap?: boolean;
  scroll?: HudScroll;
}

type Ctx = CanvasRenderingContext2D;

/** View-model produced by CsEngine.computeHud() and rendered by CsHud. */
export interface CsHudView {
  fps: string;
  menuError: string;
  menuStart: { enabled: boolean; label: string };
  notice: { text: string } | null;
  center: { kicker: string; title: string; detail: string } | null;
  health: number;
  armor: number;
  healthPct: number;
  healthLow: boolean;
  killCount: number;
  grenadeCount: number;
  weaponName: string;
  ammoText: string;
  reserveText: string;
  reloadState: string;
  slots: { key: string; num: number; equipped: boolean; label: string; empty: boolean }[];
  pickup: { name: string; verb: string } | null;
  crosshairHidden: boolean;
  crosshairGap: number;
  scope: boolean;
  scopeLabel: string;
  hitOpacity: number;
  hitHead: boolean;
  damageOpacity: number;
  location: string;
  roundLabel: string;
  timerText: string;
  timerUrgent: boolean;
  ctScore: number;
  tScore: number;
  alivePips: { ct: string[]; t: string[] };
  objective: { text: string; plantVerb: boolean; defuseVerb: boolean } | null;
  objectiveAction: { text: string; progress01: number } | null;
  money: string | null;
  buyTimeText: string;
  matchEnd: { won: boolean; title: string; score: string; stats: string } | null;
  radio: { title: string; options: string[] } | null;
  killfeed: { aName: string; aTeam: string; aMe: boolean; bName: string; bTeam: string; weapon: string; head: boolean; time: number }[];
  scoreboardOpen: boolean;
  bombMarker: unknown;
}

const C = {
  panel: 'rgba(10, 17, 24, 0.86)',
  panelSoft: 'rgba(16, 26, 35, 0.78)',
  border: '#2c3f4e',
  text: '#e8f1f7',
  dim: '#9db3c0',
  faint: '#64798a',
  amber: '#f4a64a',
  blue: '#80caf7',
  red: '#ec6659',
  green: '#8fd694',
  gold: '#f5be67',
};

const MAP_EN: Record<string, { name: string; eyebrow: string; intro: string; hint: string; tags: string[] }> = {
  fy_snow: {
    name: 'Snow Arena', eyebrow: 'FIGHT YARD · SNOW ELIMINATION', intro: 'Back to the snow. One more round.',
    hint: 'AWP: flank from the spawn side to the rear balcony', tags: ['Team fight', 'Ground pickups', 'Classic layout'],
  },
  de_dust2: {
    name: 'Dust II', eyebrow: 'DUST II · DEFUSAL', intro: 'Push through mid doors toward the next site.',
    hint: 'Long A · Catwalk · Mid doors · B tunnels', tags: ['A / B sites', 'Plant & defuse', 'Classic Dust II'],
  },
};

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;

export class CsHud {
  regions: HudRegion[] = [];

  private safeArea: HudSafeArea = normalizeSafeArea(null);
  private readonly menuScroll = new HudScroll();
  private readonly buyScroll = new HudScroll();
  /** Vertical offset applied to hit regions while drawing scrolled content. */
  private regionDy = 0;
  /** Visible clip rect (screen space) for scrolled hit regions. */
  private regionClip: { x: number; y: number; w: number; h: number } | null = null;
  /** Scroll state of the container currently being drawn (for deferred taps). */
  private regionScroll: HudScroll | null = null;

  constructor(private readonly engine: CsEngine) {}

  private L(zh: string, en: string): string {
    return this.engine.isZh() ? zh : en;
  }

  setSafeArea(sa?: Partial<HudSafeArea> | null) {
    this.safeArea = normalizeSafeArea(sa);
  }

  hitTest(x: number, y: number): HudRegion | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (r.disabled) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ── Wheel routing (menu scroll vs weapon switch) ─────────────────────────

  /** True when the wheel should scroll a HUD panel instead of switching weapons. */
  wantsWheel(): boolean {
    const e = this.engine;
    if (e.phase === 'menu' && this.menuScroll.active) return true;
    if (e.buyOpen && this.buyScroll.active) return true;
    return false;
  }

  onWheel(deltaY: number) {
    if (this.engine.phase === 'menu' && this.menuScroll.active) this.menuScroll.wheel(deltaY);
    else if (this.engine.buyOpen && this.buyScroll.active) this.buyScroll.wheel(deltaY);
  }

  // ── Small drawing helpers ────────────────────────────────────────────────

  /**
   * Register a hit region, mapping scrolled content space to screen space.
   * Regions inside a scroll container are intersected with the visible clip
   * (partial rows no longer leak hit area outside the panel) and marked for
   * deferred tap activation so touch swipes scroll instead of firing actions.
   */
  private push(r: HudRegion) {
    let region = this.regionDy ? { ...r, y: r.y + this.regionDy } : r;
    const c = this.regionClip;
    if (c) {
      const x0 = Math.max(region.x, c.x);
      const y0 = Math.max(region.y, c.y);
      const x1 = Math.min(region.x + region.w, c.x + c.w);
      const y1 = Math.min(region.y + region.h, c.y + c.h);
      if (x1 - x0 < 4 || y1 - y0 < 4) return; // invisible / unusably clipped
      region = { ...region, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (region.down) {
        region.deferTap = true;
        if (this.regionScroll) region.scroll = this.regionScroll;
      }
    }
    this.regions.push(region);
  }

  /**
   * Clip + translate into a scrollable content area. Hit regions pushed
   * inside are shifted by the current scroll offset and dropped when fully
   * outside the visible window.
   */
  private beginScroll(ctx: Ctx, x: number, y: number, w: number, h: number, scroll: HudScroll) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(0, -scroll.offset);
    this.regionDy = -scroll.offset;
    this.regionClip = { x, y, w, h };
    this.regionScroll = scroll;
    // Background drag-to-scroll, lowest priority (registered first).
    this.regions.push({
      x, y, w, h,
      down: () => scroll.beginDrag(),
      drag: (_px, py) => scroll.drag(py),
      up: () => scroll.endDrag(),
    });
  }

  private endScroll(ctx: Ctx) {
    ctx.restore();
    this.regionDy = 0;
    this.regionClip = null;
    this.regionScroll = null;
  }

  /** Draw a scrollbar for an active HudScroll and register its thumb drag. */
  private drawScrollbar(ctx: Ctx, scroll: HudScroll, x: number, y: number, h: number, contentH: number) {
    if (!scroll.active) return;
    const viewH = h;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, 6, h);
    const thumbH = Math.max(24, (viewH / contentH) * h);
    const thumbY = y + (scroll.offset / scroll.max) * (h - thumbH);
    ctx.fillStyle = 'rgba(244,166,74,0.6)';
    ctx.fillRect(x, thumbY, 6, thumbH);
    this.regions.push({
      x: x - 8, y, w: 22, h,
      down: () => scroll.beginDrag(),
      drag: (_px, py) => scroll.drag(py, -(contentH / viewH)),
      up: () => scroll.endDrag(),
    });
  }

  private panel(ctx: Ctx, x: number, y: number, w: number, h: number, soft = false) {
    ctx.fillStyle = soft ? C.panelSoft : C.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private text(ctx: Ctx, str: string, x: number, y: number, size: number, color = C.text, align: CanvasTextAlign = 'left', bold = true) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  private button(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, action: () => void, opts: { selected?: boolean; disabled?: boolean; primary?: boolean; small?: boolean } = {}) {
    const bg = opts.disabled ? 'rgba(20,28,36,0.6)' : opts.primary ? C.amber : opts.selected ? 'rgba(244,166,74,0.16)' : 'rgba(30,44,56,0.85)';
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = opts.selected ? C.amber : C.border;
    ctx.lineWidth = opts.selected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.text(ctx, ellipsize(ctx, label, w - 12), x + w / 2, y + h / 2, opts.small ? 11 : 13, opts.disabled ? C.faint : opts.primary ? '#1a1206' : opts.selected ? C.amber : C.text, 'center');
    this.push({ x, y, w, h, disabled: opts.disabled, down: () => action() });
  }

  // ── Menu ─────────────────────────────────────────────────────────────────

  private drawMenu(ctx: Ctx, Lyt: HudLayout) {
    // Touch devices always get the flow menu: its rows are ≥44px and it
    // scrolls internally, whereas the classic desktop menu keeps 34px rows
    // (mouse baseline, pixel-compatible with the 1280x720 e2e coordinates).
    if (Lyt.classicMenu && !this.engine.touchMode) this.drawMenuClassic(ctx, Lyt);
    else this.drawMenuFlow(ctx, Lyt);
  }

  /** Original two-column layout, pixel-compatible with the 1280x720 design. */
  private drawMenuClassic(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W, H } = Lyt;
    const map = (MAPS as Record<string, any>)[e.selectedMap];
    const en = MAP_EN[e.selectedMap] || MAP_EN.fy_snow;
    const mapName = this.L(map.name, en.name);
    const left = 64 + this.safeArea.left;
    let y = 74 + this.safeArea.top;

    this.menuScroll.setMax(0);

    // Brand + status line (kept clear of the shell's top-right button).
    this.text(ctx, '✣ CS', left, y, 40, C.amber);
    this.text(ctx, this.L('浏览器战术射击', 'BROWSER TACTICAL FPS'), left + 108, y + 4, 12, C.dim);
    this.text(ctx, `${e.hud.fps} FPS · 5 VS 5 · ${this.L('机器人对战', 'BOT MATCH')}`,
      Math.min(W - 64 - this.safeArea.right, Lyt.shellReserve.x - 12), 30 + this.safeArea.top, 11, C.faint, 'right', false);
    y += 66;

    const panelW = 500;
    this.panel(ctx, left, y, panelW, 492);
    let py = y + 26;

    this.text(ctx, this.L(map.eyebrow, en.eyebrow), left + 24, py, 11, C.amber);
    py += 24;
    this.text(ctx, mapName, left + 24, py, 30, C.text);
    py += 30;
    this.text(ctx, this.L(map.intro, en.intro), left + 24, py, 12, C.dim, 'left', false);
    py += 34;

    // Map cards
    this.text(ctx, this.L('选择地图', 'MAP'), left + 24, py, 11, C.faint);
    py += 16;
    const cards: { id: string; name: string; sub: string; disabled?: boolean }[] = [
      { id: 'fy_snow', name: this.L('雪地竞技场', 'Snow Arena'), sub: this.L('经典雪地 · 地面拾枪', 'Classic snow · ground pickups') },
      { id: 'de_dust2', name: this.L('炙热沙城Ⅱ', 'Dust II'), sub: this.L('Dust II · 双包点爆破', 'Dust II · twin-site defusal') },
    ];
    for (const [i, card] of cards.entries()) {
      const cy = py + i * 52;
      const selected = e.selectedMap === card.id;
      ctx.fillStyle = selected ? 'rgba(244,166,74,0.14)' : 'rgba(26,38,48,0.8)';
      ctx.fillRect(left + 24, cy, panelW - 48, 46);
      ctx.strokeStyle = selected ? C.amber : C.border;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(left + 24.5, cy + 0.5, panelW - 49, 45);
      this.text(ctx, '0' + (i + 1), left + 44, cy + 23, 13, selected ? C.amber : C.faint);
      this.text(ctx, card.name, left + 72, cy + 16, 14, selected ? C.text : C.dim);
      this.text(ctx, card.sub, left + 72, cy + 34, 10, C.faint, 'left', false);
      if (selected) this.text(ctx, '✓', left + panelW - 44, cy + 23, 15, C.amber);
      this.push({ x: left + 24, y: cy, w: panelW - 48, h: 46, down: () => e.selectMap(card.id) });
    }
    py += 2 * 52 + 16;

    // Mode row
    this.text(ctx, this.L('选择模式', 'MODE'), left + 24, py, 11, C.faint);
    py += 14;
    const modes: { id: string; zh: string; en: string }[] = [
      { id: 'elimination', zh: '回合歼灭', en: 'Elimination' },
      { id: 'defusal', zh: '经典爆破', en: 'Defusal' },
      { id: 'tdm', zh: '团队竞技', en: 'Team DM' },
    ].filter(m => map.modes.includes(m.id));
    const mw = (panelW - 48 - (modes.length - 1) * 8) / modes.length;
    modes.forEach((m, i) => {
      this.button(ctx, left + 24 + i * (mw + 8), py, mw, 34, this.L(m.zh, m.en), () => e.selectMode(m.id), { selected: e.selectedMode === m.id });
    });
    py += 46;

    // Kill limit (tdm only)
    if (e.selectedMode === 'tdm') {
      this.text(ctx, this.L('获胜击杀数', 'KILL LIMIT'), left + 24, py, 11, C.faint);
      py += 14;
      [30, 50, 100].forEach((n, i) => {
        this.button(ctx, left + 24 + i * (86 + 8), py, 86, 28, String(n), () => e.setKillLimit(n), { selected: e.selectedKillLimit === n, small: true });
      });
      py += 38;
    }

    // Team + difficulty on one row each
    this.text(ctx, this.L('选择阵营', 'TEAM'), left + 24, py, 11, C.faint);
    py += 14;
    this.button(ctx, left + 24, py, (panelW - 56) / 2, 34, this.L('反恐精英 CT', 'CT · Counter-Terrorists'), () => e.selectTeam('ct'), { selected: e.selectedTeam === 'ct' });
    this.button(ctx, left + 32 + (panelW - 56) / 2, py, (panelW - 56) / 2, 34, this.L('恐怖分子 T', 'T · Terrorists'), () => e.selectTeam('t'), { selected: e.selectedTeam === 't' });
    py += 46;

    this.text(ctx, this.L('机器人难度', 'BOT SKILL'), left + 24, py, 11, C.faint);
    this.text(ctx, this.L('初始手枪', 'STARTING PISTOL'), left + 256, py, 11, C.faint);
    py += 14;
    const diffLabels: [string, string][] = [['休闲', 'Casual'], ['标准', 'Regular'], ['硬核', 'Hardcore']];
    DIFFICULTIES.forEach((d, i) => {
      this.button(ctx, left + 24 + i * 64, py, 58, 28, this.L(diffLabels[i][0], diffLabels[i][1]), () => e.setDifficulty(d), { selected: e.difficulty === d, small: true });
    });
    this.button(ctx, left + 256, py, 108, 28, this.L('阵营默认', 'Faction'), () => e.setPistol('default'), { selected: e.selectedPistol === 'default', small: true });
    this.button(ctx, left + 370, py, 106, 28, 'Desert Eagle', () => e.setPistol('deagle'), { selected: e.selectedPistol === 'deagle', small: true });
    py += 44;

    // Start button
    const startLabel = e.mapLoading
      ? this.L('正在装载 ', 'Loading ') + mapName + '…'
      : e.ready ? this.L('进入战场', 'Enter the Arena') + ' ↗' : this.L('重试加载地图', 'Retry Map Load');
    this.button(ctx, left + 24, py, panelW - 48, 44, startLabel, () => e.primaryAction(), { primary: true, disabled: e.mapLoading });
    py += 58;
    this.text(ctx, this.modeNote(), left + 24, py, 11, C.dim, 'left', false);
    py += 24;
    this.text(ctx, this.L('设置 · 鼠标与画面', 'Settings · mouse & video'), left + 24, py, 12, C.blue);
    this.push({ x: left + 24, y: py - 12, w: 220, h: 24, down: () => e.openSettings() });
    this.text(ctx, this.L('音效 ', 'Sound ') + (e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off')), left + panelW - 24, py, 12, C.blue, 'right');
    this.push({ x: left + panelW - 124, y: py - 12, w: 100, h: 24, down: () => e.toggleSound() });

    // Map caption card (right side)
    const rx = 810, rw = W - rx - 64 - this.safeArea.right;
    this.panel(ctx, rx, 96 + this.safeArea.top, rw, 150, true);
    this.text(ctx, this.L('当前地图', 'CURRENT MAP'), rx + 20, 118 + this.safeArea.top, 10, C.faint);
    this.text(ctx, mapName, rx + 20, 142 + this.safeArea.top, 20, C.text);
    const tags = this.L(map.tags.join(' · '), en.tags.join(' · '));
    this.text(ctx, tags, rx + 20, 168 + this.safeArea.top, 11, C.amber, 'left', false);
    this.text(ctx, ellipsize(ctx, this.L(map.hint, en.hint), rw - 40), rx + 20, 196 + this.safeArea.top, 11, C.dim, 'left', false);
    this.text(ctx, this.L('地图：' + map.credit + ' · 社区致敬作品 · 非 Valve 官方游戏', 'Map: ' + map.credit + ' · community tribute · not a Valve title'), rx + 20, 226 + this.safeArea.top, 10, C.faint, 'left', false);

    // The shared shell guide owns operation instructions, including touch.

    if (e.hud.menuError) this.toast(ctx, e.hud.menuError, W, 60 + this.safeArea.top, C.red, Lyt);
  }

  /**
   * Single-column flow menu for narrow and short screens. Content taller
   * than the panel scrolls internally (wheel / touch drag / scrollbar);
   * interactive rows stay ≥ TOUCH_TARGET tall.
   */
  private drawMenuFlow(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W } = Lyt;
    const map = (MAPS as Record<string, any>)[e.selectedMap];
    const en = MAP_EN[e.selectedMap] || MAP_EN.fy_snow;
    const mapName = this.L(map.name, en.name);
    const x = Lyt.left, top = Lyt.top;
    const panelW = Math.min(500, Lyt.availW);

    // Brand + status line share only the space left of the brand/help/menu row.
    const status = `${e.hud.fps} FPS · 5 VS 5`;
    const font = '"Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    ctx.font = `10px ${font}`;
    const header = menuHeaderLayout(Lyt, ctx.measureText(status).width);
    ctx.font = `bold 28px ${font}`;
    this.text(ctx, ellipsize(ctx, '✣ CS', header.titleWidth), x, top + 14, 28, C.amber);
    ctx.font = `bold 11px ${font}`;
    if (header.subtitleWidth >= ctx.measureText('…').width) this.text(ctx, ellipsize(ctx, this.L('浏览器战术射击', 'BROWSER TACTICAL FPS'), header.subtitleWidth), header.subtitleX, top + 16, 11, C.dim);
    if (header.showStatus) this.text(ctx, status, header.statusX, top + 10, 10, C.faint, 'right', false);

    const panelY = top + 40;
    const panelH = Math.max(160, Lyt.bottom - panelY);
    this.panel(ctx, x, panelY, panelW, panelH);

    const pad = 18;
    const cw = panelW - pad * 2 - 10; // 10px scrollbar lane
    const viewY = panelY + 4, viewH = panelH - 8;
    const contentTop = panelY + pad;

    this.beginScroll(ctx, x + 2, viewY, panelW - 4, viewH, this.menuScroll);
    let cy = contentTop;
    const label = (s: string) => { this.text(ctx, s, x + pad, cy, 11, C.faint); cy += 14; };

    this.text(ctx, ellipsize(ctx, this.L(map.eyebrow, en.eyebrow), cw), x + pad, cy, 11, C.amber);
    cy += 20;
    this.text(ctx, ellipsize(ctx, mapName, cw), x + pad, cy, 26, C.text);
    cy += 28;
    this.text(ctx, ellipsize(ctx, this.L(map.intro, en.intro), cw), x + pad, cy, 11, C.dim, 'left', false);
    cy += 28;

    // Map cards
    label(this.L('选择地图', 'MAP'));
    cy += 2;
    const cards: { id: string; name: string; sub: string }[] = [
      { id: 'fy_snow', name: this.L('雪地竞技场', 'Snow Arena'), sub: this.L('经典雪地 · 地面拾枪', 'Classic snow · ground pickups') },
      { id: 'de_dust2', name: this.L('炙热沙城Ⅱ', 'Dust II'), sub: this.L('Dust II · 双包点爆破', 'Dust II · twin-site defusal') },
    ];
    for (const [i, card] of cards.entries()) {
      const selected = e.selectedMap === card.id;
      ctx.fillStyle = selected ? 'rgba(244,166,74,0.14)' : 'rgba(26,38,48,0.8)';
      ctx.fillRect(x + pad, cy, cw, 52);
      ctx.strokeStyle = selected ? C.amber : C.border;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + pad + 0.5, cy + 0.5, cw - 1, 51);
      this.text(ctx, '0' + (i + 1), x + pad + 18, cy + 26, 13, selected ? C.amber : C.faint);
      this.text(ctx, ellipsize(ctx, card.name, cw - 70), x + pad + 44, cy + 18, 14, selected ? C.text : C.dim);
      this.text(ctx, ellipsize(ctx, card.sub, cw - 70), x + pad + 44, cy + 37, 10, C.faint, 'left', false);
      if (selected) this.text(ctx, '✓', x + pad + cw - 20, cy + 26, 15, C.amber);
      this.push({ x: x + pad, y: cy, w: cw, h: 52, down: () => e.selectMap(card.id) });
      cy += 52 + 8;
    }
    cy += 12;

    // Mode row
    label(this.L('选择模式', 'MODE'));
    const modes: { id: string; zh: string; en: string }[] = [
      { id: 'elimination', zh: '回合歼灭', en: 'Elimination' },
      { id: 'defusal', zh: '经典爆破', en: 'Defusal' },
      { id: 'tdm', zh: '团队竞技', en: 'Team DM' },
    ].filter(m => map.modes.includes(m.id));
    const mw = (cw - (modes.length - 1) * 8) / modes.length;
    modes.forEach((m, i) => {
      this.button(ctx, x + pad + i * (mw + 8), cy, mw, TOUCH_TARGET, this.L(m.zh, m.en), () => e.selectMode(m.id), { selected: e.selectedMode === m.id });
    });
    cy += TOUCH_TARGET + 12;

    // Kill limit (tdm only)
    if (e.selectedMode === 'tdm') {
      label(this.L('获胜击杀数', 'KILL LIMIT'));
      const kw = (cw - 16) / 3;
      [30, 50, 100].forEach((n, i) => {
        this.button(ctx, x + pad + i * (kw + 8), cy, kw, TOUCH_TARGET, String(n), () => e.setKillLimit(n), { selected: e.selectedKillLimit === n, small: true });
      });
      cy += TOUCH_TARGET + 12;
    }

    // Team
    label(this.L('选择阵营', 'TEAM'));
    const tw = (cw - 8) / 2;
    this.button(ctx, x + pad, cy, tw, TOUCH_TARGET, this.L('反恐精英 CT', 'CT'), () => e.selectTeam('ct'), { selected: e.selectedTeam === 'ct' });
    this.button(ctx, x + pad + tw + 8, cy, tw, TOUCH_TARGET, this.L('恐怖分子 T', 'T'), () => e.selectTeam('t'), { selected: e.selectedTeam === 't' });
    cy += TOUCH_TARGET + 12;

    // Difficulty + pistol
    label(this.L('机器人难度', 'BOT SKILL'));
    const diffLabels: [string, string][] = [['休闲', 'Casual'], ['标准', 'Regular'], ['硬核', 'Hardcore']];
    const dw = (cw - 16) / 3;
    DIFFICULTIES.forEach((d, i) => {
      this.button(ctx, x + pad + i * (dw + 8), cy, dw, TOUCH_TARGET, this.L(diffLabels[i][0], diffLabels[i][1]), () => e.setDifficulty(d), { selected: e.difficulty === d, small: true });
    });
    cy += TOUCH_TARGET + 10;
    label(this.L('初始手枪', 'STARTING PISTOL'));
    this.button(ctx, x + pad, cy, tw, TOUCH_TARGET, this.L('阵营默认', 'Faction'), () => e.setPistol('default'), { selected: e.selectedPistol === 'default', small: true });
    this.button(ctx, x + pad + tw + 8, cy, tw, TOUCH_TARGET, 'Desert Eagle', () => e.setPistol('deagle'), { selected: e.selectedPistol === 'deagle', small: true });
    cy += TOUCH_TARGET + 14;

    // Start button
    const startLabel = e.mapLoading
      ? this.L('正在装载 ', 'Loading ') + mapName + '…'
      : e.ready ? this.L('进入战场', 'Enter the Arena') + ' ↗' : this.L('重试加载地图', 'Retry Map Load');
    this.button(ctx, x + pad, cy, cw, 48, startLabel, () => e.primaryAction(), { primary: true, disabled: e.mapLoading });
    cy += 48 + 12;
    this.text(ctx, ellipsize(ctx, this.modeNote(), cw), x + pad, cy, 11, C.dim, 'left', false);
    cy += 24;

    // Settings / sound row
    const links: { label: string; action: () => void }[] = [
      { label: this.L('设置', 'Settings'), action: () => e.openSettings() },
    ];
    links.push({ label: this.L('音效 ', 'Sound ') + (e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off')), action: () => e.toggleSound() });
    const lw = (cw - (links.length - 1) * 8) / links.length;
    links.forEach((link, i) => {
      this.button(ctx, x + pad + i * (lw + 8), cy, lw, TOUCH_TARGET, link.label, link.action, { small: true });
    });
    cy += TOUCH_TARGET + 12;

    // Map hint + controls footer inside the scrollable flow.
    this.text(ctx, ellipsize(ctx, this.L(map.hint, en.hint), cw), x + pad, cy, 10, C.amber, 'left', false);
    cy += 20;

    this.endScroll(ctx);
    this.menuScroll.setMax(cy - (viewY + viewH) + 10);
    this.drawScrollbar(ctx, this.menuScroll, x + panelW - 9, viewY + 4, viewH - 8, cy - contentTop);

    if (e.hud.menuError) this.toast(ctx, e.hud.menuError, W, Lyt.top + 44, C.red, Lyt);
  }

  private modeNote(): string {
    const e = this.engine;
    if (e.selectedMode === 'tdm') return e.selectedMap === 'de_dust2'
      ? this.L('阵亡 3 秒后复活 · 出生携带阵营步枪', 'Respawn after 3s · spawn with faction rifle')
      : this.L('阵亡 3 秒后复活 · 地面武器拾取后 8 秒刷新', 'Respawn after 3s · ground weapons refresh in 8s');
    if (e.selectedMode === 'defusal') return this.L('手枪局 $800 · B 购买 · 5 取出 C4 · 包点安放 / 按住 E 拆除', 'Pistol round $800 · B to buy · 5 for C4 · plant / hold E to defuse');
    return this.L('无主武器时路过自动拾取 · 消灭敌方全队 · 阵亡等待下一回合', 'Walk over to auto-pickup without a primary · eliminate the enemy team · dead until next round');
  }

  // ── Match HUD ────────────────────────────────────────────────────────────

  private drawMatchHud(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine, hud = e.hud;
    const { W, H } = Lyt;
    const m = Lyt.margin, top = Lyt.top, sa = Lyt.safe;

    // Radar + location (top-left)
    const rs = Lyt.short ? 96 : Lyt.compact ? Math.max(88, Math.min(148, Math.round(Math.min(W, H) * 0.28))) : 148;
    const rx = m + sa.left, ry = top;
    e.drawRadarContent(ctx, rx, ry, rs);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rx + rs / 2, ry + rs / 2, rs / 2, 0, Math.PI * 2);
    ctx.stroke();
    if (hud.location) this.text(ctx, hud.location, rx + rs / 2, ry + rs + 16, 11, C.dim, 'center');

    // Center when space permits; phones dock under the radar, never under chrome.
    const { x: sx, y: sy, w: sw } = scoreStripRect(Lyt, rs);
    this.panel(ctx, sx, sy, sw, 46, true);
    this.text(ctx, String(hud.ctScore), sx + 34, sy + 23, 20, C.blue);
    this.text(ctx, String(hud.tScore), sx + sw - 34, sy + 23, 20, C.amber);
    this.text(ctx, ellipsize(ctx, hud.roundLabel, sw - 90), sx + sw / 2, sy + 14, 10, C.dim, 'center', false);
    this.text(ctx, hud.timerText, sx + sw / 2, sy + 32, 16, hud.timerUrgent ? C.red : C.text, 'center');
    // alive pips
    this.pips(ctx, hud.alivePips.ct, sx + 12, sy + 48, C.blue);
    this.pips(ctx, hud.alivePips.t, sx + sw - 12 - hud.alivePips.t.length * 12, sy + 48, C.amber);

    // Objective line (defusal)
    const objY = Lyt.compact ? sy + 54 : 68 + sa.top;
    if (hud.objective) {
      const ow = Math.min(460, Lyt.availW);
      this.panel(ctx, W / 2 - ow / 2, objY, ow, 30, true);
      this.text(ctx, ellipsize(ctx, '◆ ' + hud.objective.text, ow - 20), W / 2, objY + 15, 12, C.gold, 'center');
    }
    if (hud.objectiveAction) {
      const ow = Math.min(360, Lyt.availW), oy = objY + 34;
      this.panel(ctx, W / 2 - ow / 2, oy, ow, 40, true);
      this.text(ctx, ellipsize(ctx, hud.objectiveAction.text, ow - 20), W / 2, oy + 13, 12, C.text, 'center');
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(W / 2 - ow / 2 + 16, oy + 26, ow - 32, 5);
      ctx.fillStyle = C.amber;
      ctx.fillRect(W / 2 - ow / 2 + 16, oy + 26, (ow - 32) * hud.objectiveAction.progress01, 5);
    }

    // Killfeed (top-right, below the shell's 44px button reserve).
    if (Lyt.availW >= 560) {
      let ky = Lyt.contentTop;
      const lineW = Math.min(300, Lyt.availW * 0.42);
      for (const k of hud.killfeed.slice(-5)) {
        const x = W - sa.right - 18 - lineW;
        ctx.fillStyle = 'rgba(10,17,24,0.55)';
        ctx.fillRect(x, ky - 11, lineW, 22);
        this.text(ctx, ellipsize(ctx, k.aName + (k.aMe ? this.L(' · 你', ' · you') : ''), lineW * 0.38), x + 10, ky, 11, k.aTeam === 'ct' ? C.blue : C.amber);
        const aWidth = ctx.measureText(k.aName).width + 10;
        this.text(ctx, '⌈ ' + k.weapon + (k.head ? ' ⌖' : ''), x + aWidth + 26, ky, 10, C.dim, 'left', false);
        this.text(ctx, ellipsize(ctx, k.bName + (k.bTeam === e.player?.team && !k.aMe && k.bName === 'YOU' ? this.L(' · 你', ' · you') : ''), lineW * 0.34), x + lineW - 10, ky, 11, k.bTeam === 'ct' ? C.blue : C.amber, 'right');
        ky += 26;
      }
    }

    // Crosshair / scope / hitmarker
    if (!hud.crosshairHidden && !hud.scope && e.player?.alive && !e.overlayOpen()) {
      const cx = W / 2, cy = H / 2, gap = hud.crosshairGap, len = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();
    }
    if (hud.scope) {
      const r = Math.min(W, H) * 0.42, cx = W / 2, cy = H / 2;
      // Black mask with a circular hole; the zoomed 3D frame stays visible inside.
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,28,36,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();
      this.text(ctx, hud.scopeLabel, cx, Math.min(H - 14, cy + r + 18), 11, C.dim, 'center', false);
    }
    if (hud.hitOpacity > 0) {
      ctx.globalAlpha = hud.hitOpacity;
      this.text(ctx, '×', W / 2, H / 2 - 26, 22, hud.hitHead ? C.gold : '#ffffff');
      ctx.globalAlpha = 1;
    }

    // Center message (kept below the docked score strip on compact screens)
    if (hud.center) {
      const cw = Math.min(560, Lyt.availW);
      const cyMsg = Lyt.compact ? Math.max(H * 0.26, sy + 60) : H * 0.26;
      this.panel(ctx, W / 2 - cw / 2, cyMsg, cw, 96, true);
      this.text(ctx, hud.center.kicker, W / 2, cyMsg + 20, 11, C.amber, 'center');
      this.text(ctx, ellipsize(ctx, hud.center.title, cw - 24), W / 2, cyMsg + 48, 22, C.text, 'center');
      this.text(ctx, ellipsize(ctx, hud.center.detail, cw - 24), W / 2, cyMsg + 76, 11, C.dim, 'center', false);
    }

    // Pickup prompt
    if (hud.pickup) {
      const pw = Math.min(240, Lyt.availW), px = W / 2 - pw / 2, py = H - 210 - sa.bottom;
      this.panel(ctx, px, py, pw, 34, true);
      this.text(ctx, ellipsize(ctx, '[E] ' + hud.pickup.verb + ' · ' + hud.pickup.name, pw - 16), W / 2, py + 17, 12, C.text, 'center');
    }

    // Health / armor / money (bottom-left) — rect shared with touch geometry.
    const hpRect = healthPanelRect(Lyt);
    const hw = hpRect.w, hx = hpRect.x, hy = hpRect.y;
    this.panel(ctx, hx, hy, hw, 78, true);
    if (hud.money) this.text(ctx, ellipsize(ctx, hud.money, hw - 20), hx + 12, hy + 14, 11, C.gold, 'left', false);
    this.text(ctx, '✚ ' + hud.health, hx + 12, hy + 40, 18, hud.healthLow ? C.red : C.text);
    const barW = Math.max(40, hw - 90);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(hx + 12, hy + 54, barW, 6);
    ctx.fillStyle = hud.healthLow ? C.red : C.amber;
    ctx.fillRect(hx + 12, hy + 54, barW * hud.healthPct / 100, 6);
    this.text(ctx, this.L('护甲', 'ARMOR') + ' ' + hud.armor, hx + 12, hy + 68, 10, C.dim, 'left', false);
    this.text(ctx, hud.killCount + this.L(' 击杀', ' kills'), hx + hw - 12, hy + 68, 10, C.dim, 'right', false);

    // Weapon panel (bottom-right) — rect shared with touch geometry.
    const wpRect = weaponPanelRect(Lyt);
    const wpW = wpRect.w, wx = wpRect.x, wy = wpRect.y;
    this.panel(ctx, wx, wy, wpW, 100, true);
    this.text(ctx, ellipsize(ctx, hud.weaponName, wpW - 100), wx + 16, wy + 20, 14, C.text);
    this.text(ctx, hud.ammoText, wx + wpW - 60, wy + 30, 26, C.text, 'right');
    this.text(ctx, '/ ' + hud.reserveText, wx + wpW - 16, wy + 32, 13, C.dim, 'right', false);
    this.text(ctx, ellipsize(ctx, hud.reloadState, wpW - 32), wx + 16, wy + 44, 10, C.dim, 'left', false);
    let slotX = wx + 16;
    for (const s of hud.slots) {
      const bw = 10 + ctx.measureText(s.label).width + 26;
      if (slotX + bw > wx + wpW - 8) break;
      ctx.fillStyle = s.equipped ? 'rgba(244,166,74,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(slotX, wy + 58, bw, 26);
      ctx.strokeStyle = s.equipped ? C.amber : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(slotX + 0.5, wy + 58.5, bw - 1, 25);
      this.text(ctx, s.num + ' ' + (s.key === 'grenade' ? `HE ×${hud.grenadeCount}` : s.label), slotX + bw / 2, wy + 71, 10, s.empty ? C.faint : s.equipped ? C.amber : C.dim, 'center', false);
      slotX += bw + 6;
    }

    // Damage vignette
    if (hud.damageOpacity > 0) {
      ctx.globalAlpha = Math.min(1, hud.damageOpacity);
      ctx.strokeStyle = '#c33327';
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Notice toast
    if (hud.notice) this.toast(ctx, hud.notice.text, W, Math.min(210, H * 0.36), C.text, Lyt);

    // Radio panel
    if (hud.radio) {
      const rw = Math.min(260, Lyt.availW), rrx = m + sa.left, rry = Math.min(220 + sa.top, H - sa.bottom - m - (36 + hud.radio.options.length * 24 + 24));
      this.panel(ctx, rrx, rry, rw, 36 + hud.radio.options.length * 24 + 24);
      this.text(ctx, hud.radio.title, rrx + 14, rry + 20, 12, C.amber);
      hud.radio.options.forEach((opt, i) => {
        this.text(ctx, ellipsize(ctx, (i + 1) + '  ' + opt, rw - 28), rrx + 14, rry + 44 + i * 24, 12, C.text, 'left', false);
      });
      this.text(ctx, '0  ' + this.L('取消', 'Cancel'), rrx + 14, rry + 44 + hud.radio.options.length * 24, 10, C.faint, 'left', false);
    }

    if (e.touchMode) this.drawTouchControls(ctx, Lyt);
  }

  private pips(ctx: Ctx, states: string[], x: number, y: number, color: string) {
    states.forEach((s, i) => {
      this.text(ctx, s === 'dead' ? '×' : s === 'me' ? '●' : '▴', x + i * 12, y, 11, s === 'dead' ? C.faint : color, 'left');
    });
  }

  private toast(ctx: Ctx, text: string, W: number, y: number, color: string, Lyt?: HudLayout) {
    ctx.font = '12px "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    const maxW = Lyt ? Lyt.availW - 8 : 620;
    const str = ellipsize(ctx, text, maxW - 48);
    const tw = Math.min(maxW, ctx.measureText(str).width + 48);
    this.panel(ctx, W / 2 - tw / 2, y, tw, 30, true);
    this.text(ctx, str, W / 2, y + 15, 12, color, 'center', false);
  }

  // ── Touch controls ───────────────────────────────────────────────────────

  private drawTouchControls(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    // Geometry comes from computeTouchControls so hit boxes are provably
    // disjoint, ≥44px and clear of the HP/ammo panels (see csHudLayout tests).
    const tc = computeTouchControls(Lyt, { hasBuy: !!e.hud.money });

    // Look bands (right-middle) — lowest priority regions, registered first.
    for (const band of tc.look) this.regions.push({ ...band, id: 'look' });

    // Joystick (left, docked above the health panel)
    const j = tc.joystick;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(j.cx, j.cy, j.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(j.cx + e.touchMove.x * (j.r - 28), j.cy + e.touchMove.y * (j.r - 28), 20, 0, Math.PI * 2); ctx.fill();
    this.regions.push({
      ...j.hit,
      down: (x, y) => this.joyUpdate(j.cx, j.cy, j.r, x, y),
      drag: (x, y) => this.joyUpdate(j.cx, j.cy, j.r, x, y),
      up: () => e.setTouchMove(0, 0),
    });

    const btn = (spec: TouchButton, label: string, down: () => void, up?: () => void) => {
      ctx.fillStyle = 'rgba(20,30,40,0.6)';
      ctx.beginPath(); ctx.arc(spec.cx, spec.cy, spec.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(spec.cx, spec.cy, spec.r, 0, Math.PI * 2); ctx.stroke();
      this.text(ctx, label, spec.cx, spec.cy, 11, C.text, 'center');
      this.regions.push({ ...buttonHit(spec), down, up });
    };
    const actions: Record<TouchButtonId, { label: string; down: () => void; up?: () => void }> = {
      fire: { label: this.L('开火', 'FIRE'), down: () => e.touchFireStart(), up: () => e.touchFireEnd() },
      jump: { label: this.L('跳', 'JMP'), down: () => e.keys.add('Space'), up: () => e.keys.delete('Space') },
      reload: { label: this.L('换弹', 'RLD'), down: () => e.reload() },
      use: { label: this.L('拾取', 'USE'), down: () => e.touchUse(), up: () => e.touchUseEnd() },
      switch: { label: this.L('切枪', 'SWP'), down: () => e.touchSwitch() },
      pause: { label: 'Ⅱ', down: () => e.pauseGame() },
      buy: { label: this.L('购买', 'BUY'), down: () => e.toggleBuy() },
    };
    for (const spec of tc.buttons) {
      const a = actions[spec.id];
      btn(spec, a.label, a.down, a.up);
    }
  }

  private joyUpdate(jx: number, jy: number, jr: number, x: number, y: number) {
    const dx = x - jx, dy = y - jy, len = Math.hypot(dx, dy), s = len > jr ? jr / len : 1;
    this.engine.setTouchMove(dx * s / jr, dy * s / jr);
  }

  // ── Overlays ─────────────────────────────────────────────────────────────

  private drawBuyMenu(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine, view = e.shopView();
    const { W, H } = Lyt;
    const w = Math.min(720, Lyt.availW), h = Math.min(520, Lyt.availH);
    const x = W / 2 - w / 2, y = Math.max(Lyt.top, H / 2 - h / 2);
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, this.L('购买装备', 'EQUIPMENT'), x + 24, y + 28, 12, C.amber);
    this.text(ctx, ellipsize(ctx, view.money, w - 220), x + 24, y + 58, 26, C.text);
    this.text(ctx, ellipsize(ctx, view.timeText, w - 60), x + 24, y + 86, 11, C.dim, 'left', false);
    this.button(ctx, x + w - 150, y + 18, 128, e.touchMode ? TOUCH_TARGET : 34, this.L('关闭 · B / ESC', 'Close · B / ESC'), () => e.closeBuy(), { small: true });

    // Category tabs (wrap to a second row on narrow panels)
    const tabH = e.touchMode ? TOUCH_TARGET : 32;
    let tx = x + 24;
    let ty = y + 108;
    for (const cat of view.categories) {
      const name = this.L(cat.name, cat.nameEn);
      const bw = ctx.measureText(name).width + 30;
      if (tx + bw > x + w - 24) { tx = x + 24; ty += tabH + 8; }
      this.button(ctx, tx, ty, bw, tabH, name, () => e.setBuyCategory(cat.id), { selected: cat.active, small: true });
      tx += bw + 8;
    }

    // Items grid — 2 columns on wide panels, 1 on narrow; scrolls internally.
    const cols = w >= 520 ? 2 : 1;
    const rowH = 64;
    const gy = ty + tabH + 12;
    const viewY = gy - 4, viewH = y + h - 48 - viewY;
    const iw = (w - 48 - (cols - 1) * 16) / cols;
    const rows = Math.ceil(view.items.length / cols);
    const contentH = rows * rowH;

    this.beginScroll(ctx, x + 8, viewY, w - 16, viewH, this.buyScroll);
    view.items.forEach((item, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ix = x + 24 + col * (iw + 16), iy = gy + row * rowH;
      ctx.fillStyle = item.disabled ? 'rgba(20,28,36,0.55)' : 'rgba(28,40,52,0.85)';
      ctx.fillRect(ix, iy, iw, 56);
      ctx.strokeStyle = C.border;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, 55);
      this.text(ctx, ellipsize(ctx, item.label, iw - 90), ix + 14, iy + 18, 13, item.disabled ? C.faint : C.text);
      this.text(ctx, ellipsize(ctx, item.detail, iw - 28), ix + 14, iy + 38, 10, C.dim, 'left', false);
      this.text(ctx, item.priceText, ix + iw - 14, iy + 28, 13, item.priceText === this.L('已装备', 'Owned') ? C.green : C.gold, 'right');
      this.push({ x: ix, y: iy, w: iw, h: 56, disabled: item.disabled, down: () => e.buy(item.id) });
    });
    this.endScroll(ctx);
    this.buyScroll.setMax(contentH - viewH);
    this.drawScrollbar(ctx, this.buyScroll, x + w - 15, viewY, viewH, contentH);

    this.text(ctx, ellipsize(ctx, this.L('购买时对局继续进行 · 离开购买区或购买时间结束后无法购买', 'The round keeps running · leaving the buy zone or buy time blocks purchases'), w - 32),
      x + w / 2, y + h - 24, 10, C.faint, 'center', false);
  }

  private drawScoreboard(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W, H } = Lyt;
    const map = (MAPS as Record<string, any>)[e.selectedMap];
    const { x, y, w, h } = scoreboardRect(Lyt, e.all.length);
    const rows = [...e.all].sort((a, b) => b.kills - a.kills);
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, ellipsize(ctx, (this.L(map.name, MAP_EN[e.selectedMap]?.name || map.name)) + ' · ' + e.modeName() + ' · 5 VS 5', w - 48), x + 24, y + 26, 11, C.amber);
    this.text(ctx, this.L('比赛记分板', 'Match Scoreboard'), x + 24, y + 52, 18, C.text);
    // Rows are clipped to the panel on short screens (hold-Tab overlay).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 66, w - 4, h - 96);
    ctx.clip();
    let ry = y + 84;
    for (const team of ['ct', 't'] as const) {
      this.text(ctx, e.teamName(team) + '　' + e.scores[team], x + 24, ry, 13, team === 'ct' ? C.blue : C.amber);
      this.text(ctx, this.L('击杀　阵亡　状态', 'K　D　Status'), x + w - 220, ry, 10, C.faint, 'left', false);
      ry += 24;
      for (const a of rows.filter(v => v.team === team)) {
        const dead = !a.alive;
        this.text(ctx, ellipsize(ctx, a.name + (a.isPlayer ? this.L(' · 你', ' · you') : ''), w - 260), x + 32, ry, 12, dead ? C.faint : C.text, 'left', false);
        this.text(ctx, String(a.kills), x + w - 210, ry, 12, dead ? C.faint : C.text);
        this.text(ctx, String(a.deaths), x + w - 150, ry, 12, dead ? C.faint : C.text);
        this.text(ctx, a.alive ? this.L('存活', 'alive') : this.L('阵亡', 'dead'), x + w - 90, ry, 12, dead ? C.faint : C.green, 'left', false);
        ry += 26;
      }
      ry += 8;
    }
    ctx.restore();
    this.text(ctx, this.L('按住 Tab 查看', 'Hold Tab to view'), x + w / 2, y + h - 20, 10, C.faint, 'center', false);
  }

  private drawTacticalMap(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W, H } = Lyt;
    const size = Math.max(160, Math.min(560, Lyt.availW - 40, Lyt.availH - 110));
    const x = W / 2 - size / 2, y = Math.max(Lyt.top + 56, H / 2 - size / 2 - 20);
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x - 20, y - 56, size + 40, size + 110);
    this.text(ctx, this.L('战术地图', 'TACTICAL MAP'), x, y - 30, 12, C.amber);
    this.text(ctx, ellipsize(ctx, this.L((MAPS as Record<string, any>)[e.selectedMap].name, MAP_EN[e.selectedMap]?.name || ''), size - 160), x + 130, y - 30, 14, C.text);
    this.button(ctx, x + size - 120, y - 44, 120, e.touchMode ? TOUCH_TARGET : 32, this.L('关闭 · M / ESC', 'Close · M / ESC'), () => e.closeMap(), { small: true });
    e.drawRadarContent(ctx, x, y, size);
    ctx.strokeStyle = C.border;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    this.text(ctx, ellipsize(ctx, this.L('白色：自己 · 蓝色：队友 · 橙色：已发现的敌人', 'White: you · Blue: teammates · Orange: spotted enemies'), size + 20),
      x + size / 2, y + size + 24, 11, C.dim, 'center', false);
    this.text(ctx, this.L('查看地图时对局继续进行', 'The round keeps running'),
      x + size / 2, y + size + 44, 10, C.faint, 'center', false);
  }

  private drawPause(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W, H } = Lyt;
    const w = Math.min(420, Lyt.availW);
    const entries: { label: string; action: () => void; primary?: boolean }[] = [
      { label: this.L('继续对局 ↗', 'Resume ↗'), action: () => e.resumeGame(), primary: true },
      { label: this.L('设置', 'Settings'), action: () => e.openSettings() },
      { label: this.L('重新开始', 'Restart match'), action: () => e.startMatch() },
    ];
    entries.push({ label: this.L('返回主菜单', 'Back to menu'), action: () => e.toMenu() });

    const touch = e.touchMode;
    const bh = touch ? TOUCH_TARGET : Lyt.short ? 36 : 38;
    const gap = touch && Lyt.short ? 6 : Lyt.short ? 8 : 10;
    const headerH = touch && Lyt.short ? 76 : 92;
    const h = Math.min((touch && Lyt.short ? 76 : 100) + entries.length * (bh + gap) + 14, Lyt.availH);
    const x = W / 2 - w / 2, y = Math.max(Lyt.top, H / 2 - h / 2);
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'MATCH PAUSED', x + 28, y + 26, 11, C.amber);
    this.text(ctx, this.L('稍作休息。', 'Take a breath.'), x + 28, y + 52, 20, C.text);
    if (headerH > 80) this.text(ctx, ellipsize(ctx, this.L('对局已暂停，准备好后继续。', 'The match is paused. Resume when ready.'), w - 56), x + 28, y + 76, 11, C.dim, 'left', false);
    let by = y + headerH;
    for (const entry of entries) {
      this.button(ctx, x + 28, by, w - 56, bh, entry.label, entry.action, { primary: entry.primary });
      by += bh + gap;
    }
  }

  private drawSettings(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine;
    const { W, H } = Lyt;
    const w = Math.min(520, Lyt.availW), h = Math.min(380, Lyt.availH);
    const x = W / 2 - w / 2, y = Math.max(Lyt.top, H / 2 - h / 2);
    // Vertical compression factor for short screens (1 = original spacing).
    const k = Math.min(1, (h - 66) / 314);
    const Y = (v: number) => y + 26 + (v - 26) * k;
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'SETTINGS', x + 28, Y(30), 11, C.amber);
    this.text(ctx, this.L('设置', 'Settings'), x + 28, Y(56), 20, C.text);
    const setBtnH = e.touchMode ? TOUCH_TARGET : 32;
    this.button(ctx, x + w - 140, y + 16, 116, setBtnH, this.L('关闭 · ESC', 'Close · ESC'), () => e.closeSettings(), { small: true });

    const slider = (label: string, value: number, min: number, max: number, yPos: number, fmt: (v: number) => string, apply: (v: number) => void) => {
      this.text(ctx, label, x + 28, yPos, 12, C.text, 'left', false);
      this.text(ctx, fmt(value), x + w - 28, yPos, 12, C.amber, 'right');
      const sy = yPos + 26 * k, sw = w - 56;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 28, sy, sw, 6);
      const t = (value - min) / (max - min);
      ctx.fillStyle = C.amber;
      ctx.fillRect(x + 28, sy, sw * t, 6);
      ctx.fillStyle = C.text;
      ctx.fillRect(x + 28 + sw * t - 4, sy - 6, 8, 18);
      this.push({
        x: x + 28, y: sy - 10, w: sw, h: e.touchMode ? TOUCH_TARGET : Math.max(26, TOUCH_TARGET - 14),
        down: (px) => apply(min + Math.max(0, Math.min(1, (px - x - 28) / sw)) * (max - min)),
        drag: (px) => apply(min + Math.max(0, Math.min(1, (px - x - 28) / sw)) * (max - min)),
      });
    };
    slider(this.L('鼠标灵敏度', 'Mouse sensitivity'), e.controlSettings.sensitivity, .1, 4, Y(96), v => v.toFixed(2), v => e.setSensitivity(v));
    if (k > 0.6) this.text(ctx, this.L('控制未开镜时的转向速度。', 'Turn speed while unscoped.'), x + 28, Y(152), 10, C.faint, 'left', false);
    slider(this.L('开镜灵敏度倍率', 'Scoped sensitivity multiplier'), e.controlSettings.scopeSensitivity, .1, 2, Y(178), v => v.toFixed(2) + ' ×', v => e.setScopeSensitivity(v));
    if (k > 0.6) this.text(ctx, this.L('基于鼠标灵敏度与开镜视野调整。', 'Scaled from base sensitivity and scoped FOV.'), x + 28, Y(234), 10, C.faint, 'left', false);

    // Quality + sound rows; stacked on narrow panels.
    if (w >= 480) {
      this.text(ctx, this.L('画质', 'Quality'), x + 28, Y(266), 12, C.text, 'left', false);
      this.button(ctx, x + 120, Y(266) - setBtnH / 2, 90, setBtnH, this.L('高', 'High'), () => e.setQuality('high'), { selected: e.quality === 'high', small: true });
      this.button(ctx, x + 218, Y(266) - setBtnH / 2, 90, setBtnH, this.L('流畅', 'Low'), () => e.setQuality('low'), { selected: e.quality === 'low', small: true });
      this.text(ctx, this.L('音效', 'Sound'), x + 330, Y(266), 12, C.text, 'left', false);
      this.button(ctx, x + 392, Y(266) - setBtnH / 2, 96, setBtnH, e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off'), () => e.toggleSound(), { selected: e.audio.enabled, small: true });
    } else {
      this.text(ctx, this.L('画质', 'Quality'), x + 28, Y(258), 12, C.text, 'left', false);
      this.button(ctx, x + 100, Y(258) - setBtnH / 2 - 1, (w - 128 - 8) / 2, setBtnH, this.L('高', 'High'), () => e.setQuality('high'), { selected: e.quality === 'high', small: true });
      this.button(ctx, x + 100 + (w - 128 - 8) / 2 + 8, Y(258) - setBtnH / 2 - 1, (w - 128 - 8) / 2, setBtnH, this.L('流畅', 'Low'), () => e.setQuality('low'), { selected: e.quality === 'low', small: true });
      this.text(ctx, this.L('音效', 'Sound'), x + 28, Y(300), 12, C.text, 'left', false);
      this.button(ctx, x + 100, Y(300) - setBtnH / 2 - 1, w - 128, setBtnH, e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off'), () => e.toggleSound(), { selected: e.audio.enabled, small: true });
    }

    if (k > 0.6) this.text(ctx, this.L('灵敏度自动保存在此浏览器', 'Sensitivity persists in this browser'), x + 28, Y(312), 10, C.faint, 'left', false);
    if (e.settingsNote) this.text(ctx, e.settingsNote, x + 28, Y(332), 10, C.green, 'left', false);
    this.button(ctx, x + w - 200, y + h - setBtnH - 8, 176, setBtnH, this.L('恢复默认灵敏度', 'Reset sensitivity'), () => e.resetSettings(), { small: true });
  }

  private drawMatchEnd(ctx: Ctx, Lyt: HudLayout) {
    const e = this.engine, end = e.hud.matchEnd!;
    const { W, H } = Lyt;
    const backH = e.touchMode ? TOUCH_TARGET : 36;
    const w = Math.min(460, Lyt.availW), h = Math.min(308 + (backH - 36), Lyt.availH);
    const x = W / 2 - w / 2, y = Math.max(Lyt.top, H / 2 - h / 2);
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'MATCH COMPLETE', x + 28, y + 30, 11, C.amber);
    this.text(ctx, ellipsize(ctx, end.title, w - 56), x + 28, y + 60, 22, end.won ? C.gold : C.text);
    this.text(ctx, end.score, x + 28, y + 106, 40, C.text);
    this.text(ctx, ellipsize(ctx, end.stats, w - 56), x + 28, y + 142, 12, C.dim, 'left', false);
    this.button(ctx, x + 28, y + 174, w - 56, TOUCH_TARGET, this.L('再来一局 ↗', 'Play again ↗'), () => e.startMatch(), { primary: true });
    this.button(ctx, x + 28, y + 174 + TOUCH_TARGET + 10, w - 56, backH, this.L('返回主菜单', 'Back to menu'), () => e.toMenu());
    this.text(ctx, this.L('Enter 再来一局', 'Enter to play again'), x + 28, y + h - 18, 10, C.faint, 'left', false);
  }

  private dimScreen(ctx: Ctx, W: number, H: number) {
    ctx.fillStyle = 'rgba(4, 8, 12, 0.62)';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Entry point ──────────────────────────────────────────────────────────

  draw(ctx: Ctx, W: number, H: number, presentationPaused = false) {
    const e = this.engine;
    const Lyt = computeHudLayout(W, H, this.safeArea);
    this.regions = [];
    ctx.save();
    if (e.phase === 'menu') {
      this.drawMenu(ctx, Lyt);
    } else {
      this.menuScroll.setMax(0);
      this.drawMatchHud(ctx, Lyt);
      if (e.hud.scoreboardOpen) this.drawScoreboard(ctx, Lyt);
      if (e.buyOpen) this.drawBuyMenu(ctx, Lyt);
      else this.buyScroll.setMax(0);
      if (e.mapOpen) this.drawTacticalMap(ctx, Lyt);
      if (e.phase === 'paused' && !presentationPaused) this.drawPause(ctx, Lyt);
      if (e.hud.matchEnd) this.drawMatchEnd(ctx, Lyt);
    }
    if (e.settingsOpen) this.drawSettings(ctx, Lyt);
    ctx.restore();
  }
}
