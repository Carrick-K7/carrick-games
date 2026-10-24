import { expect, type Page, type Route } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

/** Hold real release responses, never substitute sleeps or synthetic asset bytes. */
export async function holdReleaseResponses(page: Page, relative: RegExp) {
  const base = gameAssetUrl('cs', '');
  let release!: () => void, disposition: 'hold' | 'pass' | 'fail' = 'hold';
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const active = new Set<Promise<void>>();
  const seen: string[] = [], delivered: string[] = [], errors: string[] = [];
  const handler = (route: Route) => {
    const work = (async () => {
      const path = new URL(route.request().url()).pathname;
      seen.push(path);
      if (disposition === 'hold') await barrier;
      if (disposition === 'fail') {
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Deliberate optional-image failure' });
      } else {
        await route.continue();
      }
      delivered.push(path);
    })().catch(error => {
      // Disposing a palette intentionally aborts its already-intercepted fetch.
      if (!/already handled|invalid interception|cancelled|canceled|aborted/i.test(String(error))) errors.push(String(error));
    });
    active.add(work);
    void work.finally(() => active.delete(work));
    return work;
  };
  await page.route(url => url.pathname.startsWith(base) && relative.test(url.pathname.slice(base.length)), handler);
  return {
    seen, delivered, errors,
    release(fail = false) { disposition = fail ? 'fail' : 'pass'; release(); },
    async drain() { while (active.size) await Promise.all([...active]); },
  };
}

/** Actual built CsGame, with private inspection confined to this game-owned fixture.
 * Native inputs are bound normally. Deterministic ticks/paints replace only the RAF
 * driver, so texture release cannot accidentally reset a clock between observations.
 */
