import { BaseGame, type GameHost, type GameViewport } from '@carrick/game-sdk/game';
import { BUILDINGS, BUILDING_KINDS, UNITS, UNIT_KINDS } from './content.js';
import { MAPS, getMap } from './maps.js';
import { createWorld, createImportedWorld, stepWorld, build, canBuild, getStats, getBuilding, deployBase, produceUnit, moveUnit, demolish, endSession, validateWorld } from './simulation.js';
import type { World, BuildingKind, CreateWorldOptions, UnitKind } from './types.js';
import { renderWorld, project, pickTile, pickClassicBuilding, groundHeight, centerCamera, type Camera, type Point } from './renderer.js';
import { IndexedDbBackend, WorldRepository, MAX_SAVE_BYTES, type SaveEnvelope } from './storage.js';
import { AssetInspector } from './assetInspector.js';
import { ClassicImporter } from './classicImport.js';
import { ClassicStorage, type ClassicSummary } from './classicStorage.js';
import { ClassicView } from './classicView.js';
import { drawClassicPanel, fillClassicCatalog } from './classicPanel.js';
import { CityLife } from './cityLife.js';
import type { ClassicBundle, ClassicImportOptions } from './classicTypes.js';
import './ui.css';

type Panel = 'worlds' | 'build' | 'manage' | 'materials' | 'classics' | 'end' | null;
const reasonZh: Record<string, string> = {
  'ended': '这一局已经结束', 'invalid-kind': '不支持的建造类型', 'out-of-bounds': '请选择地图内的空地',
  'invalid-position': '无法放在这里', 'blocked-terrain': '水面、岩石和矿脉不能直接建造',
  'occupied': '这里已有建筑', 'unit-in-way': '请先移开这里的车辆', 'insufficient-funds': '资金不足，等待采矿或城市收入',
  'needs-yard': '请先展开建设基地', 'deploy-mcv': '请使用展开基地按钮', 'building-limit': '已到本地图建筑上限',
  'unit-limit': '车辆与工程师已到上限', 'id-limit': '世界已到容量上限', 'not-found': '对象已不存在',
  'needs-shore': '港务站需要靠近水域', 'needs-producer': '请先完成对应的生产建筑', 'no-exit': '生产建筑旁没有通行出口',
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node;
}
function newId() { return `home-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`; }
export class RedHomesteadGame extends BaseGame {
  world!: World;
  private camera: Camera = { x: 480, y: 150, zoom: 1 };
  private selected: string | null = null;
  private hover: Point | null = null;
  private placing: BuildingKind | null = null;
  private panel: Panel = 'worlds';
  private paused = false;
  private layer: HTMLDivElement | null = null;
  private statsNode: HTMLDivElement | null = null;
  private statusNode: HTMLDivElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private panelNode: HTMLDivElement | null = null;
  private statsKey = '';
  private language = '';
  private message = '';
  private messageUntil = 0;
  private drag: { start: Point; last: Point; moved: boolean } | null = null;
  private keys = new Set<string>();
  private saves: SaveEnvelope<World>[] = [];
  private recoveries: SaveEnvelope<World>[] = [];
  private repo: WorldRepository<World> | null = null;
  private saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  private saveError = '';
  private lastSaveTime = 0;
  private savePending = 0;
  private generation = 0;
  private disposed = false;
  private busy = false;
  private busyButtons = new Map<HTMLButtonElement, boolean>();
  private started = false;
  private overlayOpen = false;
  private inspector = new AssetInspector();
  private inspectionSequence = 0;
  private classicImporter = new ClassicImporter();
  private classicStorage: ClassicStorage | null = null;
  private classicCatalog: ClassicSummary[] = [];
  private classicView: ClassicView | null = null;
  private life = new CityLife();
  private facings = new Map<string, number>();
  private panelError = '';
  private text(zh: string, en: string) { return this.isZhLang() ? zh : en; }
  constructor(host: GameHost) { super(host); }
  init() {
    if (this.world?.mode === 'homestead' && this.started) void this.saveHome();
    this.generation++; this.inspectionSequence++; this.inspector.cancel(); this.classicImporter.cancel(); this.disposed = false; this.layer?.remove();
    this.classicView?.destroy(); this.classicView = null; this.life.reset(); this.facings.clear(); this.panelError = '';
    if (!this.classicStorage) this.classicStorage = new ClassicStorage();
    this.world = createWorld({ mode: 'session', mapId: MAPS[0]!.id, economy: 'classic' });
    this.camera = centerCamera(this.world, this.width, this.height);
    this.selected = null; this.placing = null; this.hover = null; this.paused = false; this.started = false;
    this.drag = null; this.keys.clear(); this.panel = 'worlds'; this.saveState = 'idle'; this.lastSaveTime = 0;
    this.message = ''; this.statsKey = ''; this.language = this.isZhLang() ? 'zh' : 'en';
    if (!this.repo) {
      try { this.repo = new WorldRepository(new IndexedDbBackend(), validateWorld); }
      catch { this.saveState = 'error'; this.saveError = 'storage-unavailable'; }
    }
    this.mount(); this.refreshSaves(); void this.refreshClassicCatalog();
  }
  protected onStart() {
    const wheel = (event: WheelEvent) => {
      if (this.presentationPaused || this.modalOpen() || this.world.status === 'ended') return;
      event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, this.canvasPoint(event.clientX, event.clientY));
    };
    const context = (event: Event) => event.preventDefault();
    const blur = () => { this.drag = null; this.keys.clear(); };
    const visibility = () => { blur(); if (document.hidden) void this.saveHome(); };
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.canvas.addEventListener('contextmenu', context);
    this.canvas.addEventListener('touchcancel', blur);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', visibility);
    this.registerCleanup(() => {
      this.canvas.removeEventListener('wheel', wheel); this.canvas.removeEventListener('contextmenu', context);
      this.canvas.removeEventListener('touchcancel', blur); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', visibility);
    });
    this.host.presentation?.setActions?.([
      { id: 'rh-worlds', label: 'Worlds & backups', labelZh: '世界与备份', run: () => this.openPanel('worlds') },
      { id: 'rh-classics', label: 'Classic materials & maps', labelZh: '经典素材与地图', run: () => this.openPanel('classics') },
      { id: 'rh-materials', label: 'Source inspector', labelZh: '素材检视工具', run: () => this.openPanel('materials') },
    ]);
  }
  restart() {
    if (this.started && this.world?.mode === 'homestead') {
      // A host restart must never silently discard a persistent world, especially on write failure.
      this.openPanel('worlds');
      return;
    }
    super.restart();
  }
  setViewport(viewport: GameViewport) {
    const oldWidth = this.width, oldHeight = this.height;
    this.camera.x += (viewport.width - oldWidth) / 2; this.camera.y += (viewport.height - oldHeight) / 2;
    this.resizeLogicalViewport(viewport);
  }
  onShellOverlayChange(open: boolean) {
    this.overlayOpen = open; this.drag = null; this.keys.clear();
    if (this.layer) this.layer.hidden = open;
    if (open) void this.saveHome();
  }
  private modalOpen() { return this.panel != null && this.panel !== 'build'; }
  update(dt: number) {
    if (this.disposed) return;
    const language = this.isZhLang() ? 'zh' : 'en';
    if (language !== this.language) { this.language = language; this.mount(); }
    if (this.started && !this.paused && !this.modalOpen() && !document.hidden && this.world.status === 'playing') {
      stepWorld(this.world, dt); this.life.update(this.world, dt);
      const speed = 350 * dt;
      if (this.keys.has('ArrowLeft')) this.camera.x += speed;
      if (this.keys.has('ArrowRight')) this.camera.x -= speed;
      if (this.keys.has('ArrowUp')) this.camera.y += speed;
      if (this.keys.has('ArrowDown')) this.camera.y -= speed;
      if (this.world.mode === 'homestead' && this.world.time - this.lastSaveTime >= 8 && this.savePending === 0) {
        this.lastSaveTime = this.world.time; void this.saveHome();
      }
    }
    this.updateStatus();
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (!this.world) return;
    const valid = this.placing && this.hover ? canBuild(this.world, this.placing, this.hover.x, this.hover.y).ok : false;
    renderWorld(ctx, this.world, this.camera, { selected: this.selected, hover: this.hover, building: this.placing, valid, grid: !!this.placing,
      classic: this.classicView, residents: this.life.residents, facings: this.facings }, this.width, this.height);
    if (this.world.status === 'ended') this.drawResultOverlay(ctx, {
      title: this.text('这一座城，留作纪念', 'A city to remember'),
      details: [this.text(`建设 ${this.world.buildings.length} 处 · 居民 ${getStats(this.world).population}`, `${this.world.buildings.length} places · ${getStats(this.world).population} residents`)],
      hint: this.text('点击、轻点或按 Enter，开始新的一局', 'Click, tap or press Enter for another session'), tone: 'success',
    });
  }
  handleInput(event: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.disposed || this.presentationPaused || this.overlayOpen || !this.world) return;
    // The shell releases held input on window itself; Window/Document are not Elements.
    const target = event.target instanceof Element ? event.target : null;
    if (target && target !== this.canvas && target.closest('button,input,select,textarea,[role=dialog]')) return;
    if (this.world.status === 'ended') {
      if (this.isRestartInput(event)) { event.preventDefault(); this.openPanel('worlds'); }
      return;
    }
    if (event instanceof KeyboardEvent) {
      if (event.type === 'keyup') { this.keys.delete(event.key); return; }
      if (event.key === 'Escape') {
        event.preventDefault(); this.placing = null; this.selected = null; this.keys.clear();
        if (this.panel && this.started) this.openPanel(null); else this.rebuildToolbar(); return;
      }
      if (this.modalOpen()) return;
      if (event.key.startsWith('Arrow')) { event.preventDefault(); this.keys.add(event.key); return; }
      if (event.repeat) return;
      if (event.key === 'b' || event.key === 'B') { event.preventDefault(); this.openPanel(this.panel === 'build' ? null : 'build'); }
      if (event.key === ' ') { event.preventDefault(); this.togglePause(); }
      if (event.key === '+' || event.key === '=') this.zoom(1.12);
      if (event.key === '-') this.zoom(1 / 1.12);
      return;
    }
    if (this.modalOpen() || !this.started) return;
    let point: Point, start = false, end = false;
    if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
      event.preventDefault();
      if (event.touches.length > 1) { this.drag = null; return; }
      const touch = event.changedTouches[0]; if (!touch) return;
      point = this.canvasPoint(touch.clientX, touch.clientY); start = event.type === 'touchstart'; end = event.type === 'touchend';
    } else {
      const mouse = event as MouseEvent; point = this.canvasPoint(mouse.clientX, mouse.clientY);
      if (mouse.type === 'mousedown' && mouse.button === 2) {
        if (this.placing) { this.placing = null; this.rebuildToolbar(); return; }
        const cell = pickTile(this.world, point.x, point.y, this.camera);
        if (this.selected && !moveUnit(this.world, this.selected, cell.x, cell.y)) this.notice(this.text('这里不可到达', 'That tile is unreachable'));
        return;
      }
      if (mouse.button > 0 && mouse.type !== 'mousemove') return;
      start = mouse.type === 'mousedown'; end = mouse.type === 'mouseup';
    }
    this.hover = pickTile(this.world, point.x, point.y, this.camera);
    if (start) this.drag = { start: point, last: point, moved: false };
    else if (end && this.drag) {
      const drag = this.drag; this.drag = null;
      if (!drag.moved) this.clickWorld(point);
    } else if (this.drag) {
      const delta = Math.hypot(point.x - this.drag.start.x, point.y - this.drag.start.y);
      if (delta > 7) this.drag.moved = true;
      if (this.drag.moved) { this.camera.x += point.x - this.drag.last.x; this.camera.y += point.y - this.drag.last.y; }
      this.drag.last = point;
    }
  }
  private clickWorld(point: Point) {
    const cell = pickTile(this.world, point.x, point.y, this.camera);
    if (this.placing) {
      const result = build(this.world, this.placing, cell.x, cell.y);
      if (result.ok) {
        this.notice(this.text('建设已安排', 'Construction queued')); void this.saveHome();
      } else this.notice(this.isZhLang() ? reasonZh[result.reason] ?? result.reason : result.reason.replace(/-/g, ' '));
      return;
    }
    const unit = this.world.units.find(u => u.x === cell.x && u.y === cell.y);
    const building = pickClassicBuilding(this.world, this.camera, point, this.classicView) ?? getBuilding(this.world, cell.x, cell.y);
    if (unit || building) { this.selected = (unit ?? building)!.id; this.rebuildToolbar(); return; }
    if (this.selected && this.world.units.some(u => u.id === this.selected)) {
      if (!moveUnit(this.world, this.selected, cell.x, cell.y)) this.notice(this.text('这里不可到达', 'That tile is unreachable'));
    } else { this.selected = null; this.rebuildToolbar(); }
  }
  private zoom(factor: number, point: Point = { x: this.width / 2, y: this.height / 2 }) {
    const next = Math.max(.45, Math.min(2, this.camera.zoom * factor)), ratio = next / this.camera.zoom;
    this.camera.x = point.x - (point.x - this.camera.x) * ratio; this.camera.y = point.y - (point.y - this.camera.y) * ratio; this.camera.zoom = next;
    this.renderFrame();
  }
  private togglePause() { this.paused = !this.paused; this.keys.clear(); this.rebuildToolbar(); this.updateStatus(); }
  private notice(text: string) { this.message = text; this.messageUntil = this.gameNow() + 6000; this.updateStatus(); }
  private button(text: string, action: string, run: () => void, className?: string) {
    const button = el('button', text, className); button.type = 'button'; button.dataset.rhAction = action;
    button.addEventListener('click', event => { event.stopPropagation(); if (!this.disposed && !this.presentationPaused) run(); }); return button;
  }
  private mount() {
    this.layer?.remove(); this.layer = el('div', undefined, 'rh-ui'); this.layer.dataset.rhUi = 'true'; this.layer.hidden = this.overlayOpen;
    const root = this.canvas.closest('#gameApp') ?? this.canvas.parentElement; root?.append(this.layer);
    this.statsNode = el('div', undefined, 'rh-stats'); this.statsNode.setAttribute('aria-label', this.text('城市状态', 'City status'));
    this.statusNode = el('div', undefined, 'rh-status'); this.statusNode.setAttribute('role', 'status');
    this.toolbar = el('div', undefined, 'rh-toolbar'); this.panelNode = el('div');
    this.layer.append(this.statsNode, this.statusNode, this.toolbar, this.panelNode);
    this.statsKey = ''; this.rebuildToolbar(); this.drawPanel(); this.updateStatus();
  }
  private rebuildToolbar() {
    if (!this.toolbar) return; this.toolbar.replaceChildren();
    if (!this.started || this.world.status === 'ended') { this.toolbar.hidden = true; return; } this.toolbar.hidden = false;
    const buildButton = this.button(this.placing ? this.text('取消建造', 'Cancel') : this.text('建造', 'Build'), 'build', () => {
      if (this.placing) { this.placing = null; this.openPanel(null); } else this.openPanel(this.panel === 'build' ? null : 'build');
    });
    buildButton.setAttribute('aria-pressed', String(this.panel === 'build' || !!this.placing)); this.toolbar.append(buildButton);
    if (this.world.units.some(u => u.kind === 'mcv')) this.toolbar.append(this.button(this.text('展开基地', 'Deploy base'), 'deploy', () => {
      if (deployBase(this.world)) { this.notice(this.text('建设基地已展开。先建发电厂，再建精炼厂。', 'Base deployed. Build power, then an ore refinery.')); void this.saveHome(); this.rebuildToolbar(); }
      else this.notice(this.text('请把建设车移动到足够开阔的空地', 'Move the construction vehicle to clear ground'));
    }, 'rh-primary'));
    if (this.selected && this.world.buildings.some(b => b.id === this.selected)) this.toolbar.append(this.button(this.text('管理', 'Manage'), 'manage', () => this.openPanel('manage')));
    this.toolbar.append(this.button(this.paused ? this.text('继续', 'Resume') : this.text('暂停', 'Pause'), 'pause', () => this.togglePause()));
    this.toolbar.append(this.button(this.text('家园', 'Worlds'), 'worlds', () => this.openPanel('worlds')));
    this.toolbar.append(el('span', undefined, 'rh-spacer'));
    this.toolbar.append(this.button('−', 'zoom-out', () => this.zoom(1 / 1.12)), this.button('+', 'zoom-in', () => this.zoom(1.12)));
  }
  private updateStatus() {
    if (!this.statsNode || !this.statusNode || !this.world) return;
    const stats = getStats(this.world);
    const values = [this.world.economy === 'creative' ? this.text('自由营造', 'Creative') : `$ ${Math.floor(stats.money).toLocaleString()}`,
      `${this.text('电力', 'Power')} ${stats.powerProduced - stats.powerUsed}`,
      `${this.text('居民', 'People')} ${stats.population}/${stats.capacity}`,
      `${this.text('宜居', 'Comfort')} ${Math.round(stats.happiness)}%`];
    const key = values.join('|'); if (this.statsKey !== key) { this.statsKey = key; this.statsNode.replaceChildren(...values.map(value => el('span', value))); }
    const info = this.placing ? this.text(`放置：${BUILDINGS[this.placing].labelZh} · 点空地建造，拖动看地图`, `Place ${BUILDINGS[this.placing].labelEn} · tap ground; drag to pan`)
      : this.message && this.gameNow() < this.messageUntil ? this.message
      : this.paused ? this.text('已暂停', 'Paused')
      : this.world.mode === 'homestead' ? this.text('长住家园', 'Homestead') : this.text('悠闲一局', 'Free session');
    const save = this.world.mode === 'homestead' ? this.saveState === 'error' ? this.text(' · 保存失败，请导出备份', ' · Save failed; export a backup') : this.saveState === 'saving' ? this.text(' · 正在保存', ' · Saving') : this.saveState === 'saved' ? this.text(' · 已保存到此浏览器', ' · Saved in this browser') : this.text(' · 尚未保存', ' · Not saved yet') : '';
    const materials = this.classicView ? this.text(`本地素材 ${Object.keys(this.classicView.bundle.buildings).length} 建筑 / ${Object.keys(this.classicView.bundle.units).length} 单位`, `Local art: ${Object.keys(this.classicView.bundle.buildings).length} buildings / ${Object.keys(this.classicView.bundle.units).length} units`) : this.text('原创练习场', 'Authored practice scenery');
    const origin = this.world.source ? this.text('原始地图地形', 'Imported map terrain') : materials;
    const message = `${info}${save} · ${origin}`;
    if (this.statusNode.textContent !== message) this.statusNode.textContent = message;
  }
  private openPanel(panel: Panel) {
    if (this.busy) { this.notice(this.text('正在安全载入，请稍候；仍可使用游戏库退出。', 'Loading safely; please wait. The game library remains available.')); return; }
    if (panel !== 'classics') this.classicImporter.cancel();
    this.panelError = '';
    if (panel !== 'materials') { this.inspectionSequence++; this.inspector.cancel(); }
    this.panel = panel; this.drag = null; this.keys.clear();
    if (panel !== 'build') this.placing = null;
    if (panel === 'worlds') { void this.saveHome().then(() => this.refreshSaves()); }
    if (panel === 'classics') void this.refreshClassicCatalog();
    this.drawPanel(); this.rebuildToolbar(); this.renderFrame();
  }
  private drawPanel() {
    if (!this.panelNode) return; this.panelNode.replaceChildren(); if (!this.panel) return;
    if (this.panel === 'build') { this.drawBuildPanel(); return; }
    const wrap = el('div', undefined, 'rh-dialog-wrap'), dialog = el('div', undefined, 'rh-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
    wrap.append(dialog); this.panelNode.append(wrap);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.started) { event.preventDefault(); event.stopPropagation(); this.openPanel(null); if (!this.busy) this.canvas.focus(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')].filter(node => !node.hidden);
        const first = items[0], last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); first?.focus(); }
      }
    });
    if (this.panel === 'worlds') this.drawWorldPanel(dialog);
    if (this.panel === 'manage') this.drawManagePanel(dialog);
    if (this.panel === 'end') {
      dialog.append(el('h2', this.text('结束这一局？', 'End this session?')),
        el('p', this.text('结束后采矿、建造和城市时间全部停止。本局不会保存为长期家园。', 'Mining, construction and city time will stop. This session is not saved as a homestead.')));
      dialog.append(this.button(this.text('结束并留作纪念', 'End session'), 'confirm-end', () => {
        endSession(this.world); this.submitScoreOnce(this.world.buildings.length); this.panel = null; this.drawPanel(); this.rebuildToolbar(); this.renderFrame();
      }, 'rh-primary'));
    }
    if (this.panel === 'materials') this.drawMaterialsPanel(dialog);
    if (this.panel === 'classics') drawClassicPanel(dialog, this.classicPanelHost());
    const error = el('p', this.panelError, 'rh-error'); error.dataset.rhPanelError = 'true'; error.setAttribute('role', 'alert'); dialog.append(error);
    if (!this.started && this.panel === 'classics') dialog.append(this.button(this.text('返回世界选择', 'Back to worlds'), 'back-worlds', () => this.openPanel('worlds')));
    if (this.started) dialog.append(this.button(this.text('返回城市', 'Return to city'), 'close-panel', () => this.openPanel(null)));
    queueMicrotask(() => { if (dialog.isConnected && !this.overlayOpen) dialog.focus({ preventScroll: true }); });
  }
  private drawBuildPanel() {
    const tray = el('div', undefined, 'rh-tray'); tray.setAttribute('aria-label', this.text('建造目录', 'Construction catalog'));
    const head = el('div', undefined, 'rh-tray-head'); head.append(el('strong', this.text('建设城市', 'Build your city')), this.button('×', 'close-build', () => this.openPanel(null)));
    const grid = el('div', undefined, 'rh-build-grid');
    for (const kind of BUILDING_KINDS.filter(kind => kind !== 'yard')) {
      const def = BUILDINGS[kind]; const button = this.button(this.isZhLang() ? def.labelZh : def.labelEn, `build-${kind}`, () => {
        this.placing = kind; this.panel = null; this.drawPanel(); this.rebuildToolbar(); this.notice(this.text('选择空地放置，拖动可移动视野', 'Choose clear ground; drag to pan'));
      });
      button.append(el('small', `$${def.cost} · ${def.footprint.width}×${def.footprint.height}`)); grid.append(button);
    }
    tray.append(head, grid); this.panelNode!.append(tray);
  }
  private drawWorldPanel(dialog: HTMLDivElement) {
    dialog.append(el('h2', this.text('红色家园', 'Red Homestead')),
      el('p', this.text('熟悉的建设节奏，这次只为生活。', 'Build a place to live. No battles, no rush.')),
      el('p', this.text('先行版：内置三张原创练习场，也可导入本地经典素材与地图，参与实际建造和采矿。桥梁、布景与原版光照仍在完善，不是完整红警2复刻。', 'Early access: three authored practice maps, plus local classic materials and playable terrain imports. Bridges, scenery and original lighting are still being developed; this is not a complete RA2 recreation.'), 'rh-note'));
    const mapLabel = el('label', this.text('地图', 'Map')), map = el('select'); map.dataset.rhField = 'map'; mapLabel.append(map);
    for (const item of MAPS) { const option = el('option', this.isZhLang() ? item.labelZh : item.labelEn); option.value = item.id; map.append(option); }
    map.value = getMap(this.world.mapId) ? this.world.mapId : MAPS[0]!.id;
    const economyLabel = el('label', this.text('经济', 'Economy')), economy = el('select'); economy.dataset.rhField = 'economy'; economyLabel.append(economy);
    for (const [value, title] of [['classic', this.text('经典经营 · 采矿与城市收入', 'Classic · mining and city income')], ['creative', this.text('自由营造 · 不消耗资金', 'Creative · free construction')]]) {
      const option = el('option', title); option.value = value!; economy.append(option);
    }
    const nameLabel = el('label', this.text('家园名字', 'Home name')), name = el('input'); name.maxLength = 40; name.value = this.text('我的家园', 'My homestead'); name.dataset.rhField = 'name'; nameLabel.append(name);
    const row = el('div', undefined, 'rh-row');
    const start = (mode: 'session' | 'homestead') => void this.startWorld({ mode, mapId: map.value, economy: economy.value as 'classic' | 'creative', name: name.value });
    row.append(this.button(this.text('悠闲一局', 'New session'), 'new-session', () => start('session'), 'rh-primary'), this.button(this.text('建立长住家园', 'New homestead'), 'new-homestead', () => start('homestead')));
    dialog.append(mapLabel, economyLabel, nameLabel, row);
    if (this.started && this.world.mode === 'session' && this.world.status !== 'ended') dialog.append(el('p', this.text('开始新世界将替换当前未保存的悠闲一局。', 'Starting a new world replaces this unsaved session.'), 'rh-muted'));
    dialog.append(el('h3', this.text('本机家园', 'Homes in this browser')));
    const list = el('div', undefined, 'rh-list'); list.dataset.rhSaves = 'true';
    if (!this.saves.length) list.append(el('p', this.text('尚无可用存档。', 'No saved homes yet.'), 'rh-muted'));
    for (const save of this.saves) list.append(this.button(`${save.world.name} · ${getMap(save.world.mapId)?.[this.isZhLang() ? 'labelZh' : 'labelEn'] ?? save.world.mapId}`, `load-${save.worldId}`, () => void this.loadHome(save.worldId)));
    dialog.append(list);
    const recovery = el('details'); recovery.append(el('summary', this.text('恢复上一次有效快照', 'Recover an earlier snapshot')));
    const recoveryList = el('div', undefined, 'rh-list'); recoveryList.dataset.rhRecovery = 'true';
    this.fillRecoveries(recoveryList); recovery.append(recoveryList); dialog.append(recovery);
    if (this.saveState === 'error') dialog.append(el('p', `${this.text('保存不可用：', 'Save unavailable: ')}${this.saveError}`, 'rh-error'));
    if (this.world.mode === 'homestead' && this.started) {
      const backups = el('div', undefined, 'rh-row');
      backups.append(this.button(this.text('立即保存', 'Save now'), 'save', () => void this.saveHome()), this.button(this.text('导出当前备份', 'Export backup'), 'export', () => this.exportHome()));
      dialog.append(backups);
    }
    const importLabel = el('label', this.text('导入家园备份（创建副本）', 'Import a home backup (new copy)'));
    const input = el('input'); input.type = 'file'; input.accept = '.json'; input.dataset.rhAction = 'import-save'; input.className = 'rh-file'; importLabel.append(input);
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void this.importHome(file); }); dialog.append(importLabel);
    dialog.append(el('p', this.text('离线不会继续运转。清理网站数据会丢失本地家园，请定期导出；没有云同步。', 'Worlds pause while away. Clearing site data removes local homes. Export backups regularly; there is no cloud sync.'), 'rh-muted'));
    dialog.append(this.button(this.text('经典素材与地图', 'Classic materials & maps'), 'classics', () => this.openPanel('classics')));
    dialog.append(this.button(this.text('素材检视工具', 'Inspect source assets'), 'materials', () => this.openPanel('materials')));
    if (this.started && this.world.mode === 'session' && this.world.status === 'playing') dialog.append(this.button(this.text('结束这一局', 'End this session'), 'end', () => this.openPanel('end'), 'rh-danger'));
  }
  private drawManagePanel(dialog: HTMLDivElement) {
    const building = this.world.buildings.find(b => b.id === this.selected);
    if (!building) { dialog.append(el('p', this.text('请选择一座建筑。', 'Select a building first.'))); return; }
    const def = BUILDINGS[building.kind]; dialog.append(el('h2', this.isZhLang() ? def.labelZh : def.labelEn));
    dialog.append(el('p', this.text(`施工 ${Math.floor(building.progress * 100)}% · 用电 ${def.powerUsed} · 供电 ${def.powerProduced}`, `Construction ${Math.floor(building.progress * 100)}% · power use ${def.powerUsed} · output ${def.powerProduced}`)));
    for (const kind of UNIT_KINDS.filter(kind => UNITS[kind].producer === building.kind)) {
      const unit = UNITS[kind]; dialog.append(this.button(`${this.isZhLang() ? unit.labelZh : unit.labelEn} · $${unit.cost}`, `produce-${kind}`, () => this.orderUnit(kind)));
    }
    dialog.append(el('p', this.text('拆除会退还部分费用；请确认不再需要这座设施。', 'Removal refunds part of its cost. Check that the facility is no longer needed.'), 'rh-muted'));
    dialog.append(this.button(this.text('拆除并退款', 'Remove and refund'), 'demolish', () => {
      const result = demolish(this.world, building.id);
      if (result.ok) { this.selected = null; void this.saveHome(); this.openPanel(null); }
      else this.notice(this.isZhLang() ? reasonZh[result.reason] ?? result.reason : result.reason);
    }, 'rh-danger'));
  }
  private orderUnit(kind: UnitKind) {
    const result = produceUnit(this.world, kind);
    if (result.ok) { void this.saveHome(); this.notice(this.text('人员或车辆已就位', 'Unit ready')); this.openPanel(null); }
    else this.notice(this.isZhLang() ? reasonZh[result.reason] ?? result.reason : result.reason);
  }
  private beginWorldChange() {
    if (this.busy || this.disposed) return false;
    this.busy = true; this.panelNode?.setAttribute('aria-busy', 'true');
    for (const button of this.panelNode?.querySelectorAll<HTMLButtonElement>('button') ?? []) { this.busyButtons.set(button, button.disabled); button.disabled = true; }
    return true;
  }
  private finishWorldChange() {
    this.busy = false; this.panelNode?.removeAttribute('aria-busy');
    for (const [button, disabled] of this.busyButtons) if (button.isConnected) button.disabled = disabled;
    this.busyButtons.clear();
  }
  private reportPanelError(message: string) {
    if (this.disposed) return;
    this.panelError = message; this.notice(message);
    const output = this.panelNode?.querySelector<HTMLElement>('[data-rh-panel-error]'); if (output) output.textContent = message;
  }
  private classicPanelHost() {
    return {
      text: (zh: string, en: string) => this.text(zh, en),
      button: (label: string, id: string, action: () => void) => this.button(label, id, action),
      catalog: this.classicCatalog, active: this.started,
      import: (files: File[], options: ClassicImportOptions, output: HTMLElement) => this.importClassic(files, options, output),
      start: (id: string, mode: 'session'|'homestead') => { void this.startClassic(id, mode); },
      apply: (id: string) => { void this.applyClassic(id); },
    };
  }
  private async refreshClassicCatalog() {
    const generation = this.generation;
    try {
      const catalog = await this.classicStorage?.list() ?? [];
      if (this.disposed || generation !== this.generation) return;
      this.classicCatalog = catalog;
      const node = this.panelNode?.querySelector<HTMLElement>('[data-rh-classic-catalog]');
      if (node) fillClassicCatalog(node, this.classicPanelHost());
    } catch (error) { if (this.panel === 'classics') this.reportPanelError(this.text('素材库不可用：', 'Material storage unavailable: ') + String(error)); }
  }
  private async importClassic(files: File[], options: ClassicImportOptions, output: HTMLElement) {
    const generation = this.generation;
    output.textContent = this.text('正在本地校验和解码，原有城市不会被替换…', 'Validating and decoding locally. Your current city is kept intact…');
    try {
      const bundle = await this.classicImporter.import(files, options);
      if (this.disposed || generation !== this.generation || !output.isConnected) return;
      if (!this.classicStorage) throw new Error('classic-storage-unavailable');
      await this.classicStorage.save(bundle);
      if (this.disposed || generation !== this.generation || !output.isConnected) return;
      output.textContent = this.text(`已保存到本机：${bundle.label}。请在下面选择开始方式。`, `Saved locally: ${bundle.label}. Choose a play mode below.`);
      await this.refreshClassicCatalog();
    } catch (error) {
      if (!this.disposed && generation === this.generation && output.isConnected) {
        output.textContent = this.text('未导入，当前城市保持不变：', 'Not imported; the current city is unchanged: ') + (error instanceof Error ? error.message : String(error));
        output.classList.add('rh-error');
      }
    }
  }
  private async startClassic(id: string, mode: 'session'|'homestead') {
    if (!this.beginWorldChange()) return;
    const generation = this.generation;
    try {
      if (!await this.saveHome()) throw new Error(this.text('请先保存或导出当前家园', 'Save or export the current home first'));
      const bundle = await this.classicStorage?.load(id); if (!bundle) throw new Error('local-materials-missing');
      if (this.disposed || generation !== this.generation) return;
      const options = { mode, economy: this.world.economy, name: this.text('我的经典家园', 'My classic homestead') };
      const world = bundle.map ? createImportedWorld(options, bundle.map, bundle.id)
        : createWorld({ ...options, mapId: getMap(this.world.mapId) ? this.world.mapId : MAPS[0]!.id });
      world.id = newId(); world.materialsId = bundle.id;
      this.adoptWorld(world, bundle); if (mode === 'homestead') await this.saveHome();
    } catch (error) { this.reportPanelError(this.text('无法开始：', 'Cannot start: ') + String(error)); }
    finally { this.finishWorldChange(); }
  }
  private async applyClassic(id: string) {
    if (!this.started || !this.beginWorldChange()) return;
    const generation = this.generation, worldId = this.world.id;
    try {
      if (this.world.source && this.world.source.bundleId !== id) throw new Error(this.text('导入地图必须保留匹配的地形素材包；请以新素材另建家园。', 'An imported map must keep its matching terrain bundle. Start a separate home with this set.'));
      const bundle = await this.classicStorage?.load(id); if (!bundle) throw new Error('local-materials-missing');
      if (this.disposed || generation !== this.generation || this.world.id !== worldId) return;
      const previous = this.world.materialsId; this.world.materialsId = id;
      if (!await this.saveHome()) { this.world.materialsId = previous; throw new Error('world-save-failed'); }
      if (this.disposed || generation !== this.generation || this.world.id !== worldId) return;
      this.classicView?.destroy(); this.classicView = new ClassicView(bundle); this.panel = null; this.drawPanel(); this.rebuildToolbar(); this.renderFrame();
      this.notice(this.text('本地素材已用于当前城市，进度保持不变。', 'Local materials applied; city progress is unchanged.'));
    } catch (error) { this.reportPanelError(String(error)); }
    finally { this.finishWorldChange(); }
  }
  private drawMaterialsPanel(dialog: HTMLDivElement) {
    dialog.append(el('h2', this.text('本地原版素材检视', 'Local source inspector')),
      el('p', this.text('选择你合法持有的文件，仅在浏览器内解码，不上传。此工具用于核对素材，不代表已经完成原版场景接入。', 'Choose files you lawfully hold. Decoding stays in this browser; nothing is uploaded. Inspection is not full scene integration.'), 'rh-note'),
      el('p', this.text('本工具检视 SHP/PAL、TMP、VXL/HVA、未加密 MIX 及 MAP/MPR 数据，不会应用到城市。要游玩请使用「经典素材与地图」。体素仍为基础色盘光照；加密 MIX 不支持。', 'This tool inspects SHP/PAL, TMP, VXL/HVA, unencrypted MIX and MAP/MPR without applying them to a city. Use Classic materials & maps to play. Voxels use palette-only lighting; encrypted MIX is unsupported.'), 'rh-muted'));
    const input = el('input'); input.type = 'file'; input.multiple = true; input.accept = '.shp,.pal,.tmp,.tem,.sno,.urb,.ubn,.des,.lun,.mix,.vxl,.hva,.map,.mpr'; input.dataset.rhAction = 'inspect-assets';
    const output = el('div', undefined, 'rh-inspector'); input.addEventListener('change', () => void this.inspectAssets([...(input.files ?? [])], output));
    dialog.append(input, el('p', this.text('每次最多 8 个文件、合计 64 MiB；每组使用一个匹配的 PAL。大资源库的流式导入尚未实现。', 'Up to 8 files / 64 MiB total, with one matching PAL. Streaming import of large archives is not implemented.'), 'rh-muted'), output);
    if (!this.started) dialog.append(this.button(this.text('返回世界选择', 'Back to worlds'), 'back-worlds', () => this.openPanel('worlds')));
  }
  private async inspectAssets(files: File[], output: HTMLElement) {
    this.inspector.cancel();
    const generation = this.generation, sequence = ++this.inspectionSequence;
    const live = () => !this.disposed && generation === this.generation && sequence === this.inspectionSequence && output.isConnected;
    output.replaceChildren(el('p', this.text('正在本地解码…', 'Decoding locally…')));
    try {
      if (files.length > 8 || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error('file-limit');
      const paletteFiles = files.filter(file => file.name.toLowerCase().endsWith('.pal'));
      if (paletteFiles.length > 1) throw new Error(this.text('每次请选择一个对应的调色板', 'Choose one matching palette at a time'));
      const paletteFile = paletteFiles[0];
      const palette = paletteFile ? await paletteFile.arrayBuffer() : undefined;
      if (!live()) return;
      const children: HTMLElement[] = [];
      for (const file of files.filter(file => !/\.(pal|hva)$/i.test(file.name))) {
        const extension = file.name.toLowerCase().split('.').pop() ?? '';
        const theaterImage = ['tem', 'sno', 'urb', 'ubn', 'des', 'lun'].includes(extension);
        const mapFile = extension === 'map' || extension === 'mpr';
        if (!theaterImage && !mapFile && extension !== 'shp' && extension !== 'tmp' && extension !== 'mix' && extension !== 'vxl') throw new Error('unsupported-file');
        const bytes = await file.arrayBuffer(); if (!live()) return;
        const kind = mapFile ? 'map' : theaterImage ? bytes.byteLength >= 2 && new DataView(bytes).getUint16(0, true) === 0 ? 'shp' : 'tmp' : extension as 'shp' | 'tmp' | 'mix' | 'vxl';
        const animationFile = kind === 'vxl' ? files.find(candidate => candidate.name.toLowerCase() === file.name.toLowerCase().replace(/\.vxl$/, '.hva')) : undefined;
        if (kind === 'vxl' && !animationFile) throw new Error(this.text('请选择同名 HVA 动画文件', 'Select the matching HVA animation'));
        const animation = animationFile ? await animationFile.arrayBuffer() : undefined;
        if (!live()) return;
        const preview = await this.inspector.decode({ kind, bytes, palette: palette?.slice(0), animation });
        if (!live()) return;
        const group = el('div'); group.append(el('p', file.name));
        if (preview.rgba && preview.width && preview.height) {
          const canvas = el('canvas'); canvas.width = preview.width; canvas.height = preview.height;
          canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(preview.rgba), preview.width, preview.height), 0, 0);
          group.append(canvas);
        }
        group.append(el('pre', preview.summary, 'rh-muted')); children.push(group);
      }
      if (!children.length) children.push(el('p', this.text('请选择 SHP / TMP 和配套 PAL，或一个 MIX 文件。', 'Choose SHP / TMP with PAL, or a MIX archive.')));
      if (live()) output.replaceChildren(...children);
    } catch (error) {
      if (live()) output.replaceChildren(el('p', `${this.text('未导入：', 'Not imported: ')}${error instanceof Error ? error.message : String(error)}`, 'rh-error'));
    }
  }
  async startWorld(options: CreateWorldOptions): Promise<boolean> {
    if (!this.beginWorldChange()) return false;
    const generation = this.generation;
    try {
      if (this.started && this.world.mode === 'homestead' && !await this.saveHome()) return false;
      if (this.disposed || generation !== this.generation) return false;
      const world = createWorld(options); world.id = newId();
      this.adoptWorld(world); if (world.mode === 'homestead') await this.saveHome(); return true;
    } catch (error) { this.notice(String(error)); return false; }
    finally { this.finishWorldChange(); }
  }
  private adoptWorld(world: World, materials: ClassicBundle | null = null) {
    if (world.materialsId && materials?.id !== world.materialsId) throw new Error('missing-local-materials');
    if (world.source && materials?.map?.rawMapHash !== world.source.mapHash) throw new Error('local-map-materials-mismatch');
    this.classicView?.destroy(); this.classicView = materials ? new ClassicView(materials) : null;
    this.life.reset(); this.facings.clear();
    this.world = world; this.started = true; this.selected = null; this.hover = null; this.placing = null;
    this.panel = null; this.paused = false; this.lastSaveTime = world.time; this.saveState = 'idle'; this.saveError = '';
    this.camera = centerCamera(world, this.width, this.height, this.width < 500 ? .8 : 1);
    this.resetScoreReport(); this.drawPanel(); this.rebuildToolbar(); this.updateStatus(); this.renderFrame();
  }
  private fillRecoveries(list: HTMLElement) {
    list.replaceChildren();
    if (!this.recoveries.length) list.append(el('p', this.text('尚无较早快照。', 'No earlier snapshots yet.'), 'rh-muted'));
    for (const save of this.recoveries) list.append(this.button(
      this.text(`恢复「${save.world.name}」上次快照（替换其当前进度）`, `Restore previous “${save.world.name}” snapshot (replaces its current progress)`),
      `recover-${save.worldId}`, () => void this.loadHome(save.worldId, true)));
  }
  private async refreshSaves() {
    const generation = this.generation;
    try {
      await this.repo?.flush(); const saves = await this.repo?.list() ?? [];
      const recoveries = await this.repo?.recoveries() ?? [];
      if (this.disposed || generation !== this.generation) return; this.saves = saves; this.recoveries = recoveries;
      const recoveryList = this.panelNode?.querySelector<HTMLElement>('[data-rh-recovery]');
      if (recoveryList) this.fillRecoveries(recoveryList);
      // Do not rebuild an actively edited form when a late read finishes.
      const list = this.panelNode?.querySelector('[data-rh-saves]');
      if (list) {
        list.replaceChildren();
        if (!saves.length) list.append(el('p', this.text('尚无可用存档。', 'No saved homes yet.'), 'rh-muted'));
        for (const save of saves) list.append(this.button(save.world.name, `load-${save.worldId}`, () => void this.loadHome(save.worldId)));
      }
    } catch (error) { if (!this.disposed && generation === this.generation) { this.saveState = 'error'; this.saveError = error instanceof Error ? error.message : String(error); this.updateStatus(); } }
  }
  private async saveHome(): Promise<boolean> {
    if (!this.world || !this.started || this.world.mode !== 'homestead') return true;
    if (!this.repo) { this.saveState = 'error'; this.saveError = 'storage-unavailable'; return false; }
    const world = this.world, id = world.id; this.savePending++; this.saveState = 'saving'; this.updateStatus();
    try {
      await this.repo.save(world);
      if (!this.disposed && this.world.id === id) { this.saveState = 'saved'; this.saveError = ''; this.updateStatus(); }
      return true;
    } catch (error) {
      if (!this.disposed && this.world.id === id) { this.saveState = 'error'; this.saveError = error instanceof Error ? error.message : String(error); this.updateStatus(); }
      return false;
    } finally { this.savePending--; }
  }
  private async loadHome(id: string, backup = false) {
    if (!this.repo || !this.beginWorldChange()) return;
    const generation = this.generation;
    try {
      // Capture recovery before saving the active world rotates its previous snapshot.
      const recovered = backup ? await this.repo.snapshot(id, true) : undefined;
      const savesSameWorld = this.started && this.world.mode === 'homestead' && this.world.id === id;
      if (!await this.saveHome()) return;
      const snapshot = backup ? recovered : await this.repo.snapshot(id);
      if (!snapshot) throw new Error('save-not-found');
      // Only our own successful write may advance a recovery fence; a failed/stale tab never rebases itself.
      if (backup && savesSameWorld) snapshot.headRevision = this.repo.currentRevision(id) ?? snapshot.headRevision;
      const world = snapshot.envelope.world;
      if (this.disposed || generation !== this.generation) return;
      const materials = world.materialsId ? await this.classicStorage?.load(world.materialsId) : null;
      if (world.materialsId && !materials) throw new Error(this.text('本机缺少此家园的素材。请先重新导入同一组原始文件，再恢复家园。', 'This home needs local materials. Re-import the same source files before restoring it.'));
      if (this.disposed || generation !== this.generation) return;
      this.repo.acceptSnapshot(snapshot);
      this.adoptWorld(world, materials ?? null); this.saveState = 'saved';
      if (backup) await this.saveHome();
    } catch (error) { this.reportPanelError(this.text('无法恢复家园：', 'Cannot restore home: ') + String(error)); }
    finally { this.finishWorldChange(); }
  }
  private exportHome() {
    try {
      if (!this.repo) throw new Error('storage-unavailable');
      const text = this.repo.export(this.world); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = el('a'); anchor.href = url; anchor.download = `red-homestead-${this.world.id}.json`; this.layer?.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { this.notice(String(error)); }
  }
  private async importHome(file: File) {
    const generation = this.generation;
    try {
      if (!this.repo || file.size > MAX_SAVE_BYTES) throw new Error('invalid-import');
      const world = this.repo.import(await file.text(), newId());
      if (this.disposed || generation !== this.generation) return;
      await this.repo.save(world); await this.refreshSaves(); this.notice(this.text('备份已导入为新的家园', 'Backup imported as a new home'));
    } catch (error) { this.notice(this.text('无法导入：', 'Import failed: ') + String(error)); }
  }
  getDiagnostics() {
    const stats = getStats(this.world);
    return { id: 'red-homestead', mode: this.world.mode, started: this.started, worldId: this.world.id, status: this.world.status,
      panel: this.panel, paused: this.paused || this.presentationPaused || this.modalOpen(), time: this.world.time,
      ...stats, buildings: this.world.buildings.map(b => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, progress: b.progress })),
      units: this.world.units.map(u => ({ id: u.id, kind: u.kind, x: u.x, y: u.y, task: u.task, cargo: u.cargo })),
      camera: { ...this.camera }, saveState: this.saveState, saveError: this.saveError, selected: this.selected, placing: this.placing,
      provenance: this.world.source ? 'ra2-local' : 'original-development',
      sourceArtIntegrated: !!this.classicView && (Object.keys(this.classicView.bundle.buildings).length + Object.keys(this.classicView.bundle.units).length > 0),
      originalMapIntegrated: !!this.world.source && !!this.classicView?.bundle.map,
      materialsId: this.world.materialsId, materialCache: this.classicView?.getDiagnostics() ?? null,
      source: this.world.source, residentsVisible: this.life.residents.length, weapons: false,
    };
  }
  /** Game-owned deterministic fixtures use logical positions, never private shell state. */
  getTilePoint(x: number, y: number) { const point = project(x + .5, y + .5, this.camera); point.y -= groundHeight(this.world, x, y) * 15 * this.camera.zoom; return point; }
  destroy() {
    void this.saveHome(); this.disposed = true; this.generation++; this.inspectionSequence++; this.inspector.cancel(); this.keys.clear(); this.drag = null;
    this.classicImporter.cancel(); this.classicView?.destroy(); this.classicView = null; this.classicStorage?.close(); this.classicStorage = null; this.life.reset(); this.facings.clear();
    this.host.presentation?.setActions?.([]); this.layer?.remove(); this.layer = null;
    const repo = this.repo; this.repo = null; if (repo) void repo.close(); super.destroy();
  }
}
