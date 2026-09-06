// csHud.ts — canvas HUD, menu and overlay rendering for the migrated CS engine.
//
// The standalone carrick-cs app drove a DOM HUD; in the shell everything is
// drawn onto the game's 2D canvas. This module renders menu screens, the
// in-match HUD and all overlay panels (buy / scoreboard / tactical map /
// pause / settings / match end / touch controls) from the engine's `hud`
// view-model, and registers immediate-mode hit regions that cs.ts routes
// mouse/touch input through.

import type { CsEngine } from './csEngine.js';
import { MAPS } from './csMaps.js';

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

  constructor(private readonly engine: CsEngine) {}

  private L(zh: string, en: string): string {
    return this.engine.isZh() ? zh : en;
  }

  hitTest(x: number, y: number): HudRegion | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (r.disabled) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ── Small drawing helpers ────────────────────────────────────────────────

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
    this.text(ctx, label, x + w / 2, y + h / 2, opts.small ? 11 : 13, opts.disabled ? C.faint : opts.primary ? '#1a1206' : opts.selected ? C.amber : C.text, 'center');
    this.regions.push({ x, y, w, h, disabled: opts.disabled, down: () => action() });
  }

  // ── Menu ─────────────────────────────────────────────────────────────────

  private drawMenu(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    const map = (MAPS as Record<string, any>)[e.selectedMap];
    const en = MAP_EN[e.selectedMap] || MAP_EN.fy_snow;
    const mapName = this.L(map.name, en.name);
    const left = 64;
    let y = 74;

    // Brand + status line
    this.text(ctx, '✣ CS', left, y, 40, C.amber);
    this.text(ctx, this.L('浏览器战术射击', 'BROWSER TACTICAL FPS'), left + 108, y + 4, 12, C.dim);
    this.text(ctx, `${e.hud.fps} FPS · 5 VS 5 · ${this.L('机器人对战', 'BOT MATCH')}`, W - 64, 30, 11, C.faint, 'right', false);
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
      this.regions.push({ x: left + 24, y: cy, w: panelW - 48, h: 46, down: () => e.selectMap(card.id) });
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
    this.regions.push({ x: left + 24, y: py - 12, w: 220, h: 24, down: () => e.openSettings() });
    this.text(ctx, this.L('音效 ', 'Sound ') + (e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off')), left + panelW - 24, py, 12, C.blue, 'right');
    this.regions.push({ x: left + panelW - 124, y: py - 12, w: 100, h: 24, down: () => e.toggleSound() });

    // Map caption card (right side)
    const rx = 810, rw = W - rx - 64;
    this.panel(ctx, rx, 96, rw, 150, true);
    this.text(ctx, this.L('当前地图', 'CURRENT MAP'), rx + 20, 118, 10, C.faint);
    this.text(ctx, mapName, rx + 20, 142, 20, C.text);
    const tags = this.L(map.tags.join(' · '), en.tags.join(' · '));
    this.text(ctx, tags, rx + 20, 168, 11, C.amber, 'left', false);
    this.text(ctx, this.L(map.hint, en.hint), rx + 20, 196, 11, C.dim, 'left', false);
    this.text(ctx, this.L('地图：' + map.credit + ' · 社区致敬作品 · 非 Valve 官方游戏', 'Map: ' + map.credit + ' · community tribute · not a Valve title'), rx + 20, 226, 10, C.faint, 'left', false);

    // Controls footer
    this.text(ctx,
      this.L('W A S D 移动 · 鼠标 瞄准/射击 · R 换弹 · E 拾取/拆安 · G 丢枪 · Q 上一武器 · F 检视 · 4 手雷 · 空格 跳 · B 购买 · TAB 记分板 · M 地图',
        'WASD move · Mouse aim/fire · R reload · E use · G drop · Q last weapon · F inspect · 4 grenade · Space jump · B buy · TAB scoreboard · M map'),
      W / 2, H - 26, 11, C.faint, 'center', false);

    if (e.hud.menuError) this.toast(ctx, e.hud.menuError, W, 60, C.red);
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

  private drawMatchHud(ctx: Ctx, W: number, H: number) {
    const e = this.engine, hud = e.hud;
    const desert = e.world?.theme === 'desert';

    // Radar + location (top-left)
    e.drawRadarContent(ctx, 18, 18, 148);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(18 + 74, 18 + 74, 74, 0, Math.PI * 2);
    ctx.stroke();
    if (hud.location) this.text(ctx, hud.location, 92, 182, 11, C.dim, 'center');

    // Top-center score strip
    const sw = 300, sx = W / 2 - sw / 2;
    this.panel(ctx, sx, 14, sw, 46, true);
    this.text(ctx, String(hud.ctScore), sx + 34, 37, 20, C.blue);
    this.text(ctx, String(hud.tScore), sx + sw - 34, 37, 20, C.amber);
    this.text(ctx, hud.roundLabel, W / 2, 28, 10, C.dim, 'center', false);
    this.text(ctx, hud.timerText, W / 2, 46, 16, hud.timerUrgent ? C.red : C.text, 'center');
    // alive pips
    this.pips(ctx, hud.alivePips.ct, sx + 12, 62, C.blue);
    this.pips(ctx, hud.alivePips.t, sx + sw - 12 - hud.alivePips.t.length * 12, 62, C.amber);

    // Objective line (defusal)
    if (hud.objective) {
      const ow = 460;
      this.panel(ctx, W / 2 - ow / 2, 68, ow, 30, true);
      this.text(ctx, '◆ ' + hud.objective.text, W / 2, 83, 12, C.gold, 'center');
    }
    if (hud.objectiveAction) {
      const ow = 360, oy = 102;
      this.panel(ctx, W / 2 - ow / 2, oy, ow, 40, true);
      this.text(ctx, hud.objectiveAction.text, W / 2, oy + 13, 12, C.text, 'center');
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(W / 2 - ow / 2 + 16, oy + 26, ow - 32, 5);
      ctx.fillStyle = C.amber;
      ctx.fillRect(W / 2 - ow / 2 + 16, oy + 26, (ow - 32) * hud.objectiveAction.progress01, 5);
    }

    // Killfeed (top-right)
    let ky = 24;
    for (const k of hud.killfeed.slice(-5)) {
      const lineW = 300;
      const x = W - lineW - 18;
      ctx.fillStyle = 'rgba(10,17,24,0.55)';
      ctx.fillRect(x, ky - 11, lineW, 22);
      this.text(ctx, k.aName + (k.aMe ? this.L(' · 你', ' · you') : ''), x + 10, ky, 11, k.aTeam === 'ct' ? C.blue : C.amber);
      const aWidth = ctx.measureText(k.aName).width + 10;
      this.text(ctx, '⌈ ' + k.weapon + (k.head ? ' ⌖' : ''), x + aWidth + 26, ky, 10, C.dim, 'left', false);
      this.text(ctx, k.bName + (k.bTeam === e.player?.team && !k.aMe && k.bName === 'YOU' ? this.L(' · 你', ' · you') : ''), x + lineW - 10, ky, 11, k.bTeam === 'ct' ? C.blue : C.amber, 'right');
      ky += 26;
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
      this.text(ctx, hud.scopeLabel, cx, cy + r + 18, 11, C.dim, 'center', false);
    }
    if (hud.hitOpacity > 0) {
      ctx.globalAlpha = hud.hitOpacity;
      this.text(ctx, '×', W / 2, H / 2 - 26, 22, hud.hitHead ? C.gold : '#ffffff');
      ctx.globalAlpha = 1;
    }

    // Center message
    if (hud.center) {
      const cw = 560;
      this.panel(ctx, W / 2 - cw / 2, H * 0.26, cw, 96, true);
      this.text(ctx, hud.center.kicker, W / 2, H * 0.26 + 20, 11, C.amber, 'center');
      this.text(ctx, hud.center.title, W / 2, H * 0.26 + 48, 22, C.text, 'center');
      this.text(ctx, hud.center.detail, W / 2, H * 0.26 + 76, 11, C.dim, 'center', false);
    }

    // Pickup prompt
    if (hud.pickup) {
      const pw = 220, px = W / 2 - pw / 2, py = H - 210;
      this.panel(ctx, px, py, pw, 34, true);
      this.text(ctx, '[E] ' + hud.pickup.verb + ' · ' + hud.pickup.name, W / 2, py + 17, 12, C.text, 'center');
    }

    // Health / armor / money (bottom-left)
    this.panel(ctx, 18, H - 96, 230, 78, true);
    if (hud.money) this.text(ctx, hud.money, 30, H - 82, 11, C.gold, 'left', false);
    this.text(ctx, '✚ ' + hud.health, 30, H - 58, 18, hud.healthLow ? C.red : C.text);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(30, H - 42, 140, 6);
    ctx.fillStyle = hud.healthLow ? C.red : C.amber;
    ctx.fillRect(30, H - 42, 140 * hud.healthPct / 100, 6);
    this.text(ctx, this.L('护甲', 'ARMOR') + ' ' + hud.armor, 30, H - 26, 10, C.dim, 'left', false);
    this.text(ctx, hud.killCount + this.L(' 击杀', ' kills'), 236, H - 26, 10, C.dim, 'right', false);

    // Weapon panel (bottom-right)
    const wpW = 300, wx = W - wpW - 18, wy = H - 118;
    this.panel(ctx, wx, wy, wpW, 100, true);
    this.text(ctx, hud.weaponName, wx + 16, wy + 20, 14, C.text);
    this.text(ctx, hud.ammoText, wx + wpW - 60, wy + 30, 26, C.text, 'right');
    this.text(ctx, '/ ' + hud.reserveText, wx + wpW - 16, wy + 32, 13, C.dim, 'right', false);
    this.text(ctx, hud.reloadState, wx + 16, wy + 44, 10, C.dim, 'left', false);
    let slotX = wx + 16;
    for (const s of hud.slots) {
      const bw = 10 + ctx.measureText(s.label).width + 26;
      ctx.fillStyle = s.equipped ? 'rgba(244,166,74,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(slotX, wy + 58, bw, 26);
      ctx.strokeStyle = s.equipped ? C.amber : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(slotX + 0.5, wy + 58.5, bw - 1, 25);
      this.text(ctx, s.num + ' ' + s.label, slotX + bw / 2, wy + 71, 10, s.empty ? C.faint : s.equipped ? C.amber : C.dim, 'center', false);
      slotX += bw + 6;
      if (slotX > wx + wpW - 30) break;
    }

    // Hints footer
    this.text(ctx,
      this.L('TAB 记分板 · M 地图 · ESC 暂停 · G 丢枪 · Q 上一武器 · 4 手雷 ×' + hud.grenadeCount + ' · 右键辅助攻击',
        'TAB scores · M map · ESC pause · G drop · Q last · 4 grenade ×' + hud.grenadeCount + ' · right-click secondary'),
      W / 2, H - 14, 10, C.faint, 'center', false);

    // Damage vignette
    if (hud.damageOpacity > 0) {
      ctx.globalAlpha = Math.min(1, hud.damageOpacity);
      ctx.strokeStyle = '#c33327';
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Notice toast
    if (hud.notice) this.toast(ctx, hud.notice.text, W, 210, C.text);

    // Radio panel
    if (hud.radio) {
      const rw = 260, rx = 18, ry = 220;
      this.panel(ctx, rx, ry, rw, 36 + hud.radio.options.length * 24 + 24);
      this.text(ctx, hud.radio.title, rx + 14, ry + 20, 12, C.amber);
      hud.radio.options.forEach((opt, i) => {
        this.text(ctx, (i + 1) + '  ' + opt, rx + 14, ry + 44 + i * 24, 12, C.text, 'left', false);
      });
      this.text(ctx, '0  ' + this.L('取消', 'Cancel'), rx + 14, ry + 44 + hud.radio.options.length * 24, 10, C.faint, 'left', false);
    }

    if (e.touchMode) this.drawTouchControls(ctx, W, H);
  }

  private pips(ctx: Ctx, states: string[], x: number, y: number, color: string) {
    states.forEach((s, i) => {
      this.text(ctx, s === 'dead' ? '×' : s === 'me' ? '●' : '▴', x + i * 12, y, 11, s === 'dead' ? C.faint : color, 'left');
    });
  }

  private toast(ctx: Ctx, text: string, W: number, y: number, color: string) {
    ctx.font = '12px "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    const tw = Math.min(620, ctx.measureText(text).width + 48);
    this.panel(ctx, W / 2 - tw / 2, y, tw, 30, true);
    this.text(ctx, text, W / 2, y + 15, 12, color, 'center', false);
  }

  // ── Touch controls ───────────────────────────────────────────────────────

  private drawTouchControls(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    // Look zone (right half) — lowest priority region, registered first.
    this.regions.push({
      x: W * 0.45, y: 100, w: W * 0.55, h: H - 260,
      id: 'look',
    });

    // Joystick (left-bottom)
    const jx = 130, jy = H - 190, jr = 62;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(jx, jy, jr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(jx + e.touchMove.x * 30, jy + e.touchMove.y * 30, 22, 0, Math.PI * 2); ctx.fill();
    this.regions.push({
      x: jx - jr - 20, y: jy - jr - 20, w: (jr + 20) * 2, h: (jr + 20) * 2,
      down: (x, y) => this.joyUpdate(jx, jy, jr, x, y),
      drag: (x, y) => this.joyUpdate(jx, jy, jr, x, y),
      up: () => e.setTouchMove(0, 0),
    });

    const btn = (label: string, x: number, y: number, r: number, down: () => void, up?: () => void) => {
      ctx.fillStyle = 'rgba(20,30,40,0.6)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      this.text(ctx, label, x, y, 11, C.text, 'center');
      this.regions.push({ x: x - r, y: y - r, w: r * 2, h: r * 2, down, up });
    };
    btn(this.L('开火', 'FIRE'), W - 100, H - 190, 44, () => e.touchFireStart(), () => e.touchFireEnd());
    btn(this.L('跳', 'JMP'), W - 190, H - 120, 28, () => e.keys.add('Space'), () => e.keys.delete('Space'));
    btn(this.L('换弹', 'RLD'), W - 120, H - 88, 26, () => e.reload());
    btn(this.L('拾取', 'USE'), W - 220, H - 200, 26, () => e.touchUse(), () => e.touchUseEnd());
    btn(this.L('切枪', 'SWP'), W - 60, H - 110, 26, () => e.touchSwitch());
    btn('Ⅱ', W - 46, 70, 22, () => e.pauseGame());
    if (e.hud.money) btn(this.L('购买', 'BUY'), W - 110, 70, 22, () => e.toggleBuy());
  }

  private joyUpdate(jx: number, jy: number, jr: number, x: number, y: number) {
    const dx = x - jx, dy = y - jy, len = Math.hypot(dx, dy), s = len > jr ? jr / len : 1;
    this.engine.setTouchMove(dx * s / jr, dy * s / jr);
  }

  // ── Overlays ─────────────────────────────────────────────────────────────

  private drawBuyMenu(ctx: Ctx, W: number, H: number) {
    const e = this.engine, view = e.shopView();
    const w = 720, h = 520, x = W / 2 - w / 2, y = H / 2 - h / 2;
    this.panel(ctx, x, y, w, h);
    this.text(ctx, this.L('购买装备', 'EQUIPMENT'), x + 24, y + 28, 12, C.amber);
    this.text(ctx, view.money, x + 24, y + 58, 26, C.text);
    this.text(ctx, view.timeText, x + 24, y + 86, 11, C.dim, 'left', false);
    this.button(ctx, x + w - 150, y + 18, 128, 30, this.L('关闭 · B / ESC', 'Close · B / ESC'), () => e.closeBuy(), { small: true });

    // Category tabs
    let tx = x + 24;
    const ty = y + 108;
    for (const cat of view.categories) {
      const name = this.L(cat.name, cat.nameEn);
      const bw = ctx.measureText(name).width + 30;
      this.button(ctx, tx, ty, bw, 30, name, () => e.setBuyCategory(cat.id), { selected: cat.active, small: true });
      tx += bw + 8;
    }

    // Items grid (2 columns)
    const gy = ty + 48;
    view.items.forEach((item, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const iw = (w - 64) / 2, ix = x + 24 + col * (iw + 16), iy = gy + row * 64;
      if (iy + 56 > y + h - 50) return;
      ctx.fillStyle = item.disabled ? 'rgba(20,28,36,0.55)' : 'rgba(28,40,52,0.85)';
      ctx.fillRect(ix, iy, iw, 56);
      ctx.strokeStyle = C.border;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, 55);
      this.text(ctx, item.label, ix + 14, iy + 18, 13, item.disabled ? C.faint : C.text);
      this.text(ctx, item.detail, ix + 14, iy + 38, 10, C.dim, 'left', false);
      this.text(ctx, item.priceText, ix + iw - 14, iy + 28, 13, item.priceText === this.L('已装备', 'Owned') ? C.green : C.gold, 'right');
      this.regions.push({ x: ix, y: iy, w: iw, h: 56, disabled: item.disabled, down: () => e.buy(item.id) });
    });

    this.text(ctx, this.L('购买时对局继续进行 · 离开购买区或购买时间结束后无法购买', 'The round keeps running · leaving the buy zone or buy time blocks purchases'),
      x + w / 2, y + h - 24, 10, C.faint, 'center', false);
  }

  private drawScoreboard(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    const map = (MAPS as Record<string, any>)[e.selectedMap];
    const w = 620, x = W / 2 - w / 2;
    const rows = [...e.all].sort((a, b) => b.kills - a.kills);
    const h = 120 + e.all.length * 26 + 60, y = H / 2 - h / 2;
    this.panel(ctx, x, y, w, h);
    this.text(ctx, (this.L(map.name, MAP_EN[e.selectedMap]?.name || map.name)) + ' · ' + e.modeName() + ' · 5 VS 5', x + 24, y + 26, 11, C.amber);
    this.text(ctx, this.L('比赛记分板', 'Match Scoreboard'), x + 24, y + 52, 18, C.text);
    let ry = y + 84;
    for (const team of ['ct', 't'] as const) {
      this.text(ctx, e.teamName(team) + '　' + e.scores[team], x + 24, ry, 13, team === 'ct' ? C.blue : C.amber);
      this.text(ctx, this.L('击杀　阵亡　状态', 'K　D　Status'), x + w - 220, ry, 10, C.faint, 'left', false);
      ry += 24;
      for (const a of rows.filter(v => v.team === team)) {
        const dead = !a.alive;
        this.text(ctx, a.name + (a.isPlayer ? this.L(' · 你', ' · you') : ''), x + 32, ry, 12, dead ? C.faint : C.text, 'left', false);
        this.text(ctx, String(a.kills), x + w - 210, ry, 12, dead ? C.faint : C.text);
        this.text(ctx, String(a.deaths), x + w - 150, ry, 12, dead ? C.faint : C.text);
        this.text(ctx, a.alive ? this.L('存活', 'alive') : this.L('阵亡', 'dead'), x + w - 90, ry, 12, dead ? C.faint : C.green, 'left', false);
        ry += 26;
      }
      ry += 8;
    }
    this.text(ctx, this.L('按住 Tab 查看', 'Hold Tab to view'), x + w / 2, y + h - 20, 10, C.faint, 'center', false);
  }

  private drawTacticalMap(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    const size = 560, x = W / 2 - size / 2, y = H / 2 - size / 2 - 20;
    this.panel(ctx, x - 20, y - 56, size + 40, size + 110);
    this.text(ctx, this.L('战术地图', 'TACTICAL MAP'), x, y - 30, 12, C.amber);
    this.text(ctx, this.L((MAPS as Record<string, any>)[e.selectedMap].name, MAP_EN[e.selectedMap]?.name || ''), x + 130, y - 30, 14, C.text);
    this.button(ctx, x + size - 120, y - 44, 120, 28, this.L('关闭 · M / ESC', 'Close · M / ESC'), () => e.closeMap(), { small: true });
    e.drawRadarContent(ctx, x, y, size);
    ctx.strokeStyle = C.border;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    this.text(ctx, this.L('白色：自己 · 蓝色：队友 · 橙色：已发现的敌人', 'White: you · Blue: teammates · Orange: spotted enemies'),
      x + size / 2, y + size + 24, 11, C.dim, 'center', false);
    this.text(ctx, this.L('查看地图时对局继续进行', 'The round keeps running'),
      x + size / 2, y + size + 44, 10, C.faint, 'center', false);
  }

  private drawPause(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    const w = 420, h = 330, x = W / 2 - w / 2, y = H / 2 - h / 2;
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'MATCH PAUSED', x + 28, y + 30, 11, C.amber);
    this.text(ctx, this.L('稍作休息。', 'Take a breath.'), x + 28, y + 58, 20, C.text);
    this.text(ctx, this.L('对局已暂停，准备好后继续。', 'The match is paused. Resume when ready.'), x + 28, y + 84, 11, C.dim, 'left', false);
    let by = y + 110;
    this.button(ctx, x + 28, by, w - 56, 38, this.L('继续对局 ↗', 'Resume ↗'), () => e.resumeGame(), { primary: true });
    by += 48;
    this.button(ctx, x + 28, by, w - 56, 34, this.L('设置', 'Settings'), () => e.openSettings());
    by += 44;
    this.button(ctx, x + 28, by, w - 56, 34, this.L('重新开始', 'Restart match'), () => e.startMatch());
    by += 44;
    this.button(ctx, x + 28, by, w - 56, 34, this.L('返回主菜单', 'Back to menu'), () => e.toMenu());
  }

  private drawSettings(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    const w = 520, h = 380, x = W / 2 - w / 2, y = H / 2 - h / 2;
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'SETTINGS', x + 28, y + 30, 11, C.amber);
    this.text(ctx, this.L('设置', 'Settings'), x + 28, y + 56, 20, C.text);
    this.button(ctx, x + w - 140, y + 20, 116, 30, this.L('关闭 · ESC', 'Close · ESC'), () => e.closeSettings(), { small: true });

    const slider = (label: string, value: number, min: number, max: number, yPos: number, fmt: (v: number) => string, apply: (v: number) => void) => {
      this.text(ctx, label, x + 28, yPos, 12, C.text, 'left', false);
      this.text(ctx, fmt(value), x + w - 28, yPos, 12, C.amber, 'right');
      const sy = yPos + 26, sw = w - 56;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 28, sy, sw, 6);
      const t = (value - min) / (max - min);
      ctx.fillStyle = C.amber;
      ctx.fillRect(x + 28, sy, sw * t, 6);
      ctx.fillStyle = C.text;
      ctx.fillRect(x + 28 + sw * t - 4, sy - 6, 8, 18);
      this.regions.push({
        x: x + 28, y: sy - 10, w: sw, h: 26,
        down: (px) => apply(min + Math.max(0, Math.min(1, (px - x - 28) / sw)) * (max - min)),
        drag: (px) => apply(min + Math.max(0, Math.min(1, (px - x - 28) / sw)) * (max - min)),
      });
    };
    slider(this.L('鼠标灵敏度', 'Mouse sensitivity'), e.controlSettings.sensitivity, .1, 4, y + 96, v => v.toFixed(2), v => e.setSensitivity(v));
    this.text(ctx, this.L('控制未开镜时的转向速度。', 'Turn speed while unscoped.'), x + 28, y + 152, 10, C.faint, 'left', false);
    slider(this.L('开镜灵敏度倍率', 'Scoped sensitivity multiplier'), e.controlSettings.scopeSensitivity, .1, 2, y + 178, v => v.toFixed(2) + ' ×', v => e.setScopeSensitivity(v));
    this.text(ctx, this.L('基于鼠标灵敏度与开镜视野调整。', 'Scaled from base sensitivity and scoped FOV.'), x + 28, y + 234, 10, C.faint, 'left', false);

    this.text(ctx, this.L('画质', 'Quality'), x + 28, y + 266, 12, C.text, 'left', false);
    this.button(ctx, x + 120, y + 252, 90, 30, this.L('高', 'High'), () => e.setQuality('high'), { selected: e.quality === 'high', small: true });
    this.button(ctx, x + 218, y + 252, 90, 30, this.L('流畅', 'Low'), () => e.setQuality('low'), { selected: e.quality === 'low', small: true });
    this.text(ctx, this.L('音效', 'Sound'), x + 330, y + 266, 12, C.text, 'left', false);
    this.button(ctx, x + 392, y + 252, 96, 30, e.audio.enabled ? this.L('开', 'On') : this.L('关', 'Off'), () => e.toggleSound(), { selected: e.audio.enabled, small: true });

    this.text(ctx, this.L('灵敏度自动保存在此浏览器', 'Sensitivity persists in this browser'), x + 28, y + 312, 10, C.faint, 'left', false);
    if (e.settingsNote) this.text(ctx, e.settingsNote, x + 28, y + 332, 10, C.green, 'left', false);
    this.button(ctx, x + w - 200, y + h - 44, 176, 30, this.L('恢复默认灵敏度', 'Reset sensitivity'), () => e.resetSettings(), { small: true });
  }

  private drawMatchEnd(ctx: Ctx, W: number, H: number) {
    const e = this.engine, end = e.hud.matchEnd!;
    const w = 460, h = 300, x = W / 2 - w / 2, y = H / 2 - h / 2;
    this.dimScreen(ctx, W, H);
    this.panel(ctx, x, y, w, h);
    this.text(ctx, 'MATCH COMPLETE', x + 28, y + 30, 11, C.amber);
    this.text(ctx, end.title, x + 28, y + 60, 22, end.won ? C.gold : C.text);
    this.text(ctx, end.score, x + 28, y + 106, 40, C.text);
    this.text(ctx, end.stats, x + 28, y + 142, 12, C.dim, 'left', false);
    this.button(ctx, x + 28, y + 178, w - 56, 40, this.L('再来一局 ↗', 'Play again ↗'), () => e.startMatch(), { primary: true });
    this.button(ctx, x + 28, y + 230, w - 56, 34, this.L('返回主菜单', 'Back to menu'), () => e.toMenu());
    this.text(ctx, this.L('Enter 再来一局', 'Enter to play again'), x + 28, y + 282, 10, C.faint, 'left', false);
  }

  private dimScreen(ctx: Ctx, W: number, H: number) {
    ctx.fillStyle = 'rgba(4, 8, 12, 0.62)';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Entry point ──────────────────────────────────────────────────────────

  draw(ctx: Ctx, W: number, H: number) {
    const e = this.engine;
    this.regions = [];
    ctx.save();
    if (e.phase === 'menu') {
      this.drawMenu(ctx, W, H);
    } else {
      this.drawMatchHud(ctx, W, H);
      if (e.hud.scoreboardOpen) this.drawScoreboard(ctx, W, H);
      if (e.buyOpen) this.drawBuyMenu(ctx, W, H);
      if (e.mapOpen) this.drawTacticalMap(ctx, W, H);
      if (e.phase === 'paused') this.drawPause(ctx, W, H);
      if (e.hud.matchEnd) this.drawMatchEnd(ctx, W, H);
    }
    if (e.settingsOpen) this.drawSettings(ctx, W, H);
    ctx.restore();
  }
}