export async function openProgressiveLoadingFixture(page: Page, zh = false, { width = 1280, height = 720 } = {}) {
  await page.route('**/__cs_progressive_loading__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#000}#gameApp{position:relative}canvas{display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas" tabindex="0"></canvas></main></body></html>' }));
  await page.goto('/__cs_progressive_loading__');
  await page.evaluate(async ({ entry, base, zh, width, height }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    // Capture itself is not under test; real keyboard and canvas hit-testing are.
    canvas.requestPointerLock = () => undefined as any;
    localStorage.setItem('cs.controls.v1', JSON.stringify({ sensitivity: .91, knifeModel: 'butterfly', quality: 'low' }));
    const game = new CsGame({ canvas, logicalWidth: width, logicalHeight: height,
      isDarkTheme: () => true, isZhLang: () => zh, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(base, location.href)).href });
    const e = game.engine, hud = game.hudView, ctx = canvas.getContext('2d')!;
    e.audio.enabled = false;
    let texts: string[] = [], paints = 0, destroyed = false;
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text, x, y, maxWidth) => {
      texts.push(String(text));
      if (maxWidth === undefined) fillText(text, x, y); else fillText(text, x, y, maxWidth);
    };
    const identities = new WeakMap<object, number>(); let nextIdentity = 1;
    const identity = (value: object | null) => {
      if (!value) return null;
      if (!identities.has(value)) identities.set(value, nextIdentity++);
      return identities.get(value);
    };
    const worlds: any[] = [];
    function trackWorld() {
      const world = e.world;
      if (!world || worlds.some(record => record.world === world)) return;
      const palette = world.materialPalette;
      const record = { world, palette, settled: false, lateBinds: 0 };
      const bind = palette._bind.bind(palette);
      palette._bind = (kind: string) => { if (palette._disposed) record.lateBinds++; return bind(kind); };
      // Observe, do not initiate another material load or change its timeout.
      Promise.resolve(world.materialsReady).then(() => { record.settled = true; });
      worlds.push(record);
    }
    function pixels(source: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
      const samples: number[][] = [];
      for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
        samples.push(Array.from(source.getImageData(Math.floor(x + (col + .5) * w / 8), Math.floor(y + (row + .5) * h / 6), 1, 1).data));
      }
      return { samples, colors: new Set(samples.map(p => p.slice(0, 3).join(','))).size,
        nonblack: samples.filter(p => Math.max(...p.slice(0, 3)) > 24).length,
        chromatic: samples.filter(p => Math.max(...p.slice(0, 3)) - Math.min(...p.slice(0, 3)) > 8).length };
    }
    const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height;
    const raw = scratch.getContext('2d')!;
    function snapshot() {
      trackWorld();
      const world = e.world;
      const materials = new Set<any>();
      world?.mapGroup.traverse((node: any) => { if (node.isMesh) for (const material of [].concat(node.material)) materials.add(material); });
      return { ready: e.ready, bootLoading: e.bootLoading, error: e.bootError, loading: e.loadingView(),
        debugLoading: (window as any).__CSX_DEBUG__?.info().loading,
        map: e.selectedMap, worldId: identity(world), playerId: identity(e.player), phase: e.phase,
        clock: e.clock, pos: e.player?.pos.toArray() ?? null, playerAlive: !!e.player?.alive,
        settings: { ...e.controlSettings }, persistedSettings: JSON.parse(localStorage.getItem('cs.controls.v1')!),
        width, height, touchMode: e.touchMode, keys: [...e.keys], actors: e.all.length,
        skinnedBots: e.bots.filter((b: any) => !!b.mesh?.userData.skinned).length,
        weapon: e.player ? e.weaponOf(e.player).id : null,
        frame: e.renderer?.info.render.frame ?? null, paints, texts: [...texts],
        worldVisible: !!world?.mapGroup.visible && world.mapGroup.parent === e.scene,
        palette: world?.materialPalette.stats() ?? null,
        materialsReadyPromise: !!world?.materialsReady?.then,
        materials: [...materials].map(m => ({ kind: m.userData.materialKind, map: !!m.map, color: m.color.getHex(), uuid: m.uuid })),
        uvReady: world ? world.mapGroup.children.filter((m: any) => m.isMesh).every((m: any) => m.userData.materialUVScaled && m.geometry.getAttribute('uv')?.count > 0) : false,
        regions: hud.regions.filter((r: any) => r.id).map((r: any) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, disabled: !!r.disabled })),
        retired: worlds.map(r => ({ id: identity(r.world), current: r.world === world, attached: r.world.mapGroup.parent === e.scene,
          status: r.palette.stats().status, controllers: r.palette._controllers.size, lateBinds: r.lateBinds, settled: r.settled })),
        disposed: e.disposed, rendererGone: e.renderer === null, previewCacheSize: hud.mapPreviews.size,
        debugPresent: !!(window as any).__CSX_DEBUG__ };
    }
    function paint(ticks = 0) {
      if (destroyed) throw new Error('Fixture cannot paint a destroyed game');
      for (let i = 0; i < ticks; i++) game.update(1 / 30);
      texts = []; game.draw(ctx); paints++;
      // Read the real WebGL scene without the opaque menu/HUD hiding black output.
      let scenePixels = null;
      if (e.world) { raw.clearRect(0, 0, width, height); raw.drawImage(e.canvas3d, 0, 0, width, height); scenePixels = pixels(raw, 0, 0, width, height); }
      const cards = hud.regions.filter((r: any) => r.id?.startsWith('menu-map-')).map((r: any) => ({
        id: r.id, ...pixels(ctx, r.x + 8, r.y + 8, r.w - 40, Math.max(12, r.h - 68)) }));
      return { ...snapshot(), scenePixels, cards,
        // Even at 320px the first eight canvas pixels are outside the menu:
        // neither text nor cards can fake this backdrop.
        backdrop: pixels(ctx, 0, 0, Math.min(8, width), height) };
    }
    game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.prepare(); game.bindInput();
    (window as any).__CS_PROGRESSIVE__ = {
      snapshot, paint,
      menu() { e.toMenu(); return paint(1); },
      settle: () => Promise.all(worlds.map(record => record.world.materialsReady)),
      destroy() { if (!destroyed) { trackWorld(); destroyed = true; game.destroy(); } return snapshot(); },
    };
    paint();
  }, { entry: gameModuleUrl('cs'), base: gameAssetUrl('cs', ''), zh, width, height });
}

export const loadingSnapshot = (page: Page) => page.evaluate(() => (window as any).__CS_PROGRESSIVE__.snapshot());
export const loadingPaint = (page: Page, ticks = 0) => page.evaluate(ticks => (window as any).__CS_PROGRESSIVE__.paint(ticks), ticks);
export async function waitForPlayable(page: Page) {
  await expect.poll(async () => {
    const state = await loadingSnapshot(page);
    if (state.error) throw new Error(state.error);
    return state.ready && !state.bootLoading;
  }, { timeout: 60_000 }).toBe(true);
  return loadingPaint(page, 1);
}

/** Destroy cancels fetches; release AND drain every interceptor before unroute/close. */
export async function closeProgressiveLoadingFixture(page: Page, gates: Awaited<ReturnType<typeof holdReleaseResponses>>[]) {
  try {
    await page.evaluate(() => (window as any).__CS_PROGRESSIVE__?.destroy());
  } finally {
    for (const gate of gates) gate.release();
    for (const gate of gates) await gate.drain();
    await page.evaluate(() => (window as any).__CS_PROGRESSIVE__?.settle());
    await page.unrouteAll({ behavior: 'wait' });
  }
}
