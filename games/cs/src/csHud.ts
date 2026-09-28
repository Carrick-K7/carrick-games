// CS-owned canvas HUD. Menus use one safe-area-aware layout and one scroll
// viewport; fixed headers/actions never move with selectable content.
import type { CsEngine } from './csEngine.js';
import { MAPS } from './csMaps.js';
import { UI, uiButton, uiFont, uiHudPlate, uiNumber, uiParagraph, uiRound, uiRule, uiText, type UiTone } from './csHudUi.js';
import { drawHudIcon, drawTeamBadge } from './csHudArt.js';
import {
  aimGeometry, buttonHit, computeHudLayout, computeTouchControls, healthPanelRect, HudScroll,
  normalizeSafeArea, overlayRect, radarRect, scoreboardColumns, scoreboardBodyLayout, scoreStripRect, matchFeedbackLayout, killfeedColumns,
  TOUCH_TARGET, weaponPanelRect, modalSections, shopLayout, tacticalMapLayout, type ModalSections, type HudLayout, type HudSafeArea, type HudRect,
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
  /** Rich purchase rows must expose their complete name/price before activation. */
  minVisibleHeight?: number;
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
  killfeed: { aName: string; aTeam: string; aMe: boolean; bName: string; bTeam: string; weaponId?: string; weaponIconId?: string; weapon: string; head: boolean; time: number }[];
  scoreboardOpen: boolean; bombMarker: unknown;
}
const C = { text: UI.text, dim: UI.dim, faint: UI.muted, amber: UI.accent,
  border: UI.border, blue: UI.ct, red: '#ef8175', green: UI.cash, gold: UI.t };
const MAP_EN: Record<string, { name: string; intro: string; hint: string }> = {
  fy_snow: { name: 'Snow Arena', intro: 'A compact snow arena with weapons to pick up on the ground.', hint: 'Flank along the side ramps to reach the rear AWP balcony.' },
  de_dust2: { name: 'Dust II', intro: 'Fight through long A, mid doors and B tunnels. Two bomb sites.', hint: 'Buy at your spawn, then attack or defend sites A and B.' },
};
const HUD_FIREARMS = new Set(['ak47', 'm4a1', 'awp', 'mp5', 'tmp', 'p90', 'mac10', 'sg552', 'aug', 'scout', 'g3sg1', 'm3', 'xm1014', 'm249', 'deagle', 'usp', 'glock']);
const HUD_KNIVES = new Set(['knife-classic', 'knife-karambit', 'knife-butterfly']);
type Choice = { id: string; label: string; selected: boolean; action: () => void; disabled?: boolean; tone?: UiTone };
type PanelClose = { id: string; run: () => void; label?: string; icon?: string };

export class CsHud {
  regions: HudRegion[] = [];
  private safeArea: HudSafeArea = normalizeSafeArea(null);
  private readonly menuScroll = new HudScroll();
  private readonly settingsScroll = new HudScroll();
  private readonly buyScroll = new HudScroll();
  private readonly scoreboardScroll = new HudScroll();
  private readonly pauseScroll = new HudScroll();
  private readonly resultScroll = new HudScroll();
  private readonly radioScroll = new HudScroll();
  private lastBuyCategory = '';
  private lastRadioMenu: string | null = null;
  private regionDy = 0;
  private regionClip: HudRect | null = null;
  private regionScroll: HudScroll | null = null;
  private pointer: { x: number; y: number } | null = null;
  private readonly mapPreviews = new Map<string, HTMLImageElement>();
  private readonly weaponIcons = new Map<string, HTMLImageElement>();
  constructor(private readonly engine: CsEngine) {}
  setPointer(point: { x: number; y: number } | null) { this.pointer = point; }
  dispose() {
    this.pointer = null; this.regions = [];
    // Images have no callbacks into this HUD. Dropping the instance cache cannot
    // retarget another instance or a retained release while downloads settle.
    this.mapPreviews.clear(); this.weaponIcons.clear();
  }
  private hovered(x: number, y: number, w: number, h: number) {
    if (!this.pointer) return false;
    const p = this.pointer, cy = y + this.regionDy, clip = this.regionClip;
    if (clip && (p.x < clip.x || p.x > clip.x + clip.w || p.y < clip.y || p.y > clip.y + clip.h)) return false;
    return p.x >= x && p.x <= x + w && p.y >= cy && p.y <= cy + h;
  }
  private image(cache: Map<string, HTMLImageElement>, path: string) {
    if (typeof Image === 'undefined' || typeof this.engine.assetUrl !== 'function') return null;
    const url = this.engine.assetUrl(path);
    let image = cache.get(url);
    if (!image) {
      image = new Image(); image.decoding = 'async'; image.src = url;
      cache.set(url, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
  }
  private mapPreview(id: string) { return this.image(this.mapPreviews, `assets/ui/maps/${id}.webp`); }
  private drawWeaponArtwork(ctx: Ctx, id: string, x: number, y: number, w: number, h: number, disabled = false) {
    if (['armor', 'vest', 'kit'].includes(id)) {
      drawHudIcon(ctx, 'armor', x, y, w, h, disabled ? C.faint : C.text); return true;
    }
    if (id === 'he' || id === 'c4') {
      drawHudIcon(ctx, id === 'he' ? 'grenade' : 'bomb', x, y, w, h, disabled ? C.faint : C.text); return true;
    }
    if (!HUD_FIREARMS.has(id) && !HUD_KNIVES.has(id)) return false;
    const image = this.image(this.weaponIcons, `assets/ui/weapons/${id}.svg`);
    if (!image) return false;
    const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.save(); if (disabled) ctx.globalAlpha *= .45;
    ctx.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height);
    ctx.restore();
    return true;
  }
  private drawMapPreview(ctx: Ctx, id: string, x: number, y: number, w: number, h: number) {
    const image = this.mapPreview(id);
    ctx.fillStyle = UI.raised; ctx.fillRect(x, y, w, h);
    if (!image) return;
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
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
    if (e.radioMenu) return this.radioScroll;
    if (e.hud.scoreboardOpen) return this.scoreboardScroll;
    if (e.phase === 'paused') return this.pauseScroll;
    if (e.mapOpen) return null;
    if (e.buyOpen) return this.buyScroll;
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
      if (r.down && r.w >= TOUCH_TARGET && r.h >= TOUCH_TARGET
        && (right - x < TOUCH_TARGET || bottom - y < (r.minVisibleHeight ?? TOUCH_TARGET))) return;
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
    if (soft) uiHudPlate(ctx, x, y, w, h);
    else uiRound(ctx, x, y, w, h, 'rgba(22,29,36,.96)', C.border, 2);
  }
  private button(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, action: () => void,
    opts: { id: string; selected?: boolean; primary?: boolean; disabled?: boolean; small?: boolean; tone?: UiTone }) {
    uiButton(ctx, x, y, w, h, label, { ...opts, hovered: !opts.disabled && this.hovered(x, y, w, h) });
    this.push({ id: opts.id, x, y, w, h, disabled: opts.disabled, down: () => action() });
  }
  private choices(ctx: Ctx, label: string, x: number, y: number, w: number, options: Choice[]) {
    this.text(ctx, label, x, y + 8, 13, C.dim);
    const gap = 6, bw = (w - gap * (options.length - 1)) / options.length;
    options.forEach((o, i) => this.button(ctx, x + i * (bw + gap), y + 24, bw, TOUCH_TARGET, o.label, o.action,
      { id: o.id, selected: o.selected, disabled: o.disabled, small: bw < 100, tone: o.tone }));
    uiRule(ctx, x, y + 77, w);
    return 84;
  }
  private dimScreen(ctx: Ctx, W: number, H: number) {
    ctx.fillStyle = 'rgba(5,10,15,.48)'; ctx.fillRect(0, 0, W, H);
  }
  private frame(ctx: Ctx, L: HudLayout, w: number, h: number, title: string, close?: PanelClose,
    chrome?: { headerH: number; close: HudRect | null }) {
    const r = overlayRect(L, w, h), c = chrome ?? modalSections(r);
    this.regions = []; this.dimScreen(ctx, L.W, L.H); this.panel(ctx, r.x, r.y, r.w, r.h);
    if (c.headerH > 0) {
      ctx.fillStyle = UI.header; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, c.headerH - 2);
      uiRule(ctx, r.x + 1, r.y + c.headerH - 1, r.w - 2);
      ctx.fillStyle = UI.ct; ctx.fillRect(r.x, r.y, 3, c.headerH - 1);
      this.text(ctx, title, r.x + 20, r.y + c.headerH / 2, c.headerH < 60 ? 18 : 21, C.text, 'left', false,
        close && c.close ? c.close.x - r.x - 32 : r.w - 40);
    }
    if (close && c.close) this.button(ctx, c.close.x, c.close.y, c.close.w, c.close.h,
      c.close.w <= 44 ? close.icon || '×' : close.label || this.L('关闭', 'Close'), close.run, { id: close.id });
    return r;
  }
  private inlineHeader(ctx: Ctx, body: HudRect, title: string, close?: PanelClose) {
    this.text(ctx, title, body.x, body.y + 22, 18, C.text, 'left', false, body.w - (close ? 56 : 0));
    if (close) this.button(ctx, body.x + body.w - 44, body.y, 44, 44, close.icon || '×', close.run, { id: close.id });
    uiRule(ctx, body.x, body.y + 51, body.w);
  }

