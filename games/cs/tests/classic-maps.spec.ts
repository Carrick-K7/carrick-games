import { expect, test } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test('four maps use local photographic materials; classic maps render, play and stay within static budgets', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [], foreign: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const base = gameAssetUrl('cs', '');
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/games/') && !u.pathname.startsWith(base)) foreign.push(u.pathname); });
  await page.route('**/__cs_classic_maps__', r => r.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#152029}#gameApp{position:relative}canvas{display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto('/__cs_classic_maps__');
  await page.evaluate(async ({ entry, base }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    localStorage.removeItem('cs.controls.v1');
    let width = 1280, height = 720;
    const game = new CsGame({ canvas, logicalWidth: width, logicalHeight: height,
      isDarkTheme: () => true, isZhLang: () => true, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(base, location.href)).href });
    const e = game.engine, hud = game.hudView, ctx = canvas.getContext('2d')!;
    game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.setPresentationPaused(true); game.prepare();
    const mapFrame = () => {
      const w = e.world, camera = w.previewCamera;
      if (camera) { e.camera.position.fromArray(camera.position); e.camera.lookAt(...camera.target); e.camera.fov = camera.fov; }
      else { e.camera.position.copy(w.center).add(e.player?.pos.clone().set(20, 25, 30) || w.center.clone().set(20, 25, 30)); e.camera.lookAt(w.center); }
      e.camera.aspect = width / height; e.camera.updateProjectionMatrix(); e.camera.updateMatrixWorld(true);
      e.renderer.info.autoReset = false; e.renderer.info.reset();
      const before = e.renderer.info.render.frame, start = performance.now();
      e.render(); ctx.drawImage(e.canvas3d, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data, colors = new Set<number>();
      for (let i = 0; i < pixels.length; i += 64) colors.add((pixels[i] << 16) + (pixels[i + 1] << 8) + pixels[i + 2]);
      const readbackMs = performance.now() - start;
      return { id: e.selectedMap, before, frame: e.renderer.info.render.frame, calls: e.renderer.info.render.calls,
        triangles: e.renderer.info.render.triangles, geometryCount: e.renderer.info.memory.geometries,
        renderPixels: e.canvas3d.width * e.canvas3d.height, software: e.softwareRendering,
        mapMeshes: w.mapGroup.children.length,
        photoMeshes: w.mapGroup.children.filter((m: any) => m.material?.userData.worldMaterialPalette).length,
        decorativeKinds: w.mapGroup.children.filter((m: any) => m.material?.userData.ownedMapDecoration).map((m: any) => m.material.name).sort(),
        proceduralGpuBytes: w.decorativeTextureBytes || 0,
        palette: w.materialPalette.stats(), sites: w.bombSites.map((s: any) => s.id),
        actors: e.all.length, missing: w.missingTextures, colors: colors.size, readbackMs };
    };
    (window as any).__CS_CLASSIC_MAPS__ = {
      ready: () => e.ready && !e.bootLoading, error: () => e.bootError,
      async load(id: string) { e.toMenu(); if (!await e.loadMap(id)) throw new Error(`Map failed: ${id}`); await e.world.materialPalette.load(); return mapFrame(); },
      async detail() { e.world.materialPalette.applyQuality({ detail: true }); await e.world.materialPalette.load(); return mapFrame(); },
      frame: mapFrame,
      gameplay(mode: string) {
        e.toMenu(); e.selectedMode = mode; e.startMatch(); e.phase = 'active';
        const before = e.bots.map((b: any) => b.pos.clone());
        for (let i = 0; i < 120; i++) e.update(1 / 30);
        e.renderer.info.reset(); game.draw(ctx);
        return { id: e.selectedMap, mode: e.mode, actors: e.all.length, bomb: e.bomb?.status ?? null,
          finite: e.all.every((a: any) => a.pos.toArray().every(Number.isFinite)),
          moved: e.bots.filter((b: any, i: number) => b.pos.distanceTo(before[i]) > .5).length,
          canBuy: e.canBuy(e.player), location: e.hud.location, frame: e.renderer.info.render.frame };
      },
      menu() { game.setPresentationPaused(false); e.toMenu(); hud.onWheel(-10000); game.draw(ctx); return hud.regions.map((r: any) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })); },
      resize(w: number, h: number) { width = w; height = h; game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } }); return mapFrame(); },
      scanMapChoices() {
        const ids = new Set<string>(); hud.onWheel(-10000);
        for (let i = 0; i < 260; i++) { hud.draw(ctx, width, height); for (const r of hud.regions) if (r.id?.startsWith('menu-map-') && r.w >= 44 && r.h >= 44) ids.add(r.id); hud.onWheel(4); }
        hud.onWheel(-10000); game.draw(ctx); return [...ids].sort();
      },
      destroy: () => game.destroy(),
    };
  }, { entry: gameModuleUrl('cs'), base });
  try {
    await expect.poll(() => page.evaluate(() => { const f = (window as any).__CS_CLASSIC_MAPS__; if (f.error()) throw new Error(f.error()); return f.ready(); }), { timeout: 90000 }).toBe(true);
    const records: any[] = [];
    for (const id of ['fy_snow', 'de_dust2', 'de_inferno', 'de_mirage']) {
      const s = await page.evaluate(id => (window as any).__CS_CLASSIC_MAPS__.load(id), id); records.push(s);
      expect(s.id).toBe(id); expect(s.frame).toBeGreaterThan(s.before); expect(s.colors).toBeGreaterThan(256);
      expect(s.palette.status).toBe('loaded'); expect(s.palette.failedTextures).toBe(0);
      expect(s.palette.textureCount).toBe(9); expect(s.palette.downloadedBytes).toBeLessThan(500000);
      expect(s.palette.gpuBytes + s.proceduralGpuBytes).toBeLessThan(13 * 1024 * 1024); expect(s.renderPixels).toBeLessThanOrEqual(230400);
      expect(s.photoMeshes).toBeLessThanOrEqual(9);
      expect(s.mapMeshes).toBe(s.photoMeshes + s.decorativeKinds.length);
      expect(s.missing).toEqual([]);
      if (id === 'de_inferno' || id === 'de_mirage') {
        expect(s.sites).toEqual(['A', 'B']);
        expect(s.decorativeKinds).toEqual(['foliage', 'glass', 'paint']); expect(s.proceduralGpuBytes).toBeGreaterThan(0);
        expect(s.proceduralGpuBytes).toBeLessThan(1024 * 1024);
        // Actual complete static render, including owned decoration and sky.
        expect(s.calls).toBeLessThanOrEqual(12); expect(s.triangles).toBeLessThan(50000);
        await page.screenshot({ path: testInfo.outputPath(`${id}-low.png`) });
        const detail = await page.evaluate(() => (window as any).__CS_CLASSIC_MAPS__.detail()); records.push(detail);
        expect(detail.palette.textureCount).toBe(27); expect(detail.palette.downloadedBytes).toBeLessThan(1.3 * 1024 * 1024);
        expect(detail.palette.gpuBytes + detail.proceduralGpuBytes).toBeLessThan(48 * 1024 * 1024); expect(detail.calls).toBe(s.calls);
        await page.screenshot({ path: testInfo.outputPath(`${id}-pbr.png`) });
        for (const mode of ['defusal', 'tdm']) {
          const play = await page.evaluate(mode => (window as any).__CS_CLASSIC_MAPS__.gameplay(mode), mode);
          expect(play).toMatchObject({ id, mode, actors: 10, finite: true }); expect(play.moved).toBeGreaterThan(0);
          expect(mode === 'defusal' ? play.bomb : null).toBe(mode === 'defusal' ? 'carried' : null);
          await page.screenshot({ path: testInfo.outputPath(`${id}-${mode}.png`) });
        }
      }
    }
    let regions = await page.evaluate(() => (window as any).__CS_CLASSIC_MAPS__.menu());
    const expected = ['menu-map-de_dust2', 'menu-map-de_inferno', 'menu-map-de_mirage', 'menu-map-fy_snow'];
    expect(regions.filter((r: any) => r.id?.startsWith('menu-map-')).map((r: any) => r.id).sort()).toEqual(expected);
    await page.screenshot({ path: testInfo.outputPath('four-map-menu.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (window as any).__CS_CLASSIC_MAPS__.resize(390, 844));
    expect(await page.evaluate(() => (window as any).__CS_CLASSIC_MAPS__.scanMapChoices())).toEqual(expected);
    await page.screenshot({ path: testInfo.outputPath('four-map-menu-phone.png') });
    expect(errors).toEqual([]); expect(foreign).toEqual([]);
    await testInfo.attach('map-render-budgets-and-readback-times', { body: Buffer.from(JSON.stringify(records, null, 2)), contentType: 'application/json' });
  } finally { await page.evaluate(() => (window as any).__CS_CLASSIC_MAPS__?.destroy()); }
});
