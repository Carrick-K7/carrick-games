import { test, expect, type Page } from '@playwright/test';

const CANVAS = '#gameCanvas';
async function startVilla(page: Page) {
  await page.goto('/#/villa');
  const canvas = page.locator(CANVAS);
  await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 45_000 });
  await page.locator('#startOverlay').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  return canvas;
}
async function assertWindow(page: Page, native: boolean) {
  await expect(page.locator('#gameApp')).toHaveAttribute('data-fullscreen', native ? 'native' : 'viewport');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null)).toBe(native ? 'gameApp' : null);
  await expect(page.locator('[data-villa-fullscreen]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
    const rect = canvas.getBoundingClientRect(), root = document.getElementById('gameApp')!.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    return canvas.parentElement?.id === 'canvasWrapper'
      && Math.abs(rect.width - root.width) < 1 && Math.abs(rect.height - root.height) < 1
      && Math.abs(rect.x - root.x) < 1 && Math.abs(rect.y - root.y) < 1
      && style.borderLeftWidth === '0px' && style.borderTopWidth === '0px' && style.borderRadius === '0px';
  })).toBe(true);
}
async function assertRenderedCamera(page: Page) {
  const colors = await page.locator(CANVAS).evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas, data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const values = new Set<number>();
    for (let row = 0; row < 26; row++) for (let column = 0; column < 38; column++) {
      const x = Math.floor(width * (.12 + column / 38 * .76)), y = Math.floor(height * (.22 + row / 26 * .57));
      const at = (y * width + x) * 4;
      if (data[at + 3] > 240) values.add((data[at] << 16) | (data[at + 1] << 8) | data[at + 2]);
    }
    return values.size;
  });
  expect(colors).toBeGreaterThan(100);
}
function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test.describe('Villa uses the shared fullscreen game window', () => {
  test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

  test('fills the webpage by default; F and explicit menu action toggle native fullscreen without resetting play', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = captureErrors(page), canvas = await startVilla(page);
    await assertWindow(page, false);
    const before = await canvas.getAttribute('data-villa-position');
    const prepared = await canvas.getAttribute('data-game-prepare-count');
    await page.keyboard.press('f');
    await assertWindow(page, true);
    await assertRenderedCamera(page);
    await page.screenshot({ path: testInfo.outputPath('villa-native-fullscreen.png') });
    await page.keyboard.press('f');
    await assertWindow(page, false);
    await expect(canvas).toHaveAttribute('data-villa-position', before!);
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepared!);

    await page.locator('#overflowBtn').click();
    await page.locator('#fullscreenBtn').click();
    await assertWindow(page, true);
    await expect(page.locator('#overflowMenu')).toBeVisible();
    await page.locator('#fullscreenBtn').click();
    await assertWindow(page, false);
    await page.locator('#resumeBtn').click();
    expect(errors).toEqual([]);
  });

  test('native resize, picker focus and switching game keep the app root fullscreen', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = captureErrors(page), canvas = await startVilla(page);
    await page.keyboard.press('f'); await assertWindow(page, true);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 800 });
    await assertWindow(page, true);
    await assertRenderedCamera(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
    await expect(page.locator('#searchInput')).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('gameApp');
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('#startOverlay')).toHaveClass(/active/);
    await expect(canvas).not.toHaveAttribute('data-villa-renderer', /.+/);
    await expect(canvas).not.toHaveAttribute('data-villa-fullscreen-state', /.+/);
    await expect(canvas).toHaveAttribute('data-logical-width', '400');
    await expect(canvas).toHaveAttribute('data-logical-height', '400');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('gameApp');
    // Headless Chromium's DOM Escape does not invoke browser-chrome fullscreen
    // exit (also reproducible on a blank page). Exercise that external transition.
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await cdp.detach();
    await page.setViewportSize({ width: 1360, height: 900 });
    await expect.poll(() => canvas.evaluate(c => c.parentElement?.id)).toBe('canvasWrapper');
    expect(errors).toEqual([]);
  });

  test('denied native API leaves the already-full webpage intact and reports a quiet fallback', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      (window as any).deniedFullscreen = 0;
      Element.prototype.requestFullscreen = function () {
        (window as any).deniedFullscreen++;
        return Promise.reject(new DOMException('Denied for fallback test', 'NotAllowedError'));
      };
    });
    const errors = captureErrors(page), canvas = await startVilla(page);
    await expect.poll(() => page.evaluate(() => (window as any).deniedFullscreen)).toBe(0);
    await page.keyboard.press('f');
    await assertWindow(page, false);
    await expect(page.locator('#fullscreenNotice')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).deniedFullscreen)).toBe(1);
    await assertRenderedCamera(page);
    await page.setViewportSize({ width: 1280, height: 900 }); await assertWindow(page, false);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(canvas).not.toHaveAttribute('data-villa-fullscreen-state', /.+/);
    await expect(page.locator('[data-villa-fullscreen]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
