import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

export interface ModalViewport {
  width: number; height: number; dpr: number; zh: boolean; touch: boolean;
  safeArea: { top: number; right: number; bottom: number; left: number };
}
export type ModalSurface = 'menu' | 'settings' | 'pause' | 'result' | 'scoreboard' | 'radio' | 'map' | 'shop';
export interface ModalRect { x: number; y: number; w: number; h: number }
export interface ModalSnapshot {
  fixture: 'real-cs-controlled-modal-host'; viewport: ModalViewport;
  phase: string; radio: string | null; scoreboard: boolean; buyOpen: boolean; canBuy: boolean;
  clock: number; ammo: number; money: number; notice: string | null; captureRequests: number;
  fireHeld: boolean; shotPressed: boolean; backing: { width: number; height: number };
  sceneFramesBefore: number; sceneFramesAfter: number;
  regions: (ModalRect & { id: string | null; disabled: boolean; deferred: boolean })[];
  scroll: { offset: number; max: number; body: ModalRect } | null;
  paint: { text: string; raw: ModalRect; visible: ModalRect | null; font: string }[];
  radar: ModalRect[];
  shop: { id: string; detail: string; priceText: string; status: string; disabled: boolean }[];
}

/**
 * Test-owned isolated host of the actual release export, Snow/Dust maps and HUD.
 * Real browser input goes through CsGame. Time advances ONLY via step(), and AI
 * is held still: this is modal ownership/UI evidence, not a combat playtest.
 * Private engine/HUD access and deterministic setup stay inside this fixture.
 */
