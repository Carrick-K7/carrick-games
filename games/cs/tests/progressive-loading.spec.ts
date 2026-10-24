import { expect, test } from '@playwright/test';
import { activateUi } from './ui.fixture';
import { closeProgressiveLoadingFixture, holdReleaseResponses, loadingPaint, loadingSnapshot,
  openProgressiveLoadingFixture, waitForPlayable } from './progressive-loading.fixture';

// Shared config has one software-GL worker. No FPS assertion, arbitrary sleep,
// source-engine import, runtime test hook, or dependency on a foreign release.
test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test.setTimeout(120_000);
const photos = /^assets\/materials\/[^/]+\.webp$/;
const previews = /^assets\/ui\/maps\/[^/]+\.webp$/;
const mapIds = ['menu-map-de_dust2', 'menu-map-de_inferno', 'menu-map-de_mirage', 'menu-map-fy_snow'];
const geometry = (s: any) => s.regions.filter((r: any) => mapIds.includes(r.id) || r.id === 'menu-start')
  .map(({ id, x, y, w, h }: any) => ({ id, x, y, w, h }));
function assertScene(s: any) {
  expect(s.scenePixels.samples).toHaveLength(48);
  expect(s.scenePixels.nonblack, 'raw world frame, not HUD or HTML background').toBeGreaterThan(24);
  expect(s.scenePixels.colors, 'geometry/lighting must break up the raw scene').toBeGreaterThan(6);
  expect(s.scenePixels.chromatic).toBeGreaterThan(4);
  expect(s.worldVisible).toBe(true);
}
function assertSavedPreferences(s: any) {
  const saved = { sensitivity: .91, knifeModel: 'butterfly' };
  expect(s.settings).toMatchObject(saved);
  expect(s.persistedSettings).toMatchObject(saved);
}
function assertCards(s: any) {
  const cards = s.regions.filter((r: any) => mapIds.includes(r.id));
  expect(cards.map((r: any) => r.id).sort()).toEqual(mapIds);
  for (const card of cards) {
    expect(card.w).toBeGreaterThanOrEqual(44); expect(card.h).toBeGreaterThanOrEqual(44);
    expect(card.disabled).toBe(false);
  }
  for (const card of s.cards) {
    expect(card.samples).toHaveLength(48);
    expect(card.nonblack).toBeGreaterThan(24);
    expect(card.chromatic).toBeGreaterThan(8);
    expect(card.colors, `${card.id} has identifiable artwork/placeholder, not a blank slab`).toBeGreaterThan(2);
  }
}

for (const zh of [false, true]) {
  test(`held character GLBs keep ${zh ? 'Chinese' : 'English'} loading visible on a nonblack first canvas`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const characters = await holdReleaseResponses(page, /^assets\/characters\/(ct|t)-sample\.glb$/);
    try {
      await openProgressiveLoadingFixture(page, zh);
      await expect.poll(() => characters.seen.length).toBe(2);
      const first = await loadingPaint(page);
      expect(first).toMatchObject({ ready: false, worldId: null, loading: { stage: 'characters', canPlay: false } });
      expect(first.debugLoading).toEqual(first.loading);
      expect(first.loading.label).toMatch(zh ? /人物|角色/ : /character|operator/i);
      expect(first.texts.join('\n')).toContain(first.loading.label);
      expect(first.backdrop.samples).toHaveLength(48);
      expect(first.backdrop.nonblack).toBeGreaterThan(24);
      expect(first.backdrop.chromatic).toBeGreaterThan(8);
      expect(first.backdrop.colors, 'asset-independent backdrop is painted outside the HUD').toBeGreaterThan(2);
      expect(first.regions.find((r: any) => r.id === 'menu-start').disabled).toBe(true);
      const disabledStart = first.regions.find((r: any) => r.id === 'menu-start');
      await page.mouse.click(disabledStart.x + disabledStart.w / 2, disabledStart.y + disabledStart.h / 2);
      expect((await loadingSnapshot(page)).playerId).toBeNull();
      expect(characters.delivered).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`slow-startup-${zh ? 'zh' : 'en'}.png`) });
      characters.release(); await characters.drain();
      const ready = await waitForPlayable(page);
      assertScene(ready);
      await activateUi(page, 'menu-start');
      const entered = await loadingPaint(page, 1);
      expect(entered.actors).toBe(10); expect(entered.skinnedBots).toBe(9);
      expect(errors).toEqual([]); expect(characters.errors).toEqual([]);
    } finally { await closeProgressiveLoadingFixture(page, [characters]); }
  });
}

