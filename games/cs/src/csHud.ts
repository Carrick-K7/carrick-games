// CS-owned canvas HUD. Menus use one safe-area-aware layout and one scroll
// viewport; fixed headers/actions never move with selectable content.
import type { CsEngine } from './csEngine.js';
import { MAPS } from './csMaps.js';
import { UI, uiButton, uiParagraph, uiRound, uiText } from './csHudUi.js';
import {
  buttonHit, computeHudLayout, computeTouchControls, healthPanelRect, HudScroll,
  normalizeSafeArea, overlayRect, radarRect, scoreboardColumns, scoreboardBodyLayout, scoreStripRect, matchFeedbackLayout,
  TOUCH_TARGET, weaponPanelRect, type HudLayout, type HudSafeArea, type HudRect,
  type TouchButtonId,
} from './csHudLayout.js';

export interface HudRegion {
  x: number; y: number; w: number; h: number;
  id?: string; disabled?: boolean;
  down?: (x: number, y: number) => void;
  up?: () => void;
  drag?: (x: number, y: number) => void;
  /** Defer choices until touch release, allowing a vertical swipe to scroll. */
  deferTap?: boolean;
  dragAxis?: 'x';
  scroll?: HudScroll;
}
type Ctx = CanvasRenderingContext2D;
export interface CsHudView {
  fps: string; menuError: string; menuStart: { enabled: boolean; label: string };
  notice: { text: string } | null;
  center: { kicker: string; title: string; detail: string } | null;
  health: number; armor: number; healthPct: number; healthLow: boolean;
  killCount: number; grenadeCount: number;
  weaponName: string; ammoText: string; reserveText: string; reloadState: string;
  slots: { key: string; num: number; equipped: boolean; label: string; empty: boolean }[];
  pickup: { name: string; verb: string } | null;
  crosshairHidden: boolean; crosshairGap: number;
  scope: boolean; scopeLabel: string; hitOpacity: number; hitHead: boolean;
  hitKind: 'body' | 'head' | 'kill'; hitConfirmation: string; damageOpacity: number;
  location: string; roundLabel: string; timerText: string; timerUrgent: boolean;
  ctScore: number; tScore: number; alivePips: { ct: string[]; t: string[] };
  objective: { text: string; plantVerb: boolean; defuseVerb: boolean } | null;
  objectiveAction: { text: string; progress01: number } | null;
  money: string | null; buyTimeText: string;
  matchEnd: { won: boolean; title: string; score: string; stats: string } | null;
  radio: { title: string; options: string[] } | null;
  killfeed: { aName: string; aTeam: string; aMe: boolean; bName: string; bTeam: string; weapon: string; head: boolean; time: number }[];
  scoreboardOpen: boolean; bombMarker: unknown;
}
const C = { text: UI.text, dim: UI.dim, faint: UI.muted, amber: UI.accent,
  border: UI.border, blue: '#8ac9ef', red: '#f08075', green: '#9bd7b0', gold: '#f4c77e' };
const MAP_EN: Record<string, { name: string; intro: string; hint: string }> = {
  fy_snow: { name: 'Snow Arena', intro: 'A compact snow arena with weapons to pick up on the ground.', hint: 'Flank along the side ramps to reach the rear AWP balcony.' },
  de_dust2: { name: 'Dust II', intro: 'Fight through long A, mid doors and B tunnels. Two bomb sites.', hint: 'Buy at your spawn, then attack or defend sites A and B.' },
};
type Choice = { id: string; label: string; selected: boolean; action: () => void; disabled?: boolean };

export class CsHud {
  regions: HudRegion[] = [];
  private safeArea: HudSafeArea = normalizeSafeArea(null);
  private readonly menuScroll = new HudScroll();
  private readonly settingsScroll = new HudScroll();
  private readonly buyScroll = new HudScroll();
  private readonly scoreboardScroll = new HudScroll();
  private readonly pauseScroll = new HudScroll();
  private readonly resultScroll = new HudScroll();
  private regionDy = 0;
  private regionClip: HudRect | null = null;
  private regionScroll: HudScroll | null = null;
  constructor(private readonly engine: CsEngine) {}
  private L(zh: string, en: string) { return this.engine.isZh() ? zh : en; }
  setSafeArea(safe?: Partial<HudSafeArea> | null) { this.safeArea = normalizeSafeArea(safe); }
  hitTest(x: number, y: number): HudRegion | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (!r.disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }
  private activeScroll(): HudScroll | null {
    const e = this.engine;
    if (e.settingsOpen) return this.settingsScroll;
    if (e.phase === 'menu') return this.menuScroll;
    if (e.hud.matchEnd) return this.resultScroll;
    if (e.phase === 'paused') return this.pauseScroll;
    if (e.mapOpen) return null;
    if (e.buyOpen) return this.buyScroll;
    if (e.hud.scoreboardOpen) return this.scoreboardScroll;
    return null;
  }
  wantsWheel() { return !!this.activeScroll() || this.engine.mapOpen; }
  onWheel(deltaY: number) { this.activeScroll()?.wheel(deltaY); }