export async function openModalFixture(page: Page, viewport: ModalViewport) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/__cs_modal_polish_fixture__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#0c141c}#gameApp{position:relative;width:100vw;height:100vh}#gameCanvas{position:absolute;display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas" tabindex="0"></canvas></main></body></html>' }));
  await page.goto('/__cs_modal_polish_fixture__');
  await page.evaluate(async ({ entry, assetBase, viewport }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    let current = viewport, captureRequests = 0;
    // Count capture requests, never fake a trusted browser pointer lock.
    canvas.requestPointerLock = () => { captureRequests++; return undefined as any; };
    localStorage.removeItem('cs.controls.v1');
    const game = new CsGame({ canvas, logicalWidth: current.width, logicalHeight: current.height,
      isDarkTheme: () => true, isZhLang: () => current.zh, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(assetBase, location.href)).href });
    const e = game.engine, hud = game.hudView, ctx = canvas.getContext('2d')!;
    const advance = game.update.bind(game);
    game.update = () => {}; // Deterministic fixture clock, not presentation/manual pause.
    const intersect = (a: ModalRect, b: ModalRect): ModalRect | null => {
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
      const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
      return w > 0 && h > 0 ? { x, y, w, h } : null;
    };
    let recording = false, sceneFrames = 0, paint: ModalSnapshot['paint'] = [], radar: ModalRect[] = [];
    let clip: ModalRect | null = null, pathRect: ModalRect | null = null;
    const clips: (ModalRect | null)[] = [];
    const point = (x: number, y: number) => {
      const m = ctx.getTransform();
      return { x: (m.a * x + m.c * y + m.e) / current.dpr, y: (m.b * x + m.d * y + m.f) / current.dpr };
    };
    const wrap = (name: string, before: (...args: any[]) => void) => {
      const original = (ctx as any)[name].bind(ctx);
      (ctx as any)[name] = (...args: any[]) => { before(...args); return original(...args); };
    };
    wrap('save', () => { clips.push(clip); });
    wrap('restore', () => { clip = clips.pop() ?? null; });
    wrap('beginPath', () => { pathRect = null; });
    wrap('rect', (x, y, w, h) => { const a = point(x, y), b = point(x + w, y + h); pathRect = { ...a, w: b.x - a.x, h: b.y - a.y }; });
    wrap('clip', () => { if (pathRect) clip = clip ? intersect(clip, pathRect) ?? { x: 0, y: 0, w: 0, h: 0 } : pathRect; });
    wrap('fillText', (value, x, y) => {
      if (!recording || !String(value).trim()) return;
      const m = ctx.measureText(String(value));
      const a = point(x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent);
      const b = point(x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent);
      const raw = { ...a, w: b.x - a.x, h: b.y - a.y };
      paint.push({ text: String(value), raw, visible: clip ? intersect(raw, clip) : raw, font: ctx.font });
    });
    const drawRadar = e.drawRadarContent.bind(e);
    e.drawRadarContent = (...args: any[]) => {
      if (recording) radar.push({ x: args[1], y: args[2], w: args[3], h: args[3] });
      return drawRadar(...args);
    };
    const snapshot = (): ModalSnapshot => {
      paint = []; radar = []; clip = null; clips.length = 0;
      const before = sceneFrames;
      recording = true;
      try { game.renderFrame(); } finally { recording = false; }
      const region = hud.regions.find((r: any) => r.scroll && !r.id);
      return { fixture: 'real-cs-controlled-modal-host', viewport: current,
        phase: e.phase, radio: e.radioMenu, scoreboard: !!e.hud.scoreboardOpen, buyOpen: e.buyOpen,
        canBuy: !!e.player && e.canBuy(e.player), clock: e.clock, ammo: e.player ? e.weaponOf(e.player).ammo : 0,
        money: e.player?.money ?? 0, notice: e.hud.notice?.text ?? null, captureRequests,
        fireHeld: e.fireHeld, shotPressed: e.shotPressed, backing: { width: canvas.width, height: canvas.height },
        sceneFramesBefore: before, sceneFramesAfter: sceneFrames,
        regions: hud.regions.map((r: any) => ({ id: r.id ?? null, x: r.x, y: r.y, w: r.w, h: r.h, disabled: !!r.disabled, deferred: !!r.deferTap })),
        scroll: region ? { offset: region.scroll.offset, max: region.scroll.max, body: { x: region.x, y: region.y, w: region.w, h: region.h } } : null,
        paint, radar, shop: e.buyOpen ? e.shopView().items.map((i: any) => ({ id: i.id, detail: i.detail, priceText: i.priceText, status: i.status, disabled: i.disabled })) : [] };
    };
    const resetScroll = () => {
      for (const key of ['menuScroll', 'settingsScroll', 'pauseScroll', 'resultScroll', 'buyScroll', 'scoreboardScroll', 'radioScroll']) {
        hud[key].offset = 0; hud[key].endDrag();
      }
    };
    const surface = (which: ModalSurface) => {
      e.closeRadio(false); e.closeBuy(false); e.closeMap(false); e.closeSettings(false);
      e.hud.scoreboardOpen = false; e.hud.matchEnd = null; e.hud.notice = null; e.phase = 'active';
      e.matchActive = true; e.touchMode = current.touch; resetScroll();
      if (which === 'menu') { e.phase = 'menu'; e.matchActive = false; e.selectedMode = 'tdm'; }
      if (which === 'settings') { e.phase = 'menu'; e.matchActive = false; e.openSettings(); }
      if (which === 'pause') e.pauseGame();
      if (which === 'result') { e.scores = { ct: 7, t: 3 }; e.finishMatch(); }
      if (which === 'scoreboard') e.hud.scoreboardOpen = true;
      if (which === 'radio') e.openRadio('radio3');
      if (which === 'map') e.toggleMap();
      if (which === 'shop') {
        if (!e.canBuy(e.player)) throw new Error('Fixture must retain a real active Dust buy-zone player');
        e.toggleBuy();
      }
      e.computeHud(); return snapshot();
    };
    const wheel = (delta: number) => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, bubbles: true, cancelable: true }));
    const scratch = document.createElement('canvas').getContext('2d')!;
    game.setViewport(current); game.prepare();
    (window as any).__CS_MODAL_FIXTURE__ = {
      ready: () => e.ready && !e.bootLoading, bootError: () => e.bootError,
      install() {
        const render = e.renderer.render.bind(e.renderer);
        e.renderer.render = (...args: any[]) => { const result = render(...args); sceneFrames++; return result; };
        e.selectedMode = 'elimination'; e.startMatch(); e.phase = 'active'; e.hideCenter(); e.hud.notice = null;
        e.updateAI = () => {}; // Hold AI decisions, not modal/clock/economy code.
        for (const [i, actor] of e.all.entries()) {
          actor.kills = actor.isPlayer ? 123 : 20 - i; actor.deaths = i + 10;
          actor.name = actor.isPlayer ? 'LONG LOCAL PLAYER' : `LONG TEAMMATE NAME ${i}`;
        }
        game.start(); e.touchMode = current.touch; canvas.focus();
        return snapshot();
      },
      surface, snapshot,
      resize(next: ModalViewport) { current = next; e.touchMode = next.touch; game.setViewport(next); e.computeHud(); return snapshot(); },
      step(seconds: number) { for (let left = Math.min(1, Math.max(0, seconds)); left > 0;) { const dt = Math.min(.02, left); advance(dt); left -= dt; } return snapshot(); },
      wheel(delta: number) { wheel(delta); return snapshot(); },
      reveal(id: string) {
        // Search actual HUD hit regions with the real wheel listener, without
        // spending a WebGL frame for every four pixels. The returned capture
        // always redraws the real scene freshly before any click/screenshot.
        wheel(-10000);
        for (let n = 0; n < 600; n++) {
          hud.draw(scratch, current.width, current.height);
          if (hud.regions.some((r: any) => r.id === id && r.w >= 44 && r.h >= 44)) return snapshot();
          const scroll = hud.regions.find((r: any) => r.scroll)?.scroll;
          if (!scroll || scroll.offset >= scroll.max) break;
          wheel(4);
        }
        throw new Error(`No full 44px target reachable: ${id}`);
      },
      async dustShop() {
        e.toMenu();
        if (!await e.loadMap('de_dust2')) throw new Error('Real Dust map load failed');
        e.selectedMode = 'defusal'; e.startMatch(); e.phase = 'active'; e.hideCenter();
        e.player.money = 16000; e.player.pos.copy(e.world.spawns[e.player.team][0].pos);
        if (!e.canBuy(e.player)) throw new Error('Real Dust spawn is not inside its buy zone');
        e.hud.notice = null; e.computeHud(); return surface('shop');
      },
      shopSetup() { e.player.armor = 100; e.player.helmet = false; e.player.money = 400; e.player.grenades = 0; e.setBuyCategory('equipment'); e.computeHud(); return snapshot(); },
      refusePurchase() { e.buy('he'); return snapshot(); },
      destroy: () => game.destroy(),
    };
  }, { entry: gameModuleUrl('cs'), assetBase: gameAssetUrl('cs', ''), viewport });
  await expect.poll(() => page.evaluate(() => {
    const f = (window as any).__CS_MODAL_FIXTURE__;
    if (f.bootError()) throw new Error(f.bootError());
    return f.ready();
  }), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__.install());
  return { errors };
}

