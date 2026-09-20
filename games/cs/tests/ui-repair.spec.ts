import { expect, test, type Page } from '@playwright/test';
import { swipe } from '../../../tests/support/responsiveHud';
import { activateUi, uiRegion } from './ui.fixture';

const info = (page: Page) => page.evaluate(() => (window as any).__CSX_DEBUG__?.info());
async function boot(page: Page, lang: string) {
  await page.addInitScript(lang => localStorage.setItem('cg-lang', lang), lang);
  await page.goto('/#/cs');
  await expect.poll(async () => (await info(page))?.ready, { timeout: 60_000 }).toBe(true);
}
async function reveal(page: Page, id: string, touch: boolean) {
  for (let n = 0; n < 12; n++) {
    if (await uiRegion(page, id)) return;
    const start = await uiRegion(page, 'menu-start') || await uiRegion(page, 'settings-reset');
    const bounds = page.viewportSize()!;
    const bottom = start ? start.y - 16 : bounds.height - 65;
    if (touch) {
      const header = await uiRegion(page, 'menu-settings') || await uiRegion(page, 'settings-close');
      const top = header ? header.y + header.h + 16 : 132;
      const distance = Math.max(24, Math.min(160, (bottom - top) / 2));
      await swipe(page, bounds.width / 2, bottom, bottom - distance);
    } else await page.mouse.wheel(0, 160);
  }
  await expect.poll(() => uiRegion(page, id)).not.toBeNull();
}

for (const [width, height, touch, lang] of [
  [1100, 640, false, 'en'], [320, 568, true, 'zh'], [568, 320, true, 'en'],
] as const) {
  test.describe(`CS selection ${width}x${height} ${lang}`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    test('keeps Start reachable in Team DM and settings never expose underlying choices', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await boot(page, lang);
      const before = (await uiRegion(page, 'menu-start'))!;
      await reveal(page, 'menu-mode-tdm', touch);
      await activateUi(page, 'menu-mode-tdm', touch);
      const after = (await uiRegion(page, 'menu-start'))!;
      expect(after).toMatchObject({ x: before.x, y: before.y, w: before.w, h: 48 });
      expect(after.y + after.h).toBeLessThanOrEqual(height - 12);
      const regions = await page.evaluate(() => (window as any).__CSX_DEBUG__.ui().regions.filter((r: any) => r.id));
      for (const r of regions) {
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(64);
        expect(r.x + r.w).toBeLessThanOrEqual(width); expect(r.y + r.h).toBeLessThanOrEqual(height);
      }
      await page.screenshot({ path: testInfo.outputPath('team-dm-selection.png') });
      await activateUi(page, 'menu-settings', touch);
      await expect.poll(async () => (await info(page)).settingsOpen).toBe(true);
      const settingsRegions = await page.evaluate(() => (window as any).__CSX_DEBUG__.ui().regions.filter((r: any) => r.id));
      expect(settingsRegions.every((r: any) => r.id.startsWith('settings-'))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('settings.png') });
      await activateUi(page, 'settings-close', touch);
      await activateUi(page, 'menu-start', touch);
      await expect.poll(async () => (await info(page)).playerAlive).toBe(true);
      expect((await info(page)).mode).toBe('tdm');
      if (touch) {
        await page.screenshot({ path: testInfo.outputPath('touch-hud.png') });
        await activateUi(page, 'touch-pause', true);
        await expect.poll(async () => (await info(page)).phase).toBe('paused');
        await page.screenshot({ path: testInfo.outputPath('pause.png') });
        await activateUi(page, 'pause-resume', true);
        await expect.poll(async () => (await info(page)).phase).not.toBe('paused');
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe('CS touch sliders and short shop', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test.setTimeout(120_000);

  test('horizontal slider drag changes sensitivity; vertical drag only scrolls', async ({ page }) => {
    await boot(page, 'zh'); await activateUi(page, 'menu-settings', true);
    const slider = (await uiRegion(page, 'settings-sensitivity'))!;
    const cdp = await page.context().newCDPSession(page);
    const y = slider.clientY, start = slider.x + slider.w * .3, end = slider.x + slider.w * .8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await info(page)).settings.sensitivity).toBeGreaterThan(3);
    const saved = (await info(page)).settings.sensitivity;
    await swipe(page, slider.clientX, slider.clientY, slider.clientY - 65);
    expect((await info(page)).settings.sensitivity).toBe(saved);
    await activateUi(page, 'settings-close', true);
    await page.reload(); await expect.poll(async () => (await info(page))?.ready, { timeout: 60_000 }).toBe(true);
    expect((await info(page)).settings.sensitivity).toBe(saved);
    await cdp.detach();
  });

  test('shop and tactical map keep close/actions inside the short viewport', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page, 'en');
    await reveal(page, 'menu-map-de_dust2', true);
    await activateUi(page, 'menu-map-de_dust2', true);
    await expect.poll(async () => (await info(page)).map, { timeout: 60_000 }).toBe('de_dust2');
    await activateUi(page, 'menu-start', true);
    await expect.poll(async () => (await info(page)).playerAlive).toBe(true);
    await page.keyboard.press('b');
    await expect.poll(() => uiRegion(page, 'shop-close')).not.toBeNull();
    for (let n = 0; n < 6 && !(await uiRegion(page, 'shop-category-equipment')); n++) await swipe(page, 420, 310, 165);
    await activateUi(page, 'shop-category-equipment', true);
    for (let n = 0; n < 8 && !(await uiRegion(page, 'shop-item-he')); n++) await swipe(page, 420, 310, 165);
    await activateUi(page, 'shop-item-he', true);
    await page.screenshot({ path: testInfo.outputPath('short-shop.png') });
    await activateUi(page, 'shop-close', true);
    await page.keyboard.press('m');
    await expect.poll(() => uiRegion(page, 'map-close')).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('short-tactical-map.png') });
    await activateUi(page, 'map-close', true);
    expect(errors).toEqual([]);
  });
});