  // One menu for every device. The action footer does not depend on how many
  // mode options exist, so Team DM cannot push Start below a short window.
  private drawMenu(ctx: Ctx, L: HudLayout) {
    const e = this.engine, map = (MAPS as any)[e.selectedMap], en = MAP_EN[e.selectedMap];
    const title = L.availW < 400 ? this.L('CS / 对战', 'CS / Play') : this.L('CS / 对战准备', 'CS / Play');
    const close = { id: 'menu-settings', label: this.L('设置', 'Settings'), icon: '⚙', run: () => e.openSettings() };
    const r = this.frame(ctx, L, 980, 638, title, close), sections = modalSections(r);
    const topExtra = (sections.scrollAll ? 56 : 0) + (e.hud.menuError ? 32 : 0);
    const body = { ...sections.body, y: sections.body.y + topExtra, h: Math.max(1, sections.body.h - topExtra) };
    const wide = body.w >= 720, gap = 32, colW = wide ? (body.w - gap) / 2 : body.w;
    const mapCardH = wide ? Math.min(280, Math.max(96, body.h - 180)) : 84;
    const mapH = wide ? mapCardH + 44 : 228;
    const configH = 336 + (e.selectedMode === 'tdm' ? 84 : 0);
    const contentH = wide ? Math.max(mapH + 124, configH) + 12 : mapH + configH + 28;
    this.menuScroll.setMax(contentH + topExtra + (sections.scrollAll ? 60 : 0) - sections.body.h);
    this.beginScroll(ctx, sections.body.x, sections.body.y, sections.body.w, sections.body.h, this.menuScroll);
    if (sections.scrollAll) this.inlineHeader(ctx, sections.body, title, close);
    if (e.hud.menuError) this.text(ctx, e.hud.menuError, body.x, body.y - 18, 12, C.red, 'left', false, body.w);
    this.text(ctx, this.L('选择地图', 'Map'), body.x, body.y + 8, 13, C.dim);
    const cards = [
      { id: 'fy_snow', name: this.L('雪地竞技场', 'Snow Arena'), detail: this.L('雪地近距离交战 · 地面拾枪', 'Close-range rounds · ground pickups') },
      { id: 'de_dust2', name: this.L('炙热沙城Ⅱ', 'Dust II'), detail: this.L('经典沙城 · A / B 双包点', 'Classic Dust II · sites A and B') },
    ];
    cards.forEach((card, i) => {
      const cw = wide ? (colW - 12) / 2 : colW;
      const ch = mapCardH;
      const x = wide ? body.x + i * (cw + 12) : body.x;
      const y = body.y + 26 + (wide ? 0 : i * 96);
      const selected = e.selectedMap === card.id, hover = this.hovered(x, y, cw, ch);
      const thumbW = Math.min(84, Math.round(cw * .28));
      this.drawMapPreview(ctx, card.id, x, y, wide ? cw : thumbW, ch);
      if (wide) {
        ctx.fillStyle = 'rgba(7,12,17,.12)'; ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = 'rgba(8,14,20,.9)'; ctx.fillRect(x, y + ch - 56, cw, 56);
        this.text(ctx, card.name, x + 12, y + ch - 35, 16, C.text, 'left', true, cw - 24);
        this.text(ctx, card.id.toUpperCase(), x + 12, y + ch - 14, 11, C.dim, 'left', false, cw - 24);
      } else {
        ctx.fillStyle = selected ? UI.selected : hover ? UI.hover : UI.raised;
        ctx.fillRect(x + thumbW, y, cw - thumbW, ch);
        this.text(ctx, card.name, x + thumbW + 12, y + 25, 16, C.text, 'left', true, cw - thumbW - 24);
        this.text(ctx, card.id.toUpperCase(), x + thumbW + 12, y + 49, 11, C.dim, 'left', false, cw - thumbW - 24);
        this.text(ctx, card.id === 'fy_snow' ? this.L('地面拾枪', 'Ground pickups') : this.L('A / B 双包点', 'Sites A / B'), x + thumbW + 12, y + 67, 12, C.dim, 'left', false, cw - thumbW - 24);
      }
      ctx.strokeStyle = selected ? UI.text : hover ? '#a3b3bf' : C.border;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
      if (selected) {
        const tx = wide ? x + cw - 27 : x + 8, ty = y + 8;
        ctx.fillStyle = UI.text; ctx.fillRect(tx, ty, 18, 18);
        ctx.strokeStyle = '#243542'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(tx + 4, ty + 9); ctx.lineTo(tx + 8, ty + 13); ctx.lineTo(tx + 14, ty + 5); ctx.stroke();
      }
      this.push({ id: `menu-map-${card.id}`, x, y, w: cw, h: ch, disabled: e.bootLoading || e.mapLoading, down: () => e.selectMap(card.id) });
    });
    if (wide) {
      uiParagraph(ctx, this.L(map.intro, en.intro), body.x, body.y + mapH + 4, colW, 14, C.text, 2, 21);
      uiParagraph(ctx, this.L(map.hint, en.hint), body.x, body.y + mapH + 58, colW, 13, C.dim, 2, 19);
      this.text(ctx, this.L('5 对 5 · 本地人机', '5 vs 5 · local bot match'), body.x, body.y + mapH + 112, 12, C.faint);
    }
    if (wide) { ctx.fillStyle = UI.separator; ctx.fillRect(body.x + colW + gap / 2, body.y, 1, Math.max(mapH + 124, configH)); }
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
      { id: 'menu-team-ct', label: this.L('CT · 反恐精英', 'CT · Counter'), selected: e.selectedTeam === 'ct', tone: 'ct', action: () => e.selectTeam('ct') },
      { id: 'menu-team-t', label: this.L('T · 恐怖分子', 'T · Terrorist'), selected: e.selectedTeam === 't', tone: 't', action: () => e.selectTeam('t') },
    ]);
    y += this.choices(ctx, this.L('机器人难度', 'Bot skill'), x, y, colW, [
      { id: 'easy', label: this.L('休闲', 'Casual') }, { id: 'normal', label: this.L('标准', 'Regular') }, { id: 'hard', label: this.L('硬核', 'Hardcore') },
    ].map(d => ({ ...d, id: `menu-skill-${d.id}`, selected: e.difficulty === d.id, action: () => e.setDifficulty(d.id) })));
    this.choices(ctx, this.L('初始手枪', 'Starting pistol'), x, y, colW, [
      { id: 'menu-pistol-default', label: this.L('阵营默认', 'Faction'), selected: e.selectedPistol === 'default', action: () => e.setPistol('default') },
      { id: 'menu-pistol-deagle', label: 'Desert Eagle', selected: e.selectedPistol === 'deagle', action: () => e.setPistol('deagle') },
    ]);
    const label = e.bootLoading ? e.hud.menuStart.label : e.mapLoading ? this.L('正在装载地图…', 'Loading map…')
      : e.ready ? this.L('进入战场', 'Enter the Arena') : this.L('重试加载', 'Retry loading');
    if (sections.scrollAll) this.button(ctx, body.x, body.y + contentH + 8, body.w, 48, label, () => e.primaryAction(),
      { id: 'menu-start', primary: true, disabled: e.bootLoading || e.mapLoading });
    this.endScroll(ctx); this.scrollbar(ctx, this.menuScroll, sections.body.x + sections.body.w + 5, sections.body.y, sections.body.h);
    if (sections.footer) {
      const footer = sections.footer, actionW = wide ? 252 : footer.w;
      uiRule(ctx, r.x + 1, footer.y - (sections.compact ? 4 : 12), r.w - 2);
      if (wide) {
        drawTeamBadge(ctx, e.selectedTeam === 'ct' ? 'ct' : 't', footer.x, footer.y + 9, 28, e.selectedTeam === 'ct' ? C.blue : C.gold);
        this.text(ctx, this.L(map.name, en.name) + ' / ' + e.selectedTeam.toUpperCase(), footer.x + 40, footer.y + 12, 14, C.text, 'left', true, footer.w - actionW - 56);
        this.text(ctx, this.L('本地人机 · 地图作者：', 'Local bots · map by ') + map.credit, footer.x + 40, footer.y + 34, 12, C.dim, 'left', false, footer.w - actionW - 56);
      }
      this.button(ctx, footer.x + footer.w - actionW, footer.y, actionW, footer.h, label, () => e.primaryAction(),
        { id: 'menu-start', primary: true, disabled: e.bootLoading || e.mapLoading });
    }
  }

  private drawSettings(ctx: Ctx, L: HudLayout) {
    const e = this.engine;
    const title = this.L('设置', 'Settings'), close = { id: 'settings-close', run: () => e.closeSettings() };
    const r = this.frame(ctx, L, 560, 638, title, close), sections = modalSections(r, 44);
    const { body } = sections, x = body.x, w = body.w, top = body.y + (sections.scrollAll ? 56 : 0);
    const compactSlider = body.h < 80, contentH = compactSlider ? 584 : 624;
    this.settingsScroll.setMax(contentH + (sections.scrollAll ? 112 : 0) - body.h);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.settingsScroll);
    if (sections.scrollAll) this.inlineHeader(ctx, body, title, close);
    let y = top;
    const slider = (id: string, label: string, value: number, min: number, max: number, format: string, apply: (v: number) => void) => {
      this.text(ctx, label, x, y + 8, 14, C.text, 'left', false, w - 66);
      this.text(ctx, format, x + w, y + 8, 13, C.amber, 'right');
      const sx = x + 8, sw = w - 16, sy = y + (compactSlider ? 32 : 42), t = (value - min) / (max - min);
      uiRound(ctx, sx, sy - 2, sw, 4, C.border, undefined, 2);
      uiRound(ctx, sx, sy - 2, Math.max(1, sw * t), 4, C.amber, undefined, 2);
      ctx.fillStyle = C.text; ctx.fillRect(sx + sw * t - 5, sy - 8, 10, 16);
      const change = (px: number) => apply(min + Math.max(0, Math.min(1, (px - sx) / sw)) * (max - min));
      this.push({ id, x, y: compactSlider ? y : sy - 22, w, h: 44, dragAxis: 'x', down: change, drag: change }); y += compactSlider ? 64 : 84;
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
    if (sections.scrollAll) this.button(ctx, x, top + contentH + 8, w, 44, this.L('恢复默认设置', 'Reset settings'), () => e.resetSettings(), { id: 'settings-reset' });
    this.endScroll(ctx); this.scrollbar(ctx, this.settingsScroll, x + w + 5, body.y, body.h);
    if (sections.footer) {
      const f = sections.footer; uiRule(ctx, r.x + 1, f.y - (sections.compact ? 4 : 12), r.w - 2);
      this.button(ctx, f.x, f.y, f.w, f.h, this.L('恢复默认设置', 'Reset settings'), () => e.resetSettings(), { id: 'settings-reset' });
    }
  }

  // Modal routing is exclusive: no underlying menu text or controls bleed
  // through a settings/map/shop panel, and hidden choices cannot receive input.
  draw(ctx: Ctx, W: number, H: number, presentationPaused = false) {
    const e = this.engine, L = computeHudLayout(W, H, this.safeArea);
    this.regions = []; ctx.save();
    if (!e.radioMenu) this.lastRadioMenu = null;
    if (e.settingsOpen) this.drawSettings(ctx, L);
    else if (e.phase === 'menu') this.drawMenu(ctx, L);
    else if (e.hud.matchEnd) this.drawMatchEnd(ctx, L);
    else if (e.radioMenu && e.hud.radio) this.drawRadio(ctx, L);
    else if (e.hud.scoreboardOpen) this.drawScoreboard(ctx, L);
    else if (e.phase === 'paused' && !presentationPaused) this.drawPause(ctx, L);
    else if (e.mapOpen) this.drawTacticalMap(ctx, L);
    else if (e.buyOpen) this.drawBuyMenu(ctx, L);
    else this.drawMatchHud(ctx, L);
    if (presentationPaused) this.regions = [];
    ctx.restore();
  }

  private drawBuyMenu(ctx: Ctx, L: HudLayout) {
    const e = this.engine, view = e.shopView(), layout = shopLayout(overlayRect(L, 760, 560), view.categories.length);
    const title = this.L('购买装备', 'Equipment'), close = { id: 'shop-close', run: () => e.closeBuy() };
    const r = this.frame(ctx, L, 760, 560, layout.statusInline ? '' : title, close, layout);
    if (this.lastBuyCategory !== e.buyCategory) { this.buyScroll.setMax(0); this.lastBuyCategory = e.buyCategory; }
    const { body, itemWidth: iw, itemHeight: ih, itemColumns } = layout;
    const notice = e.hud.notice?.text;
    const money = view.free ? this.L('装备免费', 'Free gear') : view.money;
    const status = (box: HudRect, inline: boolean) => {
      if (inline) {
        this.text(ctx, box.w < 240 ? this.L('购买', 'Buy') : title, box.x, box.y + 10, 16, C.text, 'left', false, Math.max(0, box.w - 112));
        uiNumber(ctx, money, box.x + box.w, box.y + 10, 18, C.green, 'right', 108);
        this.text(ctx, view.timeText + (notice && !layout.footer ? ' · ' + notice : ''), box.x, box.y + 32, 11, notice ? C.gold : C.dim, 'left', false, box.w);
      } else {
        uiNumber(ctx, money, box.x, box.y + 12, 20, C.green, 'left', box.w);
        this.text(ctx, view.timeText, box.x, box.y + 35, 12, C.dim, 'left', false, box.w);
      }
    };
    const drawCategory = (cat: typeof view.categories[number], box: HudRect) => this.button(ctx, box.x, box.y, box.w, box.h,
      cat.id === 'equipment' ? this.L('装备', 'Gear') : cat.id === 'heavy' ? this.L('重型', 'Heavy') : this.L(cat.name, cat.nameEn),
      () => e.setBuyCategory(cat.id), { id: `shop-category-${cat.id}`, selected: cat.active, small: true });
    if (layout.status) status(layout.status, layout.statusInline);
    if (!layout.scrollAll) view.categories.forEach((cat, i) => drawCategory(cat, layout.categories[i]));
    const fallbackCatsH = Math.ceil(view.categories.length / 2) * 52;
    const extra = layout.scrollAll ? 112 + fallbackCatsH : 0;
    const contentH = extra + Math.ceil(view.items.length / itemColumns) * (ih + layout.itemGap);
    this.buyScroll.setMax(contentH - body.h);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.buyScroll);
    if (layout.scrollAll) {
      this.inlineHeader(ctx, body, title, close); status({ x: body.x, y: body.y + 56, w: body.w, h: 44 }, false);
      view.categories.forEach((cat, i) => drawCategory(cat, { x: body.x + i % 2 * (body.w + 8) / 2,
        y: body.y + 108 + Math.floor(i / 2) * 52, w: (body.w - 8) / 2, h: 44 }));
    }
    view.items.forEach((item, i) => {
      const ix = body.x + i % itemColumns * (iw + 12), iy = body.y + extra + Math.floor(i / itemColumns) * (ih + layout.itemGap);
      const tint = item.status === 'owned' ? C.green : item.status === 'funds' ? C.red : C.gold;
      uiRound(ctx, ix, iy, iw, ih, item.disabled ? '#20282f' : this.hovered(ix, iy, iw, ih) ? UI.hover : UI.raised, C.border, 1);
      if (item.status === 'owned') { ctx.fillStyle = C.green; ctx.fillRect(ix, iy, 2, ih); }
      uiFont(ctx, 12); const priceW = Math.min(90, Math.max(44, ctx.measureText(item.priceText).width + 4));
      const detail = item.status === 'funds' || item.status === 'unavailable' ? item.statusText : item.detail;
      if (ih < 70) {
        this.text(ctx, item.label, ix + 12, iy + 12, 13, item.disabled ? C.dim : C.text, 'left', true, iw - 24);
        this.text(ctx, detail, ix + 12, iy + 31, 11, item.status === 'funds' ? C.red : C.dim, 'left', false, Math.max(0, iw - priceW - 32));
        this.text(ctx, item.priceText, ix + iw - 12, iy + 31, 12, tint, 'right', true, priceW);
      } else {
        const artW = iw >= 240 ? 62 : 40;
        this.text(ctx, item.label, ix + 12, iy + 18, 14, item.disabled ? C.dim : C.text, 'left', true, iw - artW - 36);
        this.drawWeaponArtwork(ctx, item.id, ix + iw - artW - 12, iy + 8, artW, 20, item.disabled);
        this.text(ctx, detail, ix + 12, iy + 48, 12, item.status === 'funds' ? C.red : C.dim, 'left', false, Math.max(0, iw - priceW - 32));
        this.text(ctx, item.priceText, ix + iw - 12, iy + 48, 13, tint, 'right', true, priceW);
      }
      this.push({ id: `shop-item-${item.id}`, x: ix, y: iy, w: iw, h: ih, minVisibleHeight: ih, disabled: item.disabled, down: () => e.buy(item.id) });
    });
    this.endScroll(ctx); this.scrollbar(ctx, this.buyScroll, body.x + body.w + 5, body.y, body.h);
    if (layout.footer) {
      const f = layout.footer; uiRule(ctx, r.x + 1, f.y - 4, r.w - 2);
      this.text(ctx, notice || this.L('购买时对局继续进行', 'The round keeps running'), f.x, f.y + f.h / 2, 12, notice ? C.gold : C.dim, 'left', false, f.w);
    }
  }

  private drawScoreboard(ctx: Ctx, L: HudLayout) {
    const e = this.engine, title = this.L('比赛记分板', 'Scoreboard');
    const r = overlayRect(L, 640, 560), layout = scoreboardBodyLayout(r, e.all.length);
    const close = { id: 'scoreboard-close', run: () => { e.hud.scoreboardOpen = false; e.keys.delete('Tab'); } };
    this.frame(ctx, L, 640, 560, '', close, layout);
    this.text(ctx, title, r.x + 20, r.y + 26, layout.headerH < 60 ? 18 : 21, C.text, 'left', false, r.w - 92);
    if (layout.headerH >= 60) {
      const map = (MAPS as any)[e.selectedMap];
      const info = [map ? this.L(map.name, MAP_EN[e.selectedMap]?.name || map.name) : '', e.hud.roundLabel, e.hud.timerText].filter(Boolean).join(' · ');
      this.text(ctx, info, r.x + 20, r.y + 54, 12, C.dim, 'left', false, r.w - 40);
    }
    const { body, rowHeight, teamHeaderHeight, maxScroll, footer } = layout;
    const col = scoreboardColumns(r), cx = (c: { x: number; w: number }) => c.x + c.w / 2;
    this.scoreboardScroll.setMax(maxScroll); this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.scoreboardScroll);
    let y = body.y + 14;
    for (const team of ['ct', 't'] as const) {
      const color = team === 'ct' ? C.blue : C.gold;
      ctx.fillStyle = team === 'ct' ? 'rgba(112,170,209,.15)' : 'rgba(197,170,103,.15)'; ctx.fillRect(body.x, y - 14, body.w, teamHeaderHeight);
      ctx.fillStyle = color; ctx.fillRect(body.x, y - 14, 3, teamHeaderHeight);
      const badgeSize = col.name.w < 100 ? 12 : 18;
      drawTeamBadge(ctx, team, col.name.x + 4, y - badgeSize / 2, badgeSize, color);
      const name = col.name.w >= 210 ? this.L(team === 'ct' ? '反恐精英' : '恐怖分子', team === 'ct' ? 'Counter-terrorists' : 'Terrorists') : team.toUpperCase();
      const teamScoreW = col.name.w < 100 ? 28 : 32;
      this.text(ctx, name, col.name.x + badgeSize + 8, y, 13, color, 'left', true, Math.max(0, col.name.w - badgeSize - 16 - teamScoreW));
      uiNumber(ctx, String(e.scores[team]), col.name.x + col.name.w - 4, y, col.name.w < 100 ? 16 : 18, color, 'right', teamScoreW);
      this.text(ctx, this.L('击杀', 'K'), cx(col.kills), y, 12, C.dim, 'center', false, col.kills.w);
      this.text(ctx, this.L('阵亡', 'D'), cx(col.deaths), y, 12, C.dim, 'center', false, col.deaths.w);
      this.text(ctx, this.L('状态', 'State'), cx(col.status), y, 12, C.dim, 'center', false, col.status.w); y += teamHeaderHeight;
      const players = [...e.all].filter(a => a.team === team).sort((a, b) => b.kills - a.kills);
      players.forEach((a, i) => {
        ctx.fillStyle = a.isPlayer ? UI.raised : i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.08)'; ctx.fillRect(body.x, y - 12, body.w, 24);
        if (a.isPlayer) { ctx.fillStyle = color; ctx.fillRect(body.x, y - 12, 3, 24); }
        this.text(ctx, a.name + (a.isPlayer ? this.L(' · 你', ' · you') : ''), col.name.x + 4, y, 13, a.alive ? C.text : C.faint, 'left', a.isPlayer, col.name.w - 8);
        uiNumber(ctx, String(a.kills), col.kills.x + col.kills.w - 4, y, 14, C.text, 'right', col.kills.w - 8);
        uiNumber(ctx, String(a.deaths), col.deaths.x + col.deaths.w - 4, y, 14, C.text, 'right', col.deaths.w - 8);
        this.text(ctx, a.alive ? this.L('存活', 'Alive') : this.L('阵亡', 'Dead'), cx(col.status), y, 12, a.alive ? C.green : C.faint, 'center', false, col.status.w);
        uiRule(ctx, body.x, y + 14, body.w); y += rowHeight;
      });
    }
    this.endScroll(ctx); this.scrollbar(ctx, this.scoreboardScroll, r.x + r.w - 7, body.y, body.h);
    uiRule(ctx, r.x + 1, footer.y, r.w - 2);
    this.text(ctx, e.phase === 'paused' ? this.L('对局已暂停 · 滚动查看队员', 'Paused · scroll for all players')
      : this.L('按住 Tab 查看 · 滚动查看队员', 'Hold Tab · scroll for all players'), footer.x + footer.w / 2, footer.y + footer.h / 2, 12, C.dim, 'center', false, footer.w);
  }

  private drawTacticalMap(ctx: Ctx, L: HudLayout) {
    const e = this.engine, layout = tacticalMapLayout(overlayRect(L, 600, 660));
    this.frame(ctx, L, 600, 660, this.L('战术地图', 'Tactical map'), { id: 'map-close', run: () => e.closeMap() }, layout);
    const { map, legend, footer } = layout;
    if (map.w > 0) e.drawRadarContent(ctx, map.x, map.y, map.w);
    if (layout.sideLegend && legend.h >= 54) {
      [[C.text, this.L('自己', 'You')], [C.blue, this.L('队友', 'Teammates')], [C.amber, this.L('已发现敌人', 'Spotted enemies')]].forEach(([color, label], i) => {
        const y = legend.y + i * 20 + 10;
        ctx.fillStyle = color; ctx.fillRect(legend.x, y - 3, 6, 6);
        this.text(ctx, label, legend.x + 16, y, 12, C.dim, 'left', false, legend.w - 16);
      });
    } else if (legend.h >= 17) uiParagraph(ctx, this.L('白：自己 · 蓝：队友 · 橙：已发现敌人', 'White: you · Blue: team · Orange: spotted enemies'), legend.x, legend.y, legend.w, 12, C.dim, Math.floor(legend.h / 17), 17);
    if (footer && footer.h >= 14) this.text(ctx, this.L('查看地图时对局继续进行', 'The round keeps running'), footer.x, footer.y + footer.h / 2, 11, C.faint, 'left', false, footer.w);
  }
  private drawPause(ctx: Ctx, L: HudLayout) {
    const e = this.engine, title = this.L('对局已暂停', 'Match paused');
    const r = this.frame(ctx, L, 420, 352, title), sections = modalSections(r, 48, 20);
    if (e.hud.notice && !sections.scrollAll) this.text(ctx, e.hud.notice.text, r.x + 20, r.y + sections.headerH - 9, 10, C.gold, 'left', false, r.w - 40);
    const { body } = sections, top = body.y + (sections.scrollAll ? 56 : 0);
    const items = [
      { id: 'pause-settings', label: this.L('设置', 'Settings'), run: () => e.openSettings() },
      { id: 'pause-scoreboard', label: this.L('比赛记分板', 'Scoreboard'), run: () => { e.hud.scoreboardOpen = true; } },
      { id: 'pause-radio', label: e.player?.alive ? this.L('无线电指令', 'Radio commands') : this.L('无线电（阵亡不可用）', 'Radio (alive players only)'), disabled: !e.player?.alive, run: () => e.openRadio('radio1') },
      { id: 'pause-restart', label: this.L('重新开始', 'Restart match'), run: () => e.startMatch() },
      { id: 'pause-menu', label: this.L('返回主菜单', 'Back to menu'), run: () => e.toMenu() },
    ];
    const contentH = items.length * 56 - 12;
    this.pauseScroll.setMax(contentH + (sections.scrollAll ? 116 : 0) - body.h);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.pauseScroll);
    if (sections.scrollAll) this.inlineHeader(ctx, body, title);
    items.forEach((item, i) => this.button(ctx, body.x, top + i * 56, body.w, 44, item.label, item.run, { id: item.id, disabled: item.disabled }));
    if (sections.scrollAll) this.button(ctx, body.x, top + contentH + 12, body.w, 48, this.L('继续对局', 'Resume match'), () => e.resumeGame(), { id: 'pause-resume', primary: true });
    this.endScroll(ctx); this.scrollbar(ctx, this.pauseScroll, body.x + body.w + 5, body.y, body.h);
    if (sections.footer) {
      const f = sections.footer; uiRule(ctx, r.x + 1, f.y - (sections.compact ? 4 : 12), r.w - 2);
      this.button(ctx, f.x, f.y, f.w, f.h, this.L('继续对局', 'Resume match'), () => e.resumeGame(), { id: 'pause-resume', primary: true });
    }
  }
  private drawMatchEnd(ctx: Ctx, L: HudLayout) {
    const e = this.engine, end = e.hud.matchEnd!;
    const r = this.frame(ctx, L, 480, 380, end.title), sections = modalSections(r, 48, 20);
    const { body } = sections, x = body.x, w = body.w, top = body.y + (sections.scrollAll ? 56 : 0);
    this.resultScroll.setMax(176 + (sections.scrollAll ? 116 : 0) - body.h);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.resultScroll);
    if (sections.scrollAll) this.inlineHeader(ctx, body, end.title);
    uiHudPlate(ctx, x, top, w, 56, end.won ? C.gold : C.blue);
    this.text(ctx, 'CT', x + 12, top + 28, 13, C.blue, 'left', true);
    this.text(ctx, 'T', x + w - 12, top + 28, 13, C.gold, 'right', true);
    uiNumber(ctx, end.score, x + w / 2, top + 28, w < 240 ? 26 : 36, end.won ? C.gold : C.text, 'center', w - 64);
    uiParagraph(ctx, end.stats, x, top + 64, w, 13, C.dim, 2, 20);
    this.button(ctx, x, top + 116, w, 44, this.L('返回主菜单', 'Back to menu'), () => e.toMenu(), { id: 'result-menu' });
    if (sections.scrollAll) this.button(ctx, x, top + 188, w, 48, this.L('再来一局', 'Play again'), () => e.startMatch(), { id: 'result-replay', primary: true });
    this.endScroll(ctx); this.scrollbar(ctx, this.resultScroll, x + w + 5, body.y, body.h);
    if (sections.footer) {
      const f = sections.footer; uiRule(ctx, r.x + 1, f.y - (sections.compact ? 4 : 12), r.w - 2);
      this.button(ctx, f.x, f.y, f.w, f.h, this.L('再来一局', 'Play again'), () => e.startMatch(), { id: 'result-replay', primary: true });
    }
  }

  private drawRadio(ctx: Ctx, L: HudLayout) {
    const e = this.engine, radio = e.hud.radio!;
    const close = { id: 'radio-close', run: () => e.closeRadio() };
    const r = this.frame(ctx, L, 420, 576, radio.title, close), sections = modalSections(r, 44);
    const { body } = sections, top = body.y + (sections.scrollAll ? 56 : 0);
    if (this.lastRadioMenu !== e.radioMenu) { this.radioScroll.setMax(0); this.lastRadioMenu = e.radioMenu; }
    const contentH = radio.options.length * 52 - 8;
    this.radioScroll.setMax(contentH + (sections.scrollAll ? 112 : 0) - body.h);
    const tabs = (box: HudRect) => {
      const w = (box.w - 12) / 3;
      [['radio1', this.L('指令', 'Orders')], ['radio2', this.L('战术', 'Tactics')], ['radio3', this.L('报告', 'Reports')]].forEach(([id, label], i) =>
        this.button(ctx, box.x + i * (w + 6), box.y, w, 44, label, () => e.openRadio(id), { id: `radio-group-${id}`, selected: e.radioMenu === id, small: true }));
    };
    if (!sections.scrollAll) this.text(ctx, e.phase === 'paused' ? this.L('对局暂停 · 数字键选择', 'Paused · number keys select') : this.L('对局继续 · 数字键选择', 'Round live · number keys select'), r.x + 20, r.y + sections.headerH - 9, 10, C.dim, 'left', false, sections.close ? sections.close.x - r.x - 32 : r.w - 40);
    this.beginScroll(ctx, body.x, body.y, body.w, body.h, this.radioScroll);
    if (sections.scrollAll) this.inlineHeader(ctx, body, radio.title, close);
    radio.options.forEach((option, i) => this.button(ctx, body.x, top + i * 52, body.w, 44, `${i + 1}  ${option}`, () => e.chooseRadio(i), { id: `radio-choice-${i + 1}` }));
    if (sections.scrollAll) tabs({ x: body.x, y: top + contentH + 12, w: body.w, h: 44 });
    this.endScroll(ctx); this.scrollbar(ctx, this.radioScroll, body.x + body.w + 5, body.y, body.h);
    if (sections.footer) { uiRule(ctx, r.x + 1, sections.footer.y - 4, r.w - 2); tabs(sections.footer); }
  }

  private drawMatchHud(ctx: Ctx, L: HudLayout) {
    const e = this.engine, h = e.hud, { W, H } = L;
    // Optic masking belongs to the world layer. Painting it after HUD panels
    // would blacken the radar, score and objective outside the lens.
    this.drawAimUnderlay(ctx, W, H);
    const radar = radarRect(L), rs = radar.w;
    e.drawRadarContent(ctx, radar.x, radar.y, rs);
    if (!L.short) {
      ctx.fillStyle = UI.hud; ctx.fillRect(radar.x, radar.y + rs + 3, rs, 18);
      this.text(ctx, h.location, radar.x + rs / 2, radar.y + rs + 12, 11, C.dim, 'center', false, rs - 8);
    }
    const score = scoreStripRect(L, rs), { x: sx, y: sy, w: sw } = score;
    this.panel(ctx, sx, sy, sw, score.h, true);
    ctx.fillStyle = 'rgba(112,170,209,.17)'; ctx.fillRect(sx, sy, 46, score.h);
    ctx.fillStyle = 'rgba(197,170,103,.17)'; ctx.fillRect(sx + sw - 46, sy, 46, score.h);
    ctx.fillStyle = C.blue; ctx.fillRect(sx, sy, 46, 2);
    ctx.fillStyle = C.gold; ctx.fillRect(sx + sw - 46, sy, 46, 2);
    uiNumber(ctx, String(h.ctScore), sx + 23, sy + 24, 24, C.blue, 'center');
    uiNumber(ctx, String(h.tScore), sx + sw - 23, sy + 24, 24, C.gold, 'center');
    this.text(ctx, h.roundLabel, sx + sw / 2, sy + 12, 11, C.dim, 'center', false, sw - 76);
    this.text(ctx, h.timerText, sx + sw / 2, sy + 31, 16, h.timerUrgent ? C.red : C.text, 'center', true);
    this.pips(ctx, h.alivePips.ct, sx + 10, sy + score.h + 6, C.blue);
    this.pips(ctx, h.alivePips.t, sx + sw - 10 - h.alivePips.t.length * 10, sy + score.h + 6, C.amber);
    uiFont(ctx, 13);
    const hitConfirmationWidth = h.hitOpacity > 0 && h.hitConfirmation ? Math.ceil(ctx.measureText(h.hitConfirmation).width) + 12 : undefined;
    uiFont(ctx, 11);
    const scopeLabelWidth = h.scope && h.scopeLabel ? Math.ceil(ctx.measureText(h.scopeLabel).width) + 12 : undefined;
    const feedback = matchFeedbackLayout(L, { touch: e.touchMode, hasBuy: !!h.money,
      objective: !!h.objective, objectiveAction: !!h.objectiveAction, center: !!h.center,
      notice: !!h.notice && !h.center, pickup: !!h.pickup, killfeedCount: Math.min(3, h.killfeed.length),
      hitConfirmationWidth, scopeLabelWidth });
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
      ctx.fillStyle = ['ELIMINATED', 'RESPAWNING'].includes(h.center.kicker) ? C.red : C.gold;
      ctx.fillRect(r.x, r.y, 3, r.h);
      this.text(ctx, h.center.title, r.x + r.w / 2, r.y + (r.h < 80 ? 18 : 25), 20, C.text, 'center', true, r.w - 24);
      this.text(ctx, h.center.detail, r.x + r.w / 2, r.y + (r.h < 80 ? 42 : 57), 12, C.dim, 'center', false, r.w - 24);
    }
    if (h.notice && feedback.notice) message(feedback.notice, h.notice.text);
    if (h.pickup && feedback.pickup) message(feedback.pickup, this.L('拾取 · ', 'Pick up · ') + h.pickup.name);
    const kills = h.killfeed.slice(-feedback.killfeed.length);
    feedback.killfeed.forEach((r, i) => this.drawKillfeedRow(ctx, r, kills[i]));
    if (h.hitOpacity > 0 && feedback.hitConfirmation) {
      const r = feedback.hitConfirmation;
      ctx.save(); ctx.globalAlpha *= Math.min(1, h.hitOpacity);
      this.text(ctx, h.hitConfirmation, r.x + r.w / 2, r.y + r.h / 2, 13, this.hitColor(), 'center', false, r.w - 12);
      ctx.restore();
    }
    if (h.scope && feedback.scopeLabel) {
      const r = feedback.scopeLabel;
      uiRound(ctx, r.x, r.y, r.w, r.h, UI.hud, undefined, 1);
      this.text(ctx, h.scopeLabel, r.x + r.w / 2, r.y + r.h / 2, 11, C.dim, 'center', false, r.w - 12);
    }
    const hp = healthPanelRect(L), compactHp = hp.w < 160 || hp.h < 78;
    uiHudPlate(ctx, hp.x, hp.y, hp.w, hp.h, h.healthLow ? C.red : C.gold);
    const healthY = hp.y + (h.money ? (hp.h < 78 ? 30 : 34) : 24);
    if (h.money) this.text(ctx, h.money, hp.x + 10, hp.y + 12, 11, C.green, 'left', false, hp.w - 20);
    drawHudIcon(ctx, 'health', hp.x + 10, healthY - 7, 14, 14, h.healthLow ? C.red : C.text);
    uiNumber(ctx, String(h.health), hp.x + 31, healthY, hp.h < 78 ? 22 : 24, h.healthLow ? C.red : C.text);
    const narrowVitals = hp.w < 120;
    if (compactHp) this.text(ctx, `${h.killCount} K`, hp.x + hp.w - 10, narrowVitals ? hp.y + hp.h - 13 : healthY, 11, C.dim, 'right');
    if (hp.h >= 78) uiRound(ctx, hp.x + 10, hp.y + 51, (hp.w - 20) * h.healthPct / 100, 3, h.healthLow ? C.red : C.amber, undefined, 2);
    drawHudIcon(ctx, 'armor', hp.x + 10, hp.y + hp.h - 20, 13, 13, C.dim);
    this.text(ctx, String(h.armor), hp.x + 31, hp.y + hp.h - 13, 12, C.dim, 'left', false, narrowVitals ? hp.w - 68 : compactHp ? hp.w - 41 : hp.w - 105);
    if (!compactHp) this.text(ctx, h.killCount + this.L(' 击杀', ' kills'), hp.x + hp.w - 10, hp.y + hp.h - 14, 11, C.dim, 'right');
    const wp = weaponPanelRect(L), compactWp = wp.w < 220 || wp.h < 90;
    uiHudPlate(ctx, wp.x, wp.y, wp.w, wp.h, e.player?.team === 'ct' ? C.blue : C.gold);
    const inlineFeedback = h.center && !feedback.center ? h.center.title
      : !h.center && h.notice && !feedback.notice ? h.notice.text
      : h.objective && !feedback.objective ? h.objective.text
      : h.pickup && !feedback.pickup ? this.L('拾取 · ', 'Pick up · ') + h.pickup.name : null;
    const reloading = !!e.player?.alive && e.player.reload > 0;
    const weaponIcon = !inlineFeedback && wp.w >= 240 && wp.h >= 90 && HUD_FIREARMS.has(e.gunId);
    const weaponHeading = h.center && !feedback.center ? h.center.title : compactWp && reloading ? h.reloadState : inlineFeedback || h.weaponName;
    this.text(ctx, weaponHeading, wp.x + 12, wp.y + 16, compactWp ? 12 : 14, reloading || inlineFeedback ? C.gold : C.text, 'left', true, wp.w - (weaponIcon ? 88 : 24));
    if (weaponIcon) this.drawWeaponArtwork(ctx, e.gunId, wp.x + wp.w - 70, wp.y + 8, 56, 17);
    if (h.objectiveAction && !feedback.objectiveAction) {
      // Extremely short/notched windows may have no extra feedback lane. Keep
      // active planting/defusing visible inside the existing weapon panel,
      // rather than hiding it or covering the aiming point with a fallback.
      this.text(ctx, h.objectiveAction.text, wp.x + 12, wp.y + (wp.h < 90 ? 34 : 39), 11, C.gold, 'left', false, wp.w - 24);
      uiRound(ctx, wp.x + 12, wp.y + wp.h - 34, wp.w - 24, 3, C.border, undefined, 2);
      uiRound(ctx, wp.x + 12, wp.y + wp.h - 34, (wp.w - 24) * h.objectiveAction.progress01, 3, C.amber, undefined, 2);
    } else {
      uiNumber(ctx, `${h.ammoText} / ${h.reserveText}`, wp.x + wp.w - 12, wp.y + (compactWp ? 39 : 44), compactWp ? 20 : 26, C.text, 'right', wp.w - 24);
      if (!compactWp) this.text(ctx, !e.player?.alive && e.player?.reload > 0 ? this.L('已阵亡', 'Eliminated') : h.reloadState, wp.x + 12, wp.y + 44, 11, C.dim, 'left', false, Math.max(0, wp.w - 150));
    }
    const slots = h.slots, gap = 4, bw = (wp.w - 24 - gap * (slots.length - 1)) / Math.max(1, slots.length);
    slots.forEach((s, i) => {
      const x = wp.x + 12 + i * (bw + gap), y = wp.y + wp.h - 27;
      ctx.fillStyle = s.equipped ? 'rgba(204,178,118,.18)' : 'rgba(255,255,255,.035)'; ctx.fillRect(x, y, bw, 19);
      if (s.equipped) { ctx.fillStyle = C.gold; ctx.fillRect(x, y + 17, bw, 2); }
      this.text(ctx, s.key === 'grenade' ? `${s.num}·${h.grenadeCount}` : String(s.num), x + bw / 2, y + 10, 11, s.empty ? C.faint : s.equipped ? C.gold : C.dim, 'center', s.equipped);
    });
    if (h.damageOpacity > 0) { ctx.globalAlpha = Math.min(1, h.damageOpacity); ctx.strokeStyle = '#c33327'; ctx.lineWidth = 20; ctx.strokeRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (e.touchMode) this.drawTouchControls(ctx, L);
    this.drawHitMarker(ctx, W, H);
  }
  private drawKillfeedRow(ctx: Ctx, r: HudRect, k: CsHudView['killfeed'][number]) {
    const columns = killfeedColumns(r, k.head), cy = r.y + r.h / 2;
    this.panel(ctx, r.x, r.y, r.w, r.h, true);
    if (k.aMe) { ctx.strokeStyle = 'rgba(214,113,89,.8)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1); }
    this.text(ctx, k.aName, columns.attacker.x, cy, 11, k.aTeam === 'ct' ? C.blue : C.amber, 'left', false, columns.attacker.w);
    const art = columns.weapon;
    // Use the historical event ID, not a translated label or the current gun:
    // switching weapons after a kill must not change its recorded silhouette.
    const iconId = k.weaponIconId || (k.weaponId !== 'knife' ? k.weaponId : undefined);
    const known = !!iconId && (HUD_FIREARMS.has(iconId) || HUD_KNIVES.has(iconId) || iconId === 'he' || iconId === 'c4');
    const drawn = known && this.drawWeaponArtwork(ctx, iconId, art.x, art.y, art.w, art.h);
    if (!drawn) this.text(ctx, k.weapon, art.x + art.w / 2, cy, 11, C.dim, 'center', false, art.w);
    if (columns.head) drawHudIcon(ctx, 'headshot', columns.head.x, cy - 8, columns.head.w, 16, C.gold);
    this.text(ctx, k.bName, columns.victim.x + columns.victim.w, cy, 11, k.bTeam === 'ct' ? C.blue : C.amber, 'right', false, columns.victim.w);
  }
  private hitColor(): string {
    const h = this.engine.hud;
    // Hit-confirmation colors and exact aiming geometry are independent of menu styling.
    return h.hitKind === 'kill' ? '#f4c77e' : h.hitHead ? '#f4b45f' : '#fff';
  }
  /** Aim is the camera's raw viewport center, never the safe-content center. */
  private drawAimUnderlay(ctx: Ctx, W: number, H: number) {
    const e = this.engine, h = e.hud, { x, y, scopeRadius: r } = aimGeometry(W, H);
    ctx.save();
    if (!h.crosshairHidden && !h.scope && e.player?.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const gap = h.crosshairGap, len = 7;
      ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
      ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len); ctx.stroke();
    }
    if (h.scope) {
      ctx.fillStyle = 'rgba(0,0,0,.94)'; ctx.beginPath(); ctx.rect(0, 0, W, H);
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill('evenodd');
      ctx.strokeStyle = '#10151a'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    }
    ctx.restore();
  }
  /** Font-independent, symmetric arms surround the same point as the reticle. */
  private drawHitMarker(ctx: Ctx, W: number, H: number) {
    const h = this.engine.hud;
    if (!(h.hitOpacity > 0)) return;
    const { x, y } = aimGeometry(W, H), inner = 4, outer = h.hitKind === 'kill' ? 12 : 10;
    ctx.save(); ctx.globalAlpha *= Math.min(1, h.hitOpacity);
    ctx.strokeStyle = this.hitColor(); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.moveTo(x + sx * inner, y + sy * inner);
      ctx.lineTo(x + sx * outer, y + sy * outer);
    }
    ctx.stroke(); ctx.restore();
  }
  private pips(ctx: Ctx, states: string[], x: number, y: number, color: string) {
    states.forEach((state, i) => {
      ctx.fillStyle = state === 'dead' ? '#54616b' : state === 'me' ? C.text : color;
      ctx.fillRect(x + i * 10 + 1, y - 3, 6, state === 'dead' ? 1 : 5);
    });
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