export const modalSnapshot = (page: Page): Promise<ModalSnapshot> => page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__.snapshot());
export const modalSurface = (page: Page, surface: ModalSurface): Promise<ModalSnapshot> => page.evaluate(surface => (window as any).__CS_MODAL_FIXTURE__.surface(surface), surface);
export const modalWheel = (page: Page, delta: number): Promise<ModalSnapshot> => page.evaluate(delta => (window as any).__CS_MODAL_FIXTURE__.wheel(delta), delta);
export const revealModal = (page: Page, id: string): Promise<ModalSnapshot> => page.evaluate(id => (window as any).__CS_MODAL_FIXTURE__.reveal(id), id);
export const resizeModal = (page: Page, viewport: ModalViewport): Promise<ModalSnapshot> => page.evaluate(viewport => (window as any).__CS_MODAL_FIXTURE__.resize(viewport), viewport);
export const stepModal = (page: Page, seconds: number): Promise<ModalSnapshot> => page.evaluate(seconds => (window as any).__CS_MODAL_FIXTURE__.step(seconds), seconds);
export const closeModalFixture = (page: Page): Promise<void> => page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__?.destroy());
export async function activateModal(page: Page, id: string, touch = false) {
  const s = await revealModal(page, id), r = s.regions.find(r => r.id === id && !r.disabled && r.w >= 44 && r.h >= 44);
  expect(r, `enabled 44px ${id}`).toBeTruthy();
  const point = await page.locator('#gameCanvas').evaluate((canvas, r) => {
    const box = canvas.getBoundingClientRect();
    return { x: box.x + (r.x + r.w / 2) * box.width / r.width, y: box.y + (r.y + r.h / 2) * box.height / r.height };
  }, { ...r!, width: s.viewport.width, height: s.viewport.height });
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  return modalSnapshot(page);
}
