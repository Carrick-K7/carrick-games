import { expect, test, type Page } from '@playwright/test';
import { observeLabels, painted, swipe, tapLabel } from '../../../tests/support/responsiveHud';

const state = (page: Page) => page.evaluate(() => (window as any).__CSX_DEBUG__?.info() ?? { ready: false });
async function clickLabel(page: Page, pattern: RegExp) {
  await expect.poll(() => painted(page, pattern)).not.toBeNull();
  const p = (await painted(page, pattern))!;
  await page.mouse.click(p.x, p.y);
}
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
    await observeLabels(page);
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
    await ready(page);
    await clickLabel(page, /^Settings ·/);
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(true);
    await clickLabel(page, /^Butterfly$/);
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('butterfly');
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-desktop.png') });
    await clickLabel(page, /^Close$/);
    await clickLabel(page, /Enter (?:the )?Arena|ENTER ARENA/);
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

  test('Dust II loads both bomb sites and preserves the live match on resize', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error('[CS runtime]', error.stack); });
    await observeLabels(page);
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
    await ready(page);
    await clickLabel(page, /Dust II/);
    await expect.poll(async () => (await state(page)).map, { timeout: 60_000 }).toBe('de_dust2');
    await expect.poll(async () => (await state(page)).ready).toBe(true);
    await clickLabel(page, /Enter (?:the )?Arena|ENTER ARENA/);
    await expect.poll(async () => (await state(page)).bomb).toBe('carried');
    expect((await state(page)).skinnedBots).toBe(9);
    await page.screenshot({ path: testInfo.outputPath('cs-v28-dust2.png') });
    const round = (await state(page)).round;
    await page.setViewportSize({ width: 844, height: 390 });
    expect((await state(page)).round).toBe(round);
    expect((await state(page)).map).toBe('de_dust2');
    expect(errors).toEqual([]);
  });
});

test.describe('CS v28 touch settings', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('knife settings scroll without selecting underlying rows and persist after reload', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error('[CS runtime]', error.stack); });
    await observeLabels(page);
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'zh'));
    await ready(page);
    // Reach the menu's own settings row through the real touch scroller.
    for (let i = 0; i < 5 && !(await painted(page, /^设置$/)); i++) await swipe(page, 160, 460, 150);
    await tapLabel(page, /^设置$/);
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(true);
    await tapLabel(page, /^爪刀$/);
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('karambit');
    await swipe(page, 160, 425, 220);
    expect((await state(page)).settings.knifeModel).toBe('karambit');
    expect((await state(page)).phase).toBe('menu');
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-phone.png') });
    // Header remains fixed even when the body is scrolled.
    await page.touchscreen.tap(242, 98);
    await expect.poll(async () => (await state(page)).settingsOpen).toBe(false);
    await page.reload();
    await expect.poll(async () => (await state(page)).ready, { timeout: 60_000 }).toBe(true);
    expect((await state(page)).settings.knifeModel).toBe('karambit');
    await page.setViewportSize({ width: 844, height: 390 });
    for (let i = 0; i < 5 && !(await painted(page, /^设置$/)); i++) await swipe(page, 180, 310, 90);
    await tapLabel(page, /^设置$/);
    await swipe(page, 420, 270, 165);
    await swipe(page, 420, 270, 165);
    await page.screenshot({ path: testInfo.outputPath('cs-v28-settings-landscape.png') });
    await tapLabel(page, /^恢复默认设置$/);
    await expect.poll(async () => (await state(page)).settings.knifeModel).toBe('classic');
    expect(errors).toEqual([]);
  });
});