test.describe('narrow touch loading', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('320×568 Chinese startup stays visible and native touch enters before photos or previews finish', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const characters = await holdReleaseResponses(page, /^assets\/characters\/(ct|t)-sample\.glb$/);
    const materialGate = await holdReleaseResponses(page, photos);
    const previewGate = await holdReleaseResponses(page, previews);
    try {
      await openProgressiveLoadingFixture(page, true, { width: 320, height: 568 });
      await expect.poll(() => characters.seen.length).toBe(2);
      const startup = await loadingPaint(page);
      expect(startup).toMatchObject({ width: 320, height: 568, touchMode: true, ready: false,
        worldId: null, loading: { stage: 'characters', canPlay: false } });
      expect(startup.debugLoading).toEqual(startup.loading);
      expect(startup.loading.label).toMatch(/人物|角色/);
      expect(startup.texts.join('\n')).toContain(startup.loading.label);
      expect(startup.backdrop.samples).toHaveLength(48);
      expect(startup.backdrop.nonblack).toBeGreaterThan(24);
      expect(startup.backdrop.chromatic).toBeGreaterThan(8);
      expect(startup.backdrop.colors).toBeGreaterThan(2);
      expect(characters.delivered).toEqual([]); assertSavedPreferences(startup);
      await page.screenshot({ path: testInfo.outputPath('phone-slow-startup-zh.png') });
      characters.release(); await characters.drain();
      const pending = await waitForPlayable(page);
      expect(pending.loading).toMatchObject({ stage: 'materials', loaded: 0, failed: 0, canPlay: true });
      expect(pending.debugLoading).toEqual(pending.loading);
      expect(pending.texts.join('\n')).toContain(pending.loading.label);
      expect(pending.palette.textureCount).toBe(0);
      expect(materialGate.seen.length).toBeGreaterThan(0);
      expect(previewGate.seen.length).toBeGreaterThan(0);
      expect(materialGate.delivered).toEqual([]); expect(previewGate.delivered).toEqual([]);
      assertScene(pending); assertSavedPreferences(pending);
      // The map list may legitimately scroll; only the fixed, visible Start
      // action is required here, not all four map targets at once.
      const start = pending.regions.find((r: any) => r.id === 'menu-start');
      expect(start).toBeDefined(); expect(start.disabled).toBe(false);
      expect(start.w).toBeGreaterThanOrEqual(44); expect(start.h).toBeGreaterThanOrEqual(44);
      expect(start.x).toBeGreaterThanOrEqual(0); expect(start.y).toBeGreaterThanOrEqual(0);
      expect(start.x + start.w).toBeLessThanOrEqual(320);
      expect(start.y + start.h).toBeLessThanOrEqual(568);
      await page.screenshot({ path: testInfo.outputPath('phone-pending-textures-zh.png') });
      await activateUi(page, 'menu-start', true);
      const entered = await loadingPaint(page, 1);
      expect(entered).toMatchObject({ ready: true, phase: 'freeze', actors: 10, skinnedBots: 9, playerAlive: true });
      expect(entered.playerId).not.toBeNull(); expect(entered.palette.textureCount).toBe(0);
      expect(materialGate.delivered).toEqual([]); expect(previewGate.delivered).toEqual([]);
      expect(entered.texts.join('\n')).not.toContain(pending.loading.label);
      assertScene(entered); assertSavedPreferences(entered);
      // Exercise the saved-butterfly preference through real firearm draw→idle
      // updates, not only the first frame which preceded the earlier regression.
      const playing = await loadingPaint(page, 45);
      expect(playing.clock - entered.clock).toBeCloseTo(1.5, 7);
      expect(playing.frame).toBeGreaterThan(entered.frame);
      expect(playing.weapon).toBe('usp'); assertScene(playing); assertSavedPreferences(playing);
      await page.screenshot({ path: testInfo.outputPath('phone-playable-fallback-zh.png') });
      materialGate.release(); previewGate.release();
      await materialGate.drain(); await previewGate.drain();
      await expect.poll(async () => (await loadingSnapshot(page)).loading.stage, { timeout: 30_000 }).toBe('ready');
      const recovered = await loadingPaint(page);
      expect(recovered).toMatchObject({ worldId: playing.worldId, playerId: playing.playerId,
        clock: playing.clock, pos: playing.pos, phase: playing.phase });
      assertScene(recovered); assertSavedPreferences(recovered);
      await page.screenshot({ path: testInfo.outputPath('phone-recovered-zh.png') });
      expect(errors).toEqual([]);
      for (const gate of [characters, materialGate, previewGate]) expect(gate.errors).toEqual([]);
      await testInfo.attach('phone-progressive-loading-evidence', { body: Buffer.from(JSON.stringify({ startup, pending, entered, playing, recovered }, null, 2)), contentType: 'application/json' });
    } finally { await closeProgressiveLoadingFixture(page, [characters, materialGate, previewGate]); }
  });
});

