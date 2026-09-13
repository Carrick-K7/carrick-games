import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { gameModuleUrl } from '../../../tests/support/releases';
import { VILLA_VERSION } from '../src/villaVersion';
import { VILLA_RACING } from '../src/villaActivities';
import { VILLA_HOME_LIGHTS } from '../src/villaHome';

const moduleUrl = () => process.env.VILLA_MODULE_URL || gameModuleUrl('villa');
const terminal = (page: Page) => page.locator('div[data-villa-terminal]');
const canvas = (page: Page) => page.locator('#villa-smart-home-test');
const diagnostics = new WeakMap<Page, { runtime: string[]; console: string[] }>();

/** Real controller/scene and native browser input. Only the RAF clock/render budget
 * is controlled: no terminal actions, feeds or atmosphere state are mocked. */
async function mount(page: Page) {
  page.setDefaultTimeout(15_000); const log = { runtime: [] as string[], console: [] as string[] }; diagnostics.set(page, log);
  page.on('pageerror', error => log.runtime.push(error.stack ?? error.message)); page.on('console', message => { if (message.type() === 'error') log.console.push(message.text()); });
  await page.goto('/#/snake');
  await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); canvas.id = 'villa-smart-home-test'; canvas.tabIndex = 0;
    Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '5' }); document.querySelector('#gameApp')!.append(canvas);
    const f: any = { scores: 0, keyups: [], pRepeats: [] };
    const g = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => f.scores++, requestShellRender: () => {} }) as any;
    g.prepare(); g.start(); cancelAnimationFrame(g.animationId); f.g = g;
    f.resize = () => g.setViewport({ width: innerWidth, height: innerHeight, dpr: Math.min(2, devicePixelRatio), safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    f.tick = (count = 1) => { for (let i = 0; i < count; i++) g.update(.05); };
    f.render = () => { g.scene.softwareInputFrames = 0; g.scene.lastDrawAt = -Infinity; g.scene.securityLastAt = -Infinity; g.renderFrame(); };
    f.pose = (p: { x: number; y: number; z: number }, yaw = 0) => {
      if (g.state.seated) throw new Error('Fixture must leave its seat through actual E before repositioning');
      g.clearInput(); g.position = { ...p }; g.eyeY = p.y; g.yaw = yaw; g.pitch = -.12; g.transition = null;
      g.scene.updateActivities(g.time, g.state, g.position, g.yaw); g.publishState();
    };
    f.onKeyup = (event: KeyboardEvent) => f.keyups.push(event.key.toLowerCase()); window.addEventListener('keyup', f.onKeyup);
    f.onKeydown = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'p') f.pRepeats.push(event.repeat); }; window.addEventListener('keydown', f.onKeydown, true);
    f.resize(); f.render(); canvas.focus(); (window as any).__villaSmart = f;
  }, moduleUrl());
  await expect(canvas(page)).toHaveAttribute('data-villa-version', VILLA_VERSION, { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-villa-renderer', 'webgl');
  expect(await page.evaluate(() => (window as any).__villaSmart.g.running)).toBe(true);
}
async function tick(page: Page, count = 1, render = false) {
  await page.evaluate(({ count, render }) => { const f = (window as any).__villaSmart; f.tick(count); if (render) f.render(); }, { count, render });
}
async function cleanup(page: Page) {
  const screenshot = test.info().outputPath('villa-smart-final-view.png'); await page.screenshot({ path: screenshot }); await test.info().attach('villa-smart-final-view', { path: screenshot, contentType: 'image/png' });
  const log = diagnostics.get(page) ?? { runtime: [], console: [] }, logPath = test.info().outputPath('villa-browser-console.json');
  writeFileSync(logPath, JSON.stringify(log, null, 2)); await test.info().attach('villa-browser-console', { path: logPath, contentType: 'application/json' });
  const result = await page.evaluate(() => {
    const f = (window as any).__villaSmart; if (!f) return { clean: true, scores: 0 };
    window.removeEventListener('keyup', f.onKeyup); window.removeEventListener('keydown', f.onKeydown, true); f.g.destroy(); const clean = !Object.keys(f.g.canvas.dataset).some(k => k.startsWith('villa'));
    f.g.canvas.remove(); delete (window as any).__villaSmart; return { clean, scores: f.scores };
  });
  expect(result).toEqual({ clean: true, scores: 0 }); await expect(terminal(page)).toHaveCount(0); expect(log.runtime).toEqual([]);
}
async function feedStats(page: Page) {
  return page.locator('canvas[data-villa-security-feed]').evaluate((c: HTMLCanvasElement) => {
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, colors = new Set<number>(); let hash = 2166136261, luminance = 0, samples = 0;
    for (let y = 4; y < c.height - 4; y += 7) for (let x = 4; x < c.width - 4; x += 9) {
      const i = (y * c.width + x) * 4; colors.add((pixels[i] >> 3) * 1024 + (pixels[i + 1] >> 3) * 32 + (pixels[i + 2] >> 3));
      hash = Math.imul(hash ^ pixels[i] ^ (pixels[i + 1] << 8) ^ (pixels[i + 2] << 16), 16777619);
      luminance += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722; samples++;
    }
    return { width: c.width, height: c.height, colors: colors.size, hash: hash >>> 0, mean: luminance / samples };
  });
}

test('Villa1.1 terminal: native P releases capture, clears held walking/rally input, and closes without recapture', async ({ page }) => {
  test.setTimeout(120_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await mount(page);
  try {
    await page.evaluate(() => (window as any).__villaSmart.pose({ x: 0, y: 0, z: 20 }));
    await canvas(page).click({ position: { x: 450, y: 320 } });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('villa-smart-home-test');
    await page.keyboard.down('w'); await tick(page, 4); const before = await canvas(page).getAttribute('data-villa-position');
    await page.keyboard.down('p'); await expect(terminal(page)).toBeVisible(); await expect(canvas(page)).toHaveAttribute('data-villa-terminal', 'true');
    await page.keyboard.down('p'); // Native repeat=true while P is still held must not toggle the terminal.
    expect(await page.evaluate(() => (window as any).__villaSmart.pRepeats)).toEqual([false, true]);
    await expect(terminal(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(page.locator('[data-villa-terminal-close]')).toBeFocused();
    await tick(page, 20); expect(await canvas(page).getAttribute('data-villa-position')).toBe(before);
    await page.keyboard.up('w'); expect(await page.evaluate(() => (window as any).__villaSmart.keyups.includes('w'))).toBe(true);
    await page.locator('[data-villa-terminal-close]').click(); await tick(page, 10);
    await expect(terminal(page)).toBeHidden(); await expect(canvas(page)).toBeFocused(); expect(await canvas(page).getAttribute('data-villa-position')).toBe(before);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.keyboard.down('p'); await tick(page, 2); // Repeat now reaches the focused canvas after the internal close.
    await expect(terminal(page)).toBeHidden(); await page.keyboard.up('p');
    await page.keyboard.press('p'); await page.keyboard.press('Escape'); await tick(page, 2);
    await expect(terminal(page)).toBeHidden(); expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    // A genuinely driven simulator must also brake on terminal entry, not merely stop walking.
    await page.evaluate(p => (window as any).__villaSmart.pose(p), VILLA_RACING.exit);
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'racing');
    await page.keyboard.down('w'); await tick(page, 20); expect(await page.evaluate(() => (window as any).__villaSmart.g.state.race.speed)).toBeGreaterThan(0);
    await page.keyboard.press('p'); await tick(page, 2); expect(await page.evaluate(() => (window as any).__villaSmart.g.state.race.speed)).toBe(0);
    await page.keyboard.up('w'); await page.locator('[data-villa-terminal-close]').click(); await tick(page, 10);
    expect(await page.evaluate(() => (window as any).__villaSmart.g.state.race.speed)).toBe(0); expect(errors).toEqual([]);
  } finally { await cleanup(page); }
});

test('Villa1.1 terminal: real camera feeds differ, preserve the main view, and native light/weather commands fade gradually', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    const main = await page.evaluate(() => { const f = (window as any).__villaSmart; return { view: f.g.view(), position: { ...f.g.position }, camera: f.g.scene.camera.matrixWorld.toArray() }; });
    await page.keyboard.press('p'); await expect(terminal(page)).toBeVisible(); const hashes: number[] = []; let garageMean = 0;
    for (const id of ['entrance', 'living', 'garage']) {
      await page.locator(`[data-villa-camera="${id}"]`).click(); await tick(page, 0, true); const stats = await feedStats(page);
      expect(stats.width).toBe(512); expect(stats.height).toBe(288); expect(stats.colors, `${id} must not be the connecting placeholder`).toBeGreaterThan(35); hashes.push(stats.hash); if (id === 'garage') garageMean = stats.mean;
      await expect(page.locator(`[data-villa-camera="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
    expect(new Set(hashes).size).toBe(3);
    expect(await page.evaluate(() => { const f = (window as any).__villaSmart; return { view: f.g.view(), position: { ...f.g.position }, camera: f.g.scene.camera.matrixWorld.toArray() }; })).toEqual(main);
    const feedPath = test.info().outputPath('villa-live-garage-camera.png'); await page.locator('canvas[data-villa-security-feed]').screenshot({ path: feedPath });
    await test.info().attach('villa-live-garage-camera', { path: feedPath, contentType: 'image/png' });
    await page.locator('[data-villa-terminal-tab="home"]').click();
    for (const id of ['living', 'gallery-1', 'terrace', 'garage']) {
      await page.locator(`[data-villa-room-light="${id}"]`).click(); await expect(page.locator(`[data-villa-room-light="${id}"]`)).toHaveAttribute('aria-pressed', 'false');
    }
    const lights = JSON.parse((await canvas(page).getAttribute('data-villa-lights'))!);
    expect(Object.keys(lights)).toHaveLength(VILLA_HOME_LIGHTS.length); expect(lights.kitchen).toBe(true); expect(lights.living).toBe(false); expect(lights.terrace).toBe(false);
    expect(await page.evaluate(() => (window as any).__villaSmart.g.state.home.lightLevels.living)).toBe(1);
    await tick(page, 2); const dimming = await page.evaluate(() => (window as any).__villaSmart.g.state.home.lightLevels.living);
    expect(dimming).toBeGreaterThan(0); expect(dimming).toBeLessThan(1);
    await page.locator('[data-villa-terminal-tab="weather"]').click();
    const atmosphere = () => canvas(page).getAttribute('data-villa-atmosphere').then(s => JSON.parse(s!));
    const original = await atmosphere(); await page.locator('[data-villa-time="night"]').click(); await page.locator('[data-villa-weather="rain"]').click();
    await expect(canvas(page)).toHaveAttribute('data-villa-time', 'night'); await expect(canvas(page)).toHaveAttribute('data-villa-weather', 'rain'); expect(await atmosphere()).toEqual(original);
    await tick(page, 20); const midway = await atmosphere(); expect(midway.darkness).toBeGreaterThan(original.darkness); expect(midway.darkness).toBeLessThan(1); expect(midway.rain).toBeGreaterThan(0); expect(midway.rain).toBeLessThan(1);
    await page.locator('[data-villa-terminal-tab="cameras"]').click(); await tick(page, 0, true);
    expect((await feedStats(page)).mean, 'Night/rain plus switched-off garage lamps must change actual rendered lighting').toBeLessThan(garageMean - 1);
    await page.locator('[data-villa-terminal-tab="weather"]').click();
    await page.locator('[data-villa-time="day"]').click(); await page.locator('[data-villa-weather="clear"]').click(); expect(await atmosphere()).toEqual(midway);
    await tick(page, 20); const reversed = await atmosphere(); expect(reversed.darkness).toBeLessThan(midway.darkness); expect(reversed.rain).toBeLessThan(midway.rain);
    await tick(page, 360); expect(await atmosphere()).toEqual({ darkness: 0, rain: 0 });
    await page.locator('[data-villa-terminal-close]').click(); await tick(page, 0, true); expect(await page.evaluate(() => (window as any).__villaSmart.g.view())).toEqual(main.view);
  } finally { await cleanup(page); }
});

test('Villa1.1 terminal: keyboard range is Villa-only and persistent, UI keyup is safe, and aiming guides remain optional', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    const otherSettings = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /sensitivity/i.test(key) && key !== 'carrick:villa:look-sensitivity')));
    const mouseSweep = async () => {
      await page.mouse.move(450, 300); const before = await page.evaluate(() => (window as any).__villaSmart.g.yaw);
      await page.mouse.move(470, 300); return Math.abs(await page.evaluate(() => (window as any).__villaSmart.g.yaw) - before);
    };
    const normalLook = await mouseSweep(); expect(normalLook).toBeGreaterThan(.01);
    await page.keyboard.press('p'); await page.locator('[data-villa-terminal-tab="settings"]').click();
    const range = page.locator('input[data-villa-sensitivity]'); await range.focus(); await page.keyboard.press('Home'); await expect(canvas(page)).toHaveAttribute('data-villa-look-sensitivity', '0.25');
    await page.keyboard.press('End'); await expect(canvas(page)).toHaveAttribute('data-villa-look-sensitivity', '3');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await expect(canvas(page)).toHaveAttribute('data-villa-look-sensitivity', '2.5');
    const position = await canvas(page).getAttribute('data-villa-position'); await page.keyboard.down('w'); await tick(page, 10); await page.keyboard.up('w');
    expect(await canvas(page).getAttribute('data-villa-position')).toBe(position);
    expect(await page.evaluate(() => (window as any).__villaSmart.g.keys.size)).toBe(0);
    await expect(page.locator('[data-villa-aim-guide]')).toHaveAttribute('aria-pressed', 'true'); await page.locator('[data-villa-aim-guide]').click();
    expect(JSON.parse((await canvas(page).getAttribute('data-villa-snooker'))!).aimAssist).toBe(false);
    // Focus stays within the native dialog and Escape returns focus without pointer capture.
    await page.keyboard.press('Tab'); await expect(page.locator('[data-villa-fallback-action="villa-home"]')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('[data-villa-fallback-action="villa-immersive"]')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('[data-villa-terminal-close]')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(page.locator('[data-villa-fallback-action="villa-immersive"]')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(canvas(page)).toBeFocused(); expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    expect((await mouseSweep()) / normalLook).toBeCloseTo(2.5, 2);
    expect(await page.evaluate(() => localStorage.getItem('carrick:villa:look-sensitivity'))).toBe('2.5');
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /sensitivity/i.test(key) && key !== 'carrick:villa:look-sensitivity')))).toEqual(otherSettings);
    await page.evaluate(() => { const f = (window as any).__villaSmart; f.g.restart(); cancelAnimationFrame(f.g.animationId); f.resize(); f.render(); });
    await expect(canvas(page)).toHaveAttribute('data-villa-look-sensitivity', '2.5'); expect(JSON.parse((await canvas(page).getAttribute('data-villa-snooker'))!).aimAssist).toBe(true);
  } finally { await cleanup(page); }
});

test('Villa1.1 terminal: coarse portrait/landscape entry and native controls fit without stealing touch or keyboard input', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await mount(page);
    for (const viewport of [{ width: 360, height: 780 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => { const f = (window as any).__villaSmart; f.resize(); f.render(); });
      const entry = await page.evaluate(() => {
        const f = (window as any).__villaSmart, button = f.g.buttons().find((b: any) => b.id === 'terminal');
        if (!button) throw new Error('The painted native-terminal entry is missing');
        const r = f.g.canvas.getBoundingClientRect(); return { x: r.x + (button.x + button.w / 2) * r.width / f.g.width, y: r.y + (button.y + button.h / 2) * r.height / f.g.height };
      });
      await page.keyboard.down('w'); await tick(page, 3); const position = await canvas(page).getAttribute('data-villa-position');
      await page.touchscreen.tap(entry.x, entry.y); await expect(terminal(page)).toBeVisible(); await page.keyboard.up('w'); await tick(page, 5);
      expect(await canvas(page).getAttribute('data-villa-position')).toBe(position); await expect(page.locator('[data-villa-terminal-close]')).toBeFocused();
      const panel = await terminal(page).locator('[role="dialog"]').boundingBox(); expect(panel).not.toBeNull();
      expect(panel!.x).toBeGreaterThanOrEqual(0); expect(panel!.y, 'Terminal must stay below the shared utility row').toBeGreaterThanOrEqual(64); expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1); expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height + 1);
      for (const id of ['home', 'weather', 'settings', 'cameras']) {
        const tab = page.locator(`[data-villa-terminal-tab="${id}"]`); await tab.tap(); await expect(tab).toHaveAttribute('aria-selected', 'true'); expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const overflow = await terminal(page).locator('.vt-panel').evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1); expect(overflow).toBe(false);
      await page.locator('[data-villa-camera="drive"]').tap(); await tick(page, 0, true); expect((await feedStats(page)).colors).toBeGreaterThan(35);
      const image = test.info().outputPath(`villa-terminal-${viewport.width}x${viewport.height}.png`); await page.screenshot({ path: image }); await test.info().attach('villa-coarse-terminal', { path: image, contentType: 'image/png' });
      await page.locator('[data-villa-terminal-close]').tap(); await expect(terminal(page)).toBeHidden(); await tick(page, 5);
      expect(await canvas(page).getAttribute('data-villa-position')).toBe(position);
      expect(await page.evaluate(() => { const f = (window as any).__villaSmart; return !!f.g.joystick || !!f.g.lookTouch || !!document.pointerLockElement; })).toBe(false);
    }
  } finally {
    try { if (!page.isClosed()) await cleanup(page); } finally { await context.close(); }
  }
});
