/**
 * Genuine HUD-free map previews, captured from the built CS renderer only.
 * Run from the repo root with the existing dependencies/browser:
 *   npm run preview -- --host 127.0.0.1 --port 8093 --strictPort
 *   node games/cs/tests/capture-map-previews.mjs [--overwrite]
 * Verify port 8093 is free before starting preview; the caller owns/stops it.
 * This script validates the served release identity and always closes Chromium.
 * No upload archive, source-server import, runtime hook or other game's assets.
 * Attribution stays in games/cs/public/CREDITS.md and the existing map assets.
 * Initial assets: CS 1.1.2 / a730c5e13ebddac9d0b53688b3f8111938be7ded.
 * Snow frames the original central walls and floor weapons; Dust II frames the
 * long-A approach, A-site crates and surrounding GoldSrc/BSP architecture.
 * SwiftShader deliberately retains the game's actual low-quality render path;
 * lighting, materials, fog, map geometry and weapon placements are unmodified.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const origin = 'http://127.0.0.1:8093';
const width = 640, height = 360;
const catalog = JSON.parse(readFileSync(resolve(root, 'dist/games/index.json'), 'utf8'));
const release = catalog.games.find(game => game.id === 'cs');
if (!release || release.apiVersion !== 1) throw new Error('Build a compatible CS release first');
const assetBase = new URL(release.assetBase, origin).href;
const entry = new URL(release.entry, origin).href;
if (!assetBase.startsWith(`${origin}/games/cs/`) || !entry.startsWith(assetBase)) {
  throw new Error('CS must have its own pinned immutable release base');
}
const captures = [
  { id: 'fy_snow', positionOffset: [24, 29, 30], targetOffset: [0, 0.5, 0], fov: 57 },
  { id: 'de_dust2', positionOffset: [50, 14, -11.6], targetOffset: [32, 5, -36.6], fov: 67 },
];
const outputs = captures.map(capture => resolve(root, `games/cs/public/assets/ui/maps/${capture.id}.webp`));
for (const output of outputs) {
  if (existsSync(output) && !process.argv.includes('--overwrite')) {
    throw new Error(`Refusing to overwrite ${output}; review it first, then pass --overwrite`);
  }
}
const servedCatalogResponse = await fetch(`${origin}/games/index.json`);
if (!servedCatalogResponse.ok) throw new Error(`Preview catalog: HTTP ${servedCatalogResponse.status}`);
const servedRelease = (await servedCatalogResponse.json()).games.find(game => game.id === 'cs');
if (servedRelease?.entry !== release.entry || servedRelease?.assetBase !== release.assetBase) {
  throw new Error('Preview is not serving the locally pinned CS release');
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [], requests = new Set();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('request', request => {
    if (request.url().includes('/games/')) requests.add(request.url());
  });
  await page.route('**/__cs_map_preview_capture__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden}#gameApp{position:relative}canvas{display:block}</style></head><body><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>',
  }));
  // Stabilize the renderer's own random atmosphere, without inventing geometry.
  await page.addInitScript(() => {
    let seed = 0x43535052;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await page.goto(`${origin}/__cs_map_preview_capture__`);
  await page.evaluate(async ({ entry, assetBase, width, height }) => {
    const { CsGame } = await import(entry);
    const canvas = document.getElementById('gameCanvas');
    const game = new CsGame({
      canvas, logicalWidth: width, logicalHeight: height,
      isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: path => new URL(path, assetBase).href,
    });
    // Test-owned access only. The SDK loop is never started: no simulation,
    // pointer lock, HUD painting or first-person weapon is present in exports.
    window.__CS_MAP_PREVIEW__ = game;
    game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.setPresentationPaused(true);
    game.prepare();
  }, { entry, assetBase, width, height });
  await page.waitForFunction(() => {
    const e = window.__CS_MAP_PREVIEW__.engine;
    if (e.bootError) throw new Error(e.bootError);
    return e.ready && !e.bootLoading && !e.mapLoading;
  }, null, { timeout: 90_000 });

  for (const [index, capture] of captures.entries()) {
    const result = await page.evaluate(async ({ capture, width, height }) => {
      const e = window.__CS_MAP_PREVIEW__.engine;
      if (e.selectedMap !== capture.id) await e.selectMap(capture.id);
      if (!e.ready || e.mapLoading || e.world?.config.id !== capture.id) throw new Error(`Map did not load: ${capture.id}`);
      const center = e.world.center;
      const position = capture.positionOffset.map((value, axis) => value + center.toArray()[axis]);
      const target = capture.targetOffset.map((value, axis) => value + center.toArray()[axis]);
      e.camera.position.fromArray(position);
      e.camera.lookAt(...target);
      e.camera.fov = capture.fov;
      e.camera.updateProjectionMatrix();
      e.camera.updateMatrixWorld(true);
      const before = e.renderer.info.render.frame;
      e.render();
      const after = e.renderer.info.render.frame;
      if (after <= before || e.renderer.info.render.triangles <= 0) throw new Error('Expected a fresh real 3D frame');
      const output = document.createElement('canvas');
      output.width = width; output.height = height;
      const context = output.getContext('2d');
      // Same-task readback of freshly rendered WebGL pixels, not a screenshot
      // of a menu, composite, cached cover or reconstructed map illustration.
      context.drawImage(e.canvas3d, 0, 0, width, height);
      const url = output.toDataURL('image/webp', .9);
      if (!url.startsWith('data:image/webp;base64,')) throw new Error('Browser did not encode WebP');
      const pixels = context.getImageData(0, 0, width, height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      if (colors.size < 256) throw new Error('Blank or unexpectedly featureless map frame');
      return {
        url, map: capture.id, width, height, renderWidth: e.canvas3d.width, renderHeight: e.canvas3d.height,
        camera: { position, target, fov: e.camera.fov, aspect: e.camera.aspect, near: e.camera.near, far: e.camera.far },
        world: { center: center.toArray(), size: e.world.size, bounds: e.world.bounds,
          bombSites: e.world.bombSites.map(site => ({ id: site.id, pos: site.pos.toArray() })),
          pickups: e.pickupItems.length, missingTextures: e.world.missingTextures },
        freshFrame: { before, after, triangles: e.renderer.info.render.triangles, distinctColors: colors.size },
        quality: e.quality, softwareRendering: e.softwareRendering,
      };
    }, { capture, width, height });
    if (errors.length) throw new Error(errors.join('\n'));
    const foreignRequests = [...requests].filter(url => !url.startsWith(assetBase));
    if (foreignRequests.length) throw new Error(`Unexpected cross-release request: ${foreignRequests.join(', ')}`);
    const { url, ...provenance } = result;
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    mkdirSync(dirname(outputs[index]), { recursive: true });
    writeFileSync(outputs[index], bytes);
    console.log(JSON.stringify({ output: outputs[index], ...provenance, release: { version: release.version, revision: release.revision, entry, assetBase }, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), errors }, null, 2));
  }
  await page.evaluate(() => window.__CS_MAP_PREVIEW__.destroy());
} finally {
  await browser.close();
}