test('held photos do not gate ready or native Enter-the-Arena target; release preserves match and stable preview targets', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const materialGate = await holdReleaseResponses(page, photos);
  const previewGate = await holdReleaseResponses(page, previews);
  try {
    await openProgressiveLoadingFixture(page);
    const pending = await waitForPlayable(page);
    expect(materialGate.seen.length).toBeGreaterThan(0); expect(materialGate.delivered).toEqual([]);
    expect(pending.loading).toMatchObject({ stage: 'materials', loaded: 0, failed: 0, canPlay: true });
    expect(pending.loading.total).toBeGreaterThan(0);
    expect(pending.debugLoading).toEqual(pending.loading);
    expect(pending.texts.join('\n')).toContain(pending.loading.label);
    expect(pending.materialsReadyPromise).toBe(true); expect(pending.uvReady).toBe(true);
    expect(pending.palette.textureCount).toBe(0);
    expect(pending.materials.length).toBeGreaterThan(1);
    expect(pending.materials.every((m: any) => !m.map && m.color !== 0 && m.color !== 0xffffff)).toBe(true);
    assertScene(pending); assertCards(pending);
    expect(pending.texts.join('\n')).toMatch(/preview.*load|load.*preview/i);
    const targets = geometry(pending);
    const next = await loadingPaint(page, 1);
    expect(next.frame).toBeGreaterThan(pending.frame); expect(next.paints).toBeGreaterThan(pending.paints);
    await page.screenshot({ path: testInfo.outputPath('pending-textures-and-preview-placeholders.png') });
    await activateUi(page, 'menu-start');
    const playing = await loadingPaint(page, 2);
    expect(playing).toMatchObject({ ready: true, phase: 'freeze', actors: 10, skinnedBots: 9 });
    expect(playing.playerId).not.toBeNull(); expect(playing.loading.canPlay).toBe(true);
    expect(materialGate.delivered).toEqual([]); expect(playing.palette.textureCount).toBe(0);
    assertScene(playing);
    expect(playing.texts.join('\n')).not.toContain(pending.loading.label); // no persistent combat progress bar
    // A real held key and a non-default persisted setting must survive the late swap.
    await page.keyboard.down('w');
    const before = await loadingSnapshot(page);
    expect(before.keys).toContain('KeyW'); assertSavedPreferences(before);
    materialGate.release(); previewGate.release();
    await materialGate.drain(); await previewGate.drain();
    await expect.poll(async () => (await loadingSnapshot(page)).loading.stage, { timeout: 30_000 }).toBe('ready');
    const recovered = await loadingPaint(page);
    assertSavedPreferences(recovered);
    expect(recovered).toMatchObject({ worldId: before.worldId, playerId: before.playerId, phase: before.phase,
      clock: before.clock, pos: before.pos, settings: before.settings, keys: before.keys });
    expect(recovered.materials.map((m: any) => m.uuid)).toEqual(before.materials.map((m: any) => m.uuid));
    expect(recovered.palette.textureCount).toBeGreaterThan(0);
    expect(recovered.materials.every((m: any) => m.map)).toBe(true);
    expect(recovered.loading.loaded).toBe(recovered.loading.total);
    expect(recovered.frame).toBeGreaterThan(playing.frame); assertScene(recovered);
    expect(recovered.texts.join('\n')).not.toContain(pending.loading.label);
    await page.keyboard.up('w');
    await page.keyboard.press('3');
    expect((await loadingSnapshot(page)).weapon).toBe('knife');
    const advanced = await loadingPaint(page, 3);
    expect(advanced.clock - before.clock).toBeCloseTo(.1, 7);
    await page.screenshot({ path: testInfo.outputPath('recovered-materials-in-same-match.png') });
    await page.evaluate(() => (window as any).__CS_PROGRESSIVE__.menu());
    // Image completion is observed through actual canvas draws, not a fixed delay.
    await expect.poll(async () => (await loadingPaint(page)).texts.join('\n'), { timeout: 10_000 }).not.toMatch(/preview.*load|load.*preview/i);
    const menu = await loadingPaint(page);
    assertCards(menu); expect(geometry(menu)).toEqual(targets);
    await page.screenshot({ path: testInfo.outputPath('recovered-preview-layout.png') });
    expect(errors).toEqual([]); expect(materialGate.errors).toEqual([]); expect(previewGate.errors).toEqual([]);
    await testInfo.attach('pending-to-recovered-evidence', { body: Buffer.from(JSON.stringify({ pending, playing, before, recovered, menu }, null, 2)), contentType: 'application/json' });
  } finally { await closeProgressiveLoadingFixture(page, [materialGate, previewGate]); }
});