  private push(r: HudRegion) {
    let region = this.regionDy ? { ...r, y: r.y + this.regionDy } : r;
    const c = this.regionClip;
    if (c) {
      const x = Math.max(region.x, c.x), y = Math.max(region.y, c.y);
      const right = Math.min(region.x + region.w, c.x + c.w), bottom = Math.min(region.y + region.h, c.y + c.h);
      if (right - x < 4 || bottom - y < 4) return;
      region = { ...region, x, y, w: right - x, h: bottom - y };
      if (region.down) { region.deferTap = true; if (this.regionScroll) region.scroll = this.regionScroll; }
    }
    this.regions.push(region);
  }
  private beginScroll(ctx: Ctx, x: number, y: number, w: number, h: number, scroll: HudScroll) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, Math.max(0, h)); ctx.clip();
    ctx.translate(0, -scroll.offset);
    this.regionDy = -scroll.offset; this.regionClip = { x, y, w, h }; this.regionScroll = scroll;
    this.regions.push({ x, y, w, h, scroll,
      down: (_x, py) => { scroll.beginDrag(); scroll.drag(py); },
      drag: (_x, py) => scroll.drag(py), up: () => scroll.endDrag() });
  }
  private endScroll(ctx: Ctx) { ctx.restore(); this.regionDy = 0; this.regionClip = null; this.regionScroll = null; }
  /** Visual indicator only: wheel/content drag owns scrolling, not a tiny target. */
  private scrollbar(ctx: Ctx, scroll: HudScroll, x: number, y: number, h: number) {
    if (!scroll.active || h <= 0) return;
    const thumb = Math.max(20, h * h / (h + scroll.max));
    uiRound(ctx, x, y, 3, h, '#263541', undefined, 2);
    uiRound(ctx, x, y + scroll.offset / scroll.max * (h - thumb), 3, thumb, '#8296a5', undefined, 2);
  }
  private text(ctx: Ctx, value: string, x: number, y: number, size = 14, color: string = C.text,
    align: CanvasTextAlign = 'left', bold = false, maxWidth?: number) {
    uiText(ctx, value, x, y, size, color, align, bold, maxWidth);
  }
  private panel(ctx: Ctx, x: number, y: number, w: number, h: number, soft = false) {
    uiRound(ctx, x, y, w, h, soft ? 'rgba(16,26,36,.88)' : UI.surface, C.border, soft ? 9 : 16);
  }
  private button(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, action: () => void,
    opts: { id: string; selected?: boolean; primary?: boolean; disabled?: boolean; small?: boolean }) {
    uiButton(ctx, x, y, w, h, label, opts);
    this.push({ id: opts.id, x, y, w, h, disabled: opts.disabled, down: () => action() });
  }
  private choices(ctx: Ctx, label: string, x: number, y: number, w: number, options: Choice[]) {
    this.text(ctx, label, x, y + 8, 13, C.dim);
    const gap = 6, bw = (w - gap * (options.length - 1)) / options.length;
    options.forEach((o, i) => this.button(ctx, x + i * (bw + gap), y + 24, bw, TOUCH_TARGET, o.label, o.action,
      { id: o.id, selected: o.selected, disabled: o.disabled, small: bw < 100 }));
    return 84;
  }
  private dimScreen(ctx: Ctx, W: number, H: number) {
    ctx.fillStyle = 'rgba(4,10,17,.68)'; ctx.fillRect(0, 0, W, H);
  }
  private frame(ctx: Ctx, L: HudLayout, w: number, h: number, title: string, close?: { id: string; run: () => void; label?: string }) {
    const r = overlayRect(L, w, h);
    this.regions = []; this.dimScreen(ctx, L.W, L.H); this.panel(ctx, r.x, r.y, r.w, r.h);
    this.text(ctx, title, r.x + 20, r.y + 30, 20, C.text, 'left', true, r.w - (close ? 132 : 40));
    if (close) this.button(ctx, r.x + r.w - 104, r.y + 8, 88, 44, close.label || this.L('关闭', 'Close'), close.run, { id: close.id });
    return r;
  }

  // One menu for every device. The action footer does not depend on how many
  // mode options exist, so Team DM cannot push Start below a short window.
  private drawMenu(ctx: Ctx, L: HudLayout) {
    const e = this.engine, map = (MAPS as any)[e.selectedMap], en = MAP_EN[e.selectedMap];
    const title = L.availW < 400 ? this.L('CS · 对局', 'CS · Match') : this.L('CS · 对局设置', 'CS · Match setup');
    const r = this.frame(ctx, L, 980, 638, title, { id: 'menu-settings', label: this.L('设置', 'Settings'), run: () => e.openSettings() });
    const pad = r.w < 400 ? 16 : 24;
    const body = { x: r.x + pad, y: r.y + 68, w: r.w - pad * 2 - 8, h: Math.max(1, r.h - 144) };
    const wide = body.w >= 720, gap = 32, colW = wide ? (body.w - gap) / 2 : body.w;
    const mapH = 228;
    const configH = 336 + (e.selectedMode === 'tdm' ? 84 : 0);
    const contentH = wide ? Math.max(mapH + 124, configH) + 12 : mapH + configH + 28;
    this.menuScroll.setMax(contentH - body.h);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.menuScroll);
    this.text(ctx, this.L('选择地图', 'Map'), body.x, body.y + 8, 13, C.dim);
    const cards = [
      { id: 'fy_snow', name: this.L('雪地竞技场', 'Snow Arena'), detail: this.L('雪地近距离交战 · 地面拾枪', 'Close-range rounds · ground pickups') },
      { id: 'de_dust2', name: this.L('炙热沙城Ⅱ', 'Dust II'), detail: this.L('经典沙城 · A / B 双包点', 'Classic Dust II · sites A and B') },
    ];
    cards.forEach((card, i) => {
      const y = body.y + 26 + i * 96, selected = e.selectedMap === card.id;
      uiRound(ctx, body.x, y, colW, 84, selected ? UI.selected : UI.raised, selected ? C.amber : C.border, 12, selected ? 1.5 : 1);
      this.text(ctx, card.name, body.x + 16, y + 24, 16, C.text, 'left', true, colW - 54);
      uiParagraph(ctx, card.detail, body.x + 16, y + 40, colW - 48, 13, C.dim, 2, 18);
      ctx.strokeStyle = selected ? C.amber : C.faint; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(body.x + colW - 22, y + 24, 7, 0, Math.PI * 2); ctx.stroke();
      if (selected) { ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(body.x + colW - 22, y + 24, 3.5, 0, Math.PI * 2); ctx.fill(); }
      this.push({ id: `menu-map-${card.id}`, x: body.x, y, w: colW, h: 84, disabled: e.bootLoading || e.mapLoading, down: () => e.selectMap(card.id) });
    });
    if (wide) {
      uiParagraph(ctx, this.L(map.intro, en.intro), body.x, body.y + mapH + 4, colW, 14, C.text, 2, 21);
      uiParagraph(ctx, this.L(map.hint, en.hint), body.x, body.y + mapH + 58, colW, 13, C.dim, 2, 19);
      this.text(ctx, this.L('5 对 5 · 本地人机', '5 vs 5 · local bot match'), body.x, body.y + mapH + 112, 12, C.faint);
    }
    const x = wide ? body.x + colW + gap : body.x;
    let y = wide ? body.y : body.y + mapH;
    const modes = [
      { id: 'elimination', label: this.L('回合歼灭', 'Elimination') },
      { id: 'defusal', label: this.L('经典爆破', 'Defusal') },
      { id: 'tdm', label: this.L('团队竞技', 'Team DM') },
    ].filter(m => map.modes.includes(m.id));
    y += this.choices(ctx, this.L('模式', 'Mode'), x, y, colW, modes.map(m => ({ ...m, id: `menu-mode-${m.id}`, selected: e.selectedMode === m.id, action: () => e.selectMode(m.id) })));
    if (e.selectedMode === 'tdm') y += this.choices(ctx, this.L('获胜击杀数', 'Kill limit'), x, y, colW,
      [30, 50, 100].map(n => ({ id: `menu-limit-${n}`, label: String(n), selected: e.selectedKillLimit === n, action: () => e.setKillLimit(n) })));
    y += this.choices(ctx, this.L('阵营', 'Team'), x, y, colW, [
      { id: 'menu-team-ct', label: this.L('CT · 反恐精英', 'CT · Counter'), selected: e.selectedTeam === 'ct', action: () => e.selectTeam('ct') },
      { id: 'menu-team-t', label: this.L('T · 恐怖分子', 'T · Terrorist'), selected: e.selectedTeam === 't', action: () => e.selectTeam('t') },
    ]);
    y += this.choices(ctx, this.L('机器人难度', 'Bot skill'), x, y, colW, [
      { id: 'easy', label: this.L('休闲', 'Casual') }, { id: 'normal', label: this.L('标准', 'Regular') }, { id: 'hard', label: this.L('硬核', 'Hardcore') },
    ].map(d => ({ ...d, id: `menu-skill-${d.id}`, selected: e.difficulty === d.id, action: () => e.setDifficulty(d.id) })));
    this.choices(ctx, this.L('初始手枪', 'Starting pistol'), x, y, colW, [
      { id: 'menu-pistol-default', label: this.L('阵营默认', 'Faction'), selected: e.selectedPistol === 'default', action: () => e.setPistol('default') },
      { id: 'menu-pistol-deagle', label: 'Desert Eagle', selected: e.selectedPistol === 'deagle', action: () => e.setPistol('deagle') },
    ]);
    this.endScroll(ctx); this.scrollbar(ctx, this.menuScroll, body.x + body.w + 8, body.y, body.h);
    const fy = r.y + r.h - 64;
    const label = e.bootLoading ? e.hud.menuStart.label : e.mapLoading ? this.L('正在装载地图…', 'Loading map…')
      : e.ready ? this.L('进入战场', 'Enter the Arena') : this.L('重试加载', 'Retry loading');
    const actionW = wide ? 252 : r.w - pad * 2;
    if (wide) {
      this.text(ctx, this.L(map.name, en.name), r.x + pad, fy + 12, 14, C.text, 'left', true, r.w - actionW - pad * 3);
      this.text(ctx, this.L('地图作者：', 'Map by ') + map.credit, r.x + pad, fy + 34, 12, C.dim, 'left', false, r.w - actionW - pad * 3);
    }
    this.button(ctx, r.x + r.w - pad - actionW, fy, actionW, 48, label, () => e.primaryAction(),
      { id: 'menu-start', primary: true, disabled: e.bootLoading || e.mapLoading });
    if (e.hud.menuError) this.text(ctx, e.hud.menuError, r.x + pad, r.y + 54, 12, C.red, 'left', false, r.w - pad * 2);
  }

  private drawSettings(ctx: Ctx, L: HudLayout) {
    const e = this.engine;
    const r = this.frame(ctx, L, 560, 638, this.L('设置', 'Settings'), { id: 'settings-close', run: () => e.closeSettings() });
    const pad = r.w < 400 ? 16 : 24, x = r.x + pad, w = r.w - pad * 2 - 8;
    const top = r.y + 68, h = Math.max(1, r.h - 144);
    this.settingsScroll.setMax(624 - h);
    this.beginScroll(ctx, x, top, w, h, this.settingsScroll);
    let y = top;
    const slider = (id: string, label: string, value: number, min: number, max: number, format: string, apply: (v: number) => void) => {
      this.text(ctx, label, x, y + 8, 14, C.text, 'left', false, w - 66);
      this.text(ctx, format, x + w, y + 8, 13, C.amber, 'right');
      const sx = x + 8, sw = w - 16, sy = y + 42, t = (value - min) / (max - min);
      uiRound(ctx, sx, sy - 2, sw, 4, C.border, undefined, 2);
      uiRound(ctx, sx, sy - 2, Math.max(1, sw * t), 4, C.amber, undefined, 2);
      ctx.fillStyle = C.text; ctx.beginPath(); ctx.arc(sx + sw * t, sy, 8, 0, Math.PI * 2); ctx.fill();
      const change = (px: number) => apply(min + Math.max(0, Math.min(1, (px - sx) / sw)) * (max - min));
      this.push({ id, x, y: sy - 22, w, h: 44, dragAxis: 'x', down: change, drag: change }); y += 84;
    };
    slider('settings-sensitivity', this.L('鼠标灵敏度', 'Mouse sensitivity'), e.controlSettings.sensitivity, .1, 4, e.controlSettings.sensitivity.toFixed(2), v => e.setSensitivity(v));
    slider('settings-scope', this.L('开镜灵敏度', 'Scoped sensitivity'), e.controlSettings.scopeSensitivity, .1, 2, e.controlSettings.scopeSensitivity.toFixed(2) + ' ×', v => e.setScopeSensitivity(v));
    y += this.choices(ctx, this.L('近战模型', 'Knife model'), x, y, w,
      [['classic', this.L('经典刀', 'Classic')], ['karambit', this.L('爪刀', 'Karambit')], ['butterfly', this.L('蝴蝶刀', 'Butterfly')]].map(([id, label]) => ({ id: `settings-knife-${id}`, label, selected: e.controlSettings.knifeModel === id, action: () => e.setKnifeModel(id) })));
    y += this.choices(ctx, this.L('初始手枪 · 下次出生生效', 'Starting pistol · next spawn'), x, y, w, [
      { id: 'settings-pistol-default', label: this.L('阵营默认', 'Faction'), selected: e.selectedPistol === 'default', action: () => e.setPistol('default') },
      { id: 'settings-pistol-deagle', label: 'Desert Eagle', selected: e.selectedPistol === 'deagle', action: () => e.setPistol('deagle') },
    ]);
    y += this.choices(ctx, this.L('命中反馈', 'Hit feedback'), x, y, w,
      [['off', this.L('关闭', 'Off')], ['visual', this.L('视觉', 'Visual')], ['full', this.L('完整', 'Full')]].map(([id, label]) => ({ id: `settings-hit-${id}`, label, selected: e.controlSettings.hitFeedback === id, action: () => e.setHitFeedback(id) })));
    y += this.choices(ctx, this.L('画质', 'Quality'), x, y, w,
      [['high', this.L('高', 'High')], ['low', this.L('流畅', 'Low')]].map(([id, label]) => ({ id: `settings-quality-${id}`, label, selected: e.quality === id, action: () => e.setQuality(id) })));
    y += this.choices(ctx, this.L('音效', 'Sound'), x, y, w,
      [true, false].map(on => ({ id: `settings-sound-${on ? 'on' : 'off'}`, label: on ? this.L('开启', 'On') : this.L('关闭', 'Off'), selected: e.audio.enabled === on, action: () => { if (e.audio.enabled !== on) e.toggleSound(); } })));
    this.text(ctx, e.settingsNote || this.L('设置自动保存在此浏览器', 'Settings persist in this browser'), x, y + 14, 12, C.dim, 'left', false, w);
    this.endScroll(ctx); this.scrollbar(ctx, this.settingsScroll, x + w + 8, top, h);
    this.button(ctx, x, r.y + r.h - 60, r.w - pad * 2, 44, this.L('恢复默认设置', 'Reset settings'), () => e.resetSettings(), { id: 'settings-reset' });
  }

  // Modal routing is exclusive: no underlying menu text or controls bleed
  // through a settings/map/shop panel, and hidden choices cannot receive input.
  draw(ctx: Ctx, W: number, H: number, presentationPaused = false) {
    const e = this.engine, L = computeHudLayout(W, H, this.safeArea);
    this.regions = []; ctx.save();
    if (e.settingsOpen) this.drawSettings(ctx, L);
    else if (e.phase === 'menu') this.drawMenu(ctx, L);
    else if (e.hud.matchEnd) this.drawMatchEnd(ctx, L);
    else if (e.phase === 'paused' && !presentationPaused) this.drawPause(ctx, L);
    else if (e.mapOpen) this.drawTacticalMap(ctx, L);
    else if (e.buyOpen) this.drawBuyMenu(ctx, L);
    else if (e.hud.scoreboardOpen) this.drawScoreboard(ctx, L);
    else this.drawMatchHud(ctx, L);
    if (presentationPaused) this.regions = [];
    ctx.restore();
  }

  private drawBuyMenu(ctx: Ctx, L: HudLayout) {
    const e = this.engine, view = e.shopView();
    const r = this.frame(ctx, L, 760, 560, this.L('购买装备', 'Equipment'), { id: 'shop-close', run: () => e.closeBuy() });
    const pad = r.w < 400 ? 16 : 24, x = r.x + pad, w = r.w - pad * 2 - 8;
    const top = r.y + 64, h = Math.max(1, r.h - 100), cols = w >= 560 ? 3 : 2;
    const tabW = (w - (cols - 1) * 8) / cols, tabsH = Math.ceil(view.categories.length / cols) * 52;
    const itemCols = w >= 560 ? 2 : 1, iw = (w - (itemCols - 1) * 12) / itemCols;
    const contentH = 52 + tabsH + 20 + Math.ceil(view.items.length / itemCols) * 80;
    this.buyScroll.setMax(contentH - h); this.beginScroll(ctx, x, top, w, h, this.buyScroll);
    this.text(ctx, view.money, x, top + 12, 20, C.gold, 'left', true, w);
    this.text(ctx, view.timeText, x, top + 36, 12, C.dim, 'left', false, w);
    view.categories.forEach((cat, i) => this.button(ctx, x + i % cols * (tabW + 8), top + 56 + Math.floor(i / cols) * 52, tabW, 44,
      this.L(cat.name, cat.nameEn), () => { e.setBuyCategory(cat.id); this.buyScroll.setMax(0); }, { id: `shop-category-${cat.id}`, selected: cat.active, small: true }));
    const itemY = top + 56 + tabsH + 12;
    view.items.forEach((item, i) => {
      const ix = x + i % itemCols * (iw + 12), iy = itemY + Math.floor(i / itemCols) * 80;
      uiRound(ctx, ix, iy, iw, 70, item.disabled ? '#17232e' : UI.raised, C.border, 10);
      this.text(ctx, item.label, ix + 14, iy + 19, 14, item.disabled ? C.dim : C.text, 'left', true, iw - 28);
      this.text(ctx, item.detail, ix + 14, iy + 46, 12, C.dim, 'left', false, Math.max(0, iw - 114));
      this.text(ctx, item.priceText, ix + iw - 14, iy + 46, 13, C.gold, 'right', false, 90);
      this.push({ id: `shop-item-${item.id}`, x: ix, y: iy, w: iw, h: 70, disabled: item.disabled, down: () => e.buy(item.id) });
    });
    this.endScroll(ctx); this.scrollbar(ctx, this.buyScroll, x + w + 8, top, h);
    this.text(ctx, this.L('购买时对局继续进行', 'The round keeps running'), x, r.y + r.h - 18, 12, C.dim, 'left', false, w);
  }

  private drawScoreboard(ctx: Ctx, L: HudLayout) {
    const e = this.engine;
    const r = this.frame(ctx, L, 640, 560, this.L('比赛记分板', 'Scoreboard'));
    const { body, rowHeight, teamHeaderHeight, maxScroll } = scoreboardBodyLayout(r, e.all.length);
    const col = scoreboardColumns(r), cx = (c: { x: number; w: number }) => c.x + c.w / 2;
    this.scoreboardScroll.setMax(maxScroll); this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.scoreboardScroll);
    let y = body.y + 14;
    for (const team of ['ct', 't'] as const) {
      this.text(ctx, `${team.toUpperCase()}  ${e.scores[team]}`, col.name.x, y, 14, team === 'ct' ? C.blue : C.amber, 'left', true, col.name.w);
      this.text(ctx, this.L('击杀', 'K'), cx(col.kills), y, 12, C.dim, 'center');
      this.text(ctx, this.L('阵亡', 'D'), cx(col.deaths), y, 12, C.dim, 'center');
      this.text(ctx, this.L('状态', 'State'), cx(col.status), y, 12, C.dim, 'center'); y += teamHeaderHeight;
      for (const a of [...e.all].filter(a => a.team === team).sort((a, b) => b.kills - a.kills)) {
        if (a.isPlayer) uiRound(ctx, body.x, y - 13, body.w, 26, UI.raised, undefined, 5);
        this.text(ctx, a.name + (a.isPlayer ? this.L(' · 你', ' · you') : ''), col.name.x, y, 13, a.alive ? C.text : C.faint, 'left', a.isPlayer, col.name.w);
        this.text(ctx, String(a.kills), cx(col.kills), y, 13, C.text, 'center');
        this.text(ctx, String(a.deaths), cx(col.deaths), y, 13, C.text, 'center');
        this.text(ctx, a.alive ? this.L('存活', 'Alive') : this.L('阵亡', 'Dead'), cx(col.status), y, 12, a.alive ? C.green : C.faint, 'center', false, col.status.w); y += rowHeight;
      }
    }
    this.endScroll(ctx); this.scrollbar(ctx, this.scoreboardScroll, r.x + r.w - 7, body.y, body.h);
    this.text(ctx, this.L('按住 Tab 查看 · 滚动查看全部队员', 'Hold Tab · scroll for all players'), r.x + r.w / 2, r.y + r.h - 18, 12, C.dim, 'center', false, r.w - 32);
  }

  private drawTacticalMap(ctx: Ctx, L: HudLayout) {
    const e = this.engine;
    const r = this.frame(ctx, L, 600, 660, this.L('战术地图', 'Tactical map'), { id: 'map-close', run: () => e.closeMap() });
    const size = Math.max(1, Math.min(r.w - 32, r.h - 124));
    const x = r.x + (r.w - size) / 2, y = r.y + 64;
    e.drawRadarContent(ctx, x, y, size);
    uiParagraph(ctx, this.L('白：自己 · 蓝：队友 · 橙：已发现敌人', 'White: you · Blue: team · Orange: spotted enemies'), r.x + 16, y + size + 8, r.w - 32, 12, C.dim, 2, 17);
    this.text(ctx, this.L('查看地图时对局继续进行', 'The round keeps running'), r.x + 16, r.y + r.h - 14, 11, C.faint, 'left', false, r.w - 32);
  }
  private drawPause(ctx: Ctx, L: HudLayout) {
    const e = this.engine, r = this.frame(ctx, L, 420, 352, this.L('对局已暂停', 'Match paused'));
    const x = r.x + 20, w = r.w - 40, top = r.y + 68, h = Math.max(1, r.h - 140);
    this.pauseScroll.setMax(164 - h); this.beginScroll(ctx, x, top, w, h, this.pauseScroll);
    [
      { id: 'pause-settings', label: this.L('设置', 'Settings'), run: () => e.openSettings() },
      { id: 'pause-restart', label: this.L('重新开始', 'Restart match'), run: () => e.startMatch() },
      { id: 'pause-menu', label: this.L('返回主菜单', 'Back to menu'), run: () => e.toMenu() },
    ].forEach((item, i) => this.button(ctx, x, top + i * 56, w, 44, item.label, item.run, { id: item.id }));
    this.endScroll(ctx); this.scrollbar(ctx, this.pauseScroll, x + w + 7, top, h);
    this.button(ctx, x, r.y + r.h - 64, w, 48, this.L('继续对局', 'Resume match'), () => e.resumeGame(), { id: 'pause-resume', primary: true });
  }
  private drawMatchEnd(ctx: Ctx, L: HudLayout) {
    const e = this.engine, end = e.hud.matchEnd!;
    const r = this.frame(ctx, L, 480, 380, end.title);
    const x = r.x + 20, w = r.w - 40, top = r.y + 64, h = Math.max(1, r.h - 140);
    this.resultScroll.setMax(176 - h); this.beginScroll(ctx, x, top, w, h, this.resultScroll);
    this.text(ctx, end.score, x, top + 28, 36, end.won ? C.gold : C.text, 'left', true, w);
    uiParagraph(ctx, end.stats, x, top + 60, w, 13, C.dim, 2, 20);
    this.button(ctx, x, top + 116, w, 44, this.L('返回主菜单', 'Back to menu'), () => e.toMenu(), { id: 'result-menu' });
    this.endScroll(ctx); this.scrollbar(ctx, this.resultScroll, x + w + 7, top, h);
    this.button(ctx, x, r.y + r.h - 64, w, 48, this.L('再来一局', 'Play again'), () => e.startMatch(), { id: 'result-replay', primary: true });
  }

  private drawMatchHud(ctx: Ctx, L: HudLayout) {
    const e = this.engine, h = e.hud, { W, H } = L;
    const radar = radarRect(L), rs = radar.w;
    e.drawRadarContent(ctx, radar.x, radar.y, rs);
    if (!L.short) this.text(ctx, h.location, radar.x + rs / 2, radar.y + rs + 12, 11, C.dim, 'center', false, rs + 12);
    const score = scoreStripRect(L, rs), { x: sx, y: sy, w: sw } = score;
    this.panel(ctx, sx, sy, sw, score.h, true);
    this.text(ctx, String(h.ctScore), sx + 24, sy + 23, 20, C.blue, 'center', true);
    this.text(ctx, String(h.tScore), sx + sw - 24, sy + 23, 20, C.amber, 'center', true);
    this.text(ctx, h.roundLabel, sx + sw / 2, sy + 12, 11, C.dim, 'center', false, sw - 76);
    this.text(ctx, h.timerText, sx + sw / 2, sy + 31, 16, h.timerUrgent ? C.red : C.text, 'center', true);
    this.pips(ctx, h.alivePips.ct, sx + 10, sy + score.h + 6, C.blue);
    this.pips(ctx, h.alivePips.t, sx + sw - 10 - h.alivePips.t.length * 10, sy + score.h + 6, C.amber);
    const feedback = matchFeedbackLayout(L, { touch: e.touchMode, hasBuy: !!h.money,
      objective: !!h.objective, objectiveAction: !!h.objectiveAction, center: !!h.center,
      notice: !!h.notice && !h.center, pickup: !!h.pickup, killfeedCount: Math.min(3, h.killfeed.length) });
    const message = (rect: HudRect, text: string, color: string = C.text) => {
      this.panel(ctx, rect.x, rect.y, rect.w, rect.h, true);
      this.text(ctx, text, rect.x + rect.w / 2, rect.y + rect.h / 2, 12, color, 'center', false, rect.w - 20);
    };
    if (h.objective && feedback.objective) message(feedback.objective, h.objective.text, C.gold);
    if (h.objectiveAction && feedback.objectiveAction) {
      const r = feedback.objectiveAction;
      this.panel(ctx, r.x, r.y, r.w, r.h, true);
      this.text(ctx, h.objectiveAction.text, r.x + r.w / 2, r.y + (r.h < 40 ? 8 : 13), 12, C.text, 'center', false, r.w - 20);
      uiRound(ctx, r.x + 10, r.y + r.h - 7, (r.w - 20) * h.objectiveAction.progress01, 3, C.amber, undefined, 2);
    }
    if (h.center && feedback.center) {
      const r = feedback.center;
      this.panel(ctx, r.x, r.y, r.w, r.h, true);
      this.text(ctx, h.center.title, r.x + r.w / 2, r.y + 25, 20, C.text, 'center', true, r.w - 24);
      this.text(ctx, h.center.detail, r.x + r.w / 2, r.y + 57, 12, C.dim, 'center', false, r.w - 24);
    }
    if (h.notice && feedback.notice) message(feedback.notice, h.notice.text);
    if (h.pickup && feedback.pickup) message(feedback.pickup, this.L('拾取 · ', 'Pick up · ') + h.pickup.name);
    const kills = h.killfeed.slice(-feedback.killfeed.length);
    feedback.killfeed.forEach((r, i) => {
      const k = kills[i]; this.panel(ctx, r.x, r.y, r.w, r.h, true);
      this.text(ctx, k.aName, r.x + 8, r.y + r.h / 2, 11, k.aTeam === 'ct' ? C.blue : C.amber, 'left', false, r.w * .27);
      this.text(ctx, k.weapon + (k.head ? ' · HS' : ''), r.x + r.w / 2, r.y + r.h / 2, 11, C.dim, 'center', false, r.w * .38);
      this.text(ctx, k.bName, r.x + r.w - 8, r.y + r.h / 2, 11, k.bTeam === 'ct' ? C.blue : C.amber, 'right', false, r.w * .27);
    });
    this.drawCrosshair(ctx, W, H);
    const hp = healthPanelRect(L), compactHp = hp.w < 160 || hp.h < 78;
    this.panel(ctx, hp.x, hp.y, hp.w, hp.h, true);
    const healthY = hp.y + (h.money ? (hp.h < 78 ? 30 : 34) : 24);
    if (h.money) this.text(ctx, h.money, hp.x + 10, hp.y + 12, 11, C.gold, 'left', false, hp.w - 20);
    this.text(ctx, '+ ' + h.health, hp.x + 10, healthY, hp.h < 78 ? 18 : 20, h.healthLow ? C.red : C.text, 'left', true);
    if (compactHp) this.text(ctx, `${h.killCount} K`, hp.x + hp.w - 10, healthY, 11, C.dim, 'right');
    if (hp.h >= 78) uiRound(ctx, hp.x + 10, hp.y + 51, (hp.w - 20) * h.healthPct / 100, 3, h.healthLow ? C.red : C.amber, undefined, 2);
    this.text(ctx, this.L('护甲 ', 'Armor ') + h.armor, hp.x + 10, hp.y + hp.h - 14, 11, C.dim, 'left', false, compactHp ? hp.w - 20 : hp.w - 84);
    if (!compactHp) this.text(ctx, h.killCount + this.L(' 击杀', ' kills'), hp.x + hp.w - 10, hp.y + hp.h - 14, 11, C.dim, 'right');
    const wp = weaponPanelRect(L), compactWp = wp.w < 220 || wp.h < 90;
    this.panel(ctx, wp.x, wp.y, wp.w, wp.h, true);
    this.text(ctx, h.weaponName, wp.x + 12, wp.y + 16, compactWp ? 12 : 14, C.text, 'left', true, wp.w - 24);
    this.text(ctx, `${h.ammoText} / ${h.reserveText}`, wp.x + wp.w - 12, wp.y + (compactWp ? 39 : 44), compactWp ? 18 : 22, C.text, 'right', true, wp.w - 24);
    if (!compactWp) this.text(ctx, h.reloadState, wp.x + 12, wp.y + 44, 11, C.dim, 'left', false, Math.max(0, wp.w - 150));
    const slots = h.slots, gap = 4, bw = (wp.w - 24 - gap * (slots.length - 1)) / Math.max(1, slots.length);
    slots.forEach((s, i) => {
      const x = wp.x + 12 + i * (bw + gap), y = wp.y + wp.h - 27;
      uiRound(ctx, x, y, bw, 19, s.equipped ? '#514538' : '#26333f', undefined, 4);
      this.text(ctx, s.key === 'grenade' ? `${s.num}·${h.grenadeCount}` : String(s.num), x + bw / 2, y + 10, 11, s.empty ? C.faint : s.equipped ? C.gold : C.dim, 'center', s.equipped);
    });
    if (h.damageOpacity > 0) { ctx.globalAlpha = Math.min(1, h.damageOpacity); ctx.strokeStyle = '#c33327'; ctx.lineWidth = 20; ctx.strokeRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (h.radio) {
      const rw = Math.min(280, L.availW), rh = 60 + h.radio.options.length * 24;
      const rr = overlayRect(L, rw, rh), rowH = Math.min(24, (rr.h - 64) / Math.max(1, h.radio.options.length));
      this.panel(ctx, rr.x, rr.y, rr.w, rr.h);
      this.text(ctx, h.radio.title, rr.x + 12, rr.y + 20, 14, C.amber);
      h.radio.options.forEach((option, i) => this.text(ctx, `${i + 1}  ${option}`, rr.x + 12, rr.y + 42 + i * rowH, 12, C.text, 'left', false, rr.w - 24));
      this.text(ctx, this.L('0  取消', '0  Cancel'), rr.x + 12, rr.y + rr.h - 12, 12, C.dim);
    }
    if (e.touchMode) this.drawTouchControls(ctx, L);
  }
  private drawCrosshair(ctx: Ctx, W: number, H: number) {
    const e = this.engine, h = e.hud, x = W / 2, y = H / 2;
    if (!h.crosshairHidden && !h.scope && e.player?.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const gap = h.crosshairGap, len = 7;
      ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
      ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len); ctx.stroke();
    }
    if (h.scope) {
      const r = Math.min(W, H) * .42;
      ctx.fillStyle = 'rgba(0,0,0,.94)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill('evenodd');
      ctx.strokeStyle = '#10151a'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      this.text(ctx, h.scopeLabel, x, Math.min(H - 14, y + r + 18), 11, C.dim, 'center');
    }
    if (h.hitOpacity > 0) {
      ctx.globalAlpha = h.hitOpacity;
      const color = h.hitKind === 'kill' ? C.gold : h.hitHead ? C.amber : '#fff';
      this.text(ctx, '×', x, y - 26, h.hitKind === 'kill' ? 26 : 22, color, 'center');
      if (h.hitConfirmation) this.text(ctx, h.hitConfirmation, x, y + 30, 13, color, 'center'); ctx.globalAlpha = 1;
    }
  }
  private pips(ctx: Ctx, states: string[], x: number, y: number, color: string) {
    states.forEach((state, i) => this.text(ctx, state === 'dead' ? '×' : state === 'me' ? '●' : '·', x + i * 10, y, 11, state === 'dead' ? C.faint : color));
  }
  private drawTouchControls(ctx: Ctx, L: HudLayout) {
    const e = this.engine, tc = computeTouchControls(L, { hasBuy: !!e.hud.money });
    for (const band of tc.look) this.regions.push({ ...band, id: 'look' });
    const j = tc.joystick;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(j.cx, j.cy, j.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(j.cx + e.touchMove.x * j.r * .5, j.cy + e.touchMove.y * j.r * .5, Math.min(20, j.r * .4), 0, Math.PI * 2); ctx.fill();
    const move = (x: number, y: number) => {
      const dx = x - j.cx, dy = y - j.cy, len = Math.hypot(dx, dy), s = len > j.r ? j.r / len : 1;
      e.setTouchMove(dx * s / j.r, dy * s / j.r);
    };
    this.regions.push({ id: 'touch-move', ...j.hit, down: move, drag: move, up: () => e.setTouchMove(0, 0) });
    const actions: Record<TouchButtonId, { label: string; down: () => void; up?: () => void }> = {
      fire: { label: this.L('开火', 'Fire'), down: () => e.touchFireStart(), up: () => e.touchFireEnd() },
      jump: { label: this.L('跳', 'Jump'), down: () => e.keys.add('Space'), up: () => e.keys.delete('Space') },
      reload: { label: this.L('换弹', 'Reload'), down: () => e.reload() },
      use: { label: this.L('拾取', 'Use'), down: () => e.touchUse(), up: () => e.touchUseEnd() },
      switch: { label: this.L('切枪', 'Swap'), down: () => e.touchSwitch() },
      pause: { label: 'Ⅱ', down: () => e.pauseGame() }, buy: { label: this.L('购买', 'Buy'), down: () => e.toggleBuy() },
    };
    for (const b of tc.buttons) {
      const a = actions[b.id]; ctx.fillStyle = 'rgba(20,30,40,.72)'; ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1.5; ctx.stroke(); this.text(ctx, a.label, b.cx, b.cy, 11, C.text, 'center');
      this.regions.push({ id: `touch-${b.id}`, ...buttonHit(b), down: a.down, up: a.up });
    }
  }
}
