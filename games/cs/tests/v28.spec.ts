import { expect, test, type Page } from '@playwright/test';
import { swipe } from '../../../tests/support/responsiveHud';
import { activateUi } from './ui.fixture';

const state = (page: Page) => page.evaluate(() => (window as any).__CSX_DEBUG__?.info() ?? { ready: false });
async function ready(page: Page) {
  await page.goto('/#/cs');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 60_000 });
  await expect.poll(async () => (await state(page)).ready, { timeout: 60_000 }).toBe(true);
}

test.describe('CS v28 integration', () => {
  test.setTimeout(150_000);
  test.use({ viewport: { width: 1280, height: 720 } });

  test('animated operators and butterfly handling use owned assets and pause with the shell', async ({ page }, testInfo) => {
    const errors: string[] = [], failed: string[] = [], assets: string[] = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('[CS runtime]', error.stack); });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (/\.(glb|wav|bsp|wad)$/.test(path)) {
        assets.push(path);
        if (response.status() >= 400) failed.push(path);
      }
    });
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
    await ready(page);
    await activateUi(page, 'menu-settings');
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(true);
    await activateUi(page, 'settings-knife-butterfly');
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('butterfly');
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-desktop.png') });
    await activateUi(page, 'settings-close');
    await activateUi(page, 'menu-start');
    await expect.poll(async () => (await state(page)).skinnedBots).toBe(9);
    await page.evaluate(() => (window as any).__CSX_DEBUG__.skipFreeze());
    await expect.poll(async () => (await state(page)).phase).toBe('active');
    await page.keyboard.press('3');
    await expect.poll(async () => (await state(page)).knifeModel).toBe('butterfly');
    const start = (await state(page)).clock;
    await expect.poll(async () => {
      const current = await state(page);
      return { errors, phase: current.phase, deployed: current.clock > start + 1.4 };
    }, { timeout: 30_000 }).toEqual({ errors: [], phase: 'active', deployed: true });
    await page.keyboard.press('f');
    await expect.poll(async () => (await state(page)).inspectAt).toBeGreaterThan(start);
    await page.screenshot({ path: testInfo.outputPath('cs-v28-butterfly.png') });
    // Leave pointer capture using the browser path, never synthesize a fullscreen action.
    await page.evaluate(() => document.exitPointerLock());
    await page.locator('#helpBtn').click();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
    const clock = (await state(page)).clock;
    await page.waitForTimeout(300);
    expect((await state(page)).clock).toBe(clock);
    await page.locator('#helpCloseBtn').click();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'active');
    const base = (await page.locator('#gameCanvas').getAttribute('data-game-asset-base'))!;
    expect(assets.filter(path => !path.startsWith(base))).toEqual([]);
    expect(assets.some(path => path.endsWith('/characters/ct-sample.glb'))).toBe(true);
    expect(assets.some(path => path.endsWith('/characters/t-sample.glb'))).toBe(true);
    expect(assets.some(path => path.includes('/audio/csgo/'))).toBe(true);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Dust II preserves the paused live match across desktop and phone shapes', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error('[CS runtime]', error.stack); });
    await page.addInitScript(() => {
      localStorage.setItem('cg-lang', 'en');
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined });
    });
    await ready(page);
    await activateUi(page, 'menu-map-de_dust2');
    await expect.poll(async () => (await state(page)).map, { timeout: 60_000 }).toBe('de_dust2');
    await expect.poll(async () => (await state(page)).ready).toBe(true);
    await activateUi(page, 'menu-start');
    await expect.poll(async () => (await state(page)).bomb).toBe('carried');
    expect((await state(page)).skinnedBots).toBe(9);
    await page.screenshot({ path: testInfo.outputPath('cs-v28-dust2.png') });
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await state(page)).phase).toBe('paused');
    const stable = async () => {
      const s = await state(page);
      return { phase: s.phase, map: s.map, mode: s.mode, round: s.round, playerAlive: s.playerAlive,
        playerPos: s.playerPos, mag: s.mag, reserve: s.reserve, scores: s.scores };
    };
    const initial = await stable(), prepared = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
    for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1080], [390, 844], [844, 390], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info().cameraAspect)).toBeCloseTo(width / height, 3);
      expect(await page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info().gunCameraAspect)).toBeCloseTo(width / height, 3);
      expect(await stable()).toEqual(initial);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('CS v28 touch settings', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('knife settings scroll without selecting underlying rows and persist after reload', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error('[CS runtime]', error.stack); });
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'zh'));
    await ready(page);
    // Settings is a fixed, reachable header target on every viewport.
    await activateUi(page, 'menu-settings', true);
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(true);
    await activateUi(page, 'settings-knife-karambit', true);
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('karambit');
    await swipe(page, 160, 425, 220);
    expect((await state(page)).settings.knifeModel).toBe('karambit');
    expect((await state(page)).phase).toBe('menu');
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-phone.png') });
    // Header remains fixed even when the body is scrolled.
    await activateUi(page, 'settings-close', true);
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(false);
    await page.reload();
    await expect.poll(async () => (await state(page)).ready, { timeout: 60_000 }).toBe(true);
    expect((await state(page)).settings.knifeModel).toBe('karambit');
    await page.setViewportSize({ width: 844, height: 390 });
    await activateUi(page, 'menu-settings', true);
    await swipe(page, 420, 270, 165);
    await swipe(page, 420, 270, 165);
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-landscape.png') });
    await activateUi(page, 'settings-reset', true);
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('classic');
    expect(errors).toEqual([]);
  });
});