test('failed optional photos and previews retain colored playable fallback and clickable map choices', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const materialGate = await holdReleaseResponses(page, photos);
  const previewGate = await holdReleaseResponses(page, previews);
  try {
    await openProgressiveLoadingFixture(page);
    const pending = await waitForPlayable(page), targets = geometry(pending);
    materialGate.release(true); previewGate.release(true);
    await materialGate.drain(); await previewGate.drain();
    await expect.poll(async () => (await loadingSnapshot(page)).loading.stage, { timeout: 30_000 }).toBe('fallback');
    await expect.poll(async () => (await loadingPaint(page)).texts.join('\n')).toMatch(/preview.*unavailable|unavailable.*preview/i);
    const fallback = await loadingPaint(page, 1);
    expect(fallback.loading).toMatchObject({ loaded: 0, canPlay: true });
    expect(fallback.loading.failed).toBe(fallback.loading.total);
    expect(fallback.texts.join('\n')).toContain(fallback.loading.label);
    expect(fallback.palette.textureCount).toBe(0);
    expect(fallback.materials.every((m: any) => !m.map && m.color !== 0)).toBe(true);
    assertScene(fallback); assertCards(fallback); expect(geometry(fallback)).toEqual(targets);
    await page.screenshot({ path: testInfo.outputPath('fallback-unavailable-previews.png') });
    await activateUi(page, 'menu-map-de_inferno');
    await expect.poll(async () => (await loadingSnapshot(page)).map).toBe('de_inferno');
    const selected = await waitForPlayable(page);
    expect(selected.texts.join('\n')).toMatch(/Inferno/); assertCards(selected);
    // The actual 44px+ Enter target must still work after a failed preview choice.
    const enter = selected.regions.find((r: any) => r.id === 'menu-start');
    expect(enter.w).toBeGreaterThanOrEqual(44); expect(enter.h).toBeGreaterThanOrEqual(44);
    await activateUi(page, 'menu-start');
    const playing = await loadingPaint(page, 2);
    expect(playing).toMatchObject({ ready: true, phase: 'freeze', actors: 10, playerAlive: true });
    assertScene(playing);
    await page.screenshot({ path: testInfo.outputPath('fallback-playable.png') });
    expect(errors).toEqual([]); expect(materialGate.errors).toEqual([]); expect(previewGate.errors).toEqual([]);
  } finally { await closeProgressiveLoadingFixture(page, [materialGate, previewGate]); }
});

test('mandatory map geometry keeps the old world visible; switch and destroy retire held photo callbacks', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const materialGate = await holdReleaseResponses(page, photos);
  const mapGate = await holdReleaseResponses(page, /^assets\/de_dust2\.bsp$/);
  const previewGate = await holdReleaseResponses(page, previews);
  try {
    await openProgressiveLoadingFixture(page);
    const snow = await waitForPlayable(page); assertScene(snow); assertCards(snow);
    expect(previewGate.delivered).toEqual([]);
    // A slow preview must not disable an actual map selection.
    await activateUi(page, 'menu-map-de_dust2');
    await expect.poll(() => mapGate.seen.length).toBe(1);
    const switching = await loadingPaint(page, 1);
    expect(switching).toMatchObject({ worldId: snow.worldId, map: 'fy_snow', loading: { stage: 'map', canPlay: false } });
    expect(switching.frame).toBeGreaterThan(snow.frame); assertScene(switching);
    expect(mapGate.delivered).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('old-world-during-mandatory-map-load.png') });
    mapGate.release(); await mapGate.drain();
    await expect.poll(async () => (await loadingSnapshot(page)).map, { timeout: 60_000 }).toBe('de_dust2');
    const dust = await waitForPlayable(page);
    expect(dust.worldId).not.toBe(snow.worldId); expect(dust.palette.textureCount).toBe(0);
    expect(materialGate.delivered).toEqual([]); expect(previewGate.delivered).toEqual([]);
    assertScene(dust); assertCards(dust);
    await expect.poll(async () => (await loadingSnapshot(page)).retired.find((r: any) => r.id === snow.worldId)?.controllers).toBe(0);
    expect((await loadingSnapshot(page)).retired.find((r: any) => r.id === snow.worldId)).toMatchObject({ attached: false, status: 'disposed', lateBinds: 0 });
    const destroyed = await page.evaluate(() => (window as any).__CS_PROGRESSIVE__.destroy());
    expect(destroyed).toMatchObject({ disposed: true, ready: false, rendererGone: true, debugPresent: false, previewCacheSize: 0 });
    materialGate.release(); previewGate.release();
    await materialGate.drain(); await previewGate.drain();
    await page.evaluate(() => (window as any).__CS_PROGRESSIVE__.settle());
    // Real input after destroy cannot reach the detached instance either.
    await page.keyboard.press('Enter'); await page.keyboard.press('w');
    const late = await loadingSnapshot(page);
    expect(late).toMatchObject({ disposed: true, ready: false, rendererGone: true, worldId: destroyed.worldId,
      clock: destroyed.clock, paints: destroyed.paints, playerId: destroyed.playerId, debugPresent: false });
    expect(late.keys).toEqual([]);
    for (const retired of late.retired) expect(retired).toMatchObject({ attached: false, status: 'disposed', controllers: 0, lateBinds: 0, settled: true });
    expect(errors).toEqual([]); expect(materialGate.errors).toEqual([]); expect(mapGate.errors).toEqual([]); expect(previewGate.errors).toEqual([]);
    await testInfo.attach('switch-destroy-late-asset-evidence', { body: Buffer.from(JSON.stringify({ snow, switching, dust, destroyed, late }, null, 2)), contentType: 'application/json' });
  } finally { await closeProgressiveLoadingFixture(page, [materialGate, mapGate, previewGate]); }
});
