import { test, expect, type Page } from '@playwright/test';

const CANVAS = '#gameCanvas';
async function startVilla(page: Page, releaseCursor = true) {
  await page.goto('/#/villa');
  const canvas = page.locator(CANVAS);
  await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 45_000 });
  await page.locator('#startOverlay').click();
  if (releaseCursor) {
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  }
  return canvas;
}
async function assertWindow(page: Page) {
  await expect(page.locator('[data-villa-fullscreen], #fullscreenBtn, #resumeBtn, #helpReturnBtn')).toHaveCount(0);
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

test.describe('Villa’s direct help and browser-owned game window', () => {
  test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  test.setTimeout(90_000);

  test('captured play → ? → read → close continues directly without held movement or an extra Resume', async ({ page }, testInfo) => {
    const errors = captureErrors(page), canvas = await startVilla(page, false);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('gameCanvas');
    await assertWindow(page);
    const prepared = await canvas.getAttribute('data-game-prepare-count');
    await page.keyboard.down('w');
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await expect(page.locator('#helpCloseBtn')).toBeFocused();
    await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    const position = await canvas.getAttribute('data-villa-position');
    const look = await canvas.getAttribute('data-villa-look');
    await page.keyboard.up('w');
    await page.waitForTimeout(400);
    await expect(canvas).toHaveAttribute('data-villa-position', position!);
    await assertRenderedCamera(page);
    await page.screenshot({ path: testInfo.outputPath('villa-direct-help.png') });
    await page.locator('#helpCloseBtn').click();
    await expect(canvas).toBeFocused();
    await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('gameCanvas');
    await page.waitForTimeout(250);
    await expect(canvas).toHaveAttribute('data-villa-position', position!);
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepared!);
    await expect(canvas).toHaveAttribute('data-villa-look', look!);
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('gameCanvas');
    await page.keyboard.press('/'); // The retained Villa alias uses the same capture ownership.
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('window resizing, picker focus and switching keep the persistent root and clear old game state', async ({ page }) => {
    const errors = captureErrors(page), canvas = await startVilla(page);
    const prepared = await canvas.getAttribute('data-game-prepare-count');
    for (const size of [{ width: 1440, height: 800 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await assertWindow(page); await assertRenderedCamera(page);
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepared!);
    }
    await page.keyboard.press('Control+k');
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('#startOverlay')).toBeFocused();
    await expect(canvas).not.toHaveAttribute('data-villa-renderer', /.+/);
    await expect(canvas).toHaveAttribute('data-logical-width', '400');
    await expect(canvas).toHaveAttribute('data-logical-height', '400');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.setViewportSize({ width: 1360, height: 900 });
    await expect.poll(() => canvas.evaluate(c => c.parentElement?.id)).toBe('canvasWrapper');
    expect(errors).toEqual([]);
  });

  test('the retired F shortcut never requests fullscreen, even when its API rejects', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__nativeCalls = 0;
      Element.prototype.requestFullscreen = async () => {
        (window as any).__nativeCalls++;
        throw new DOMException('The app must not request fullscreen', 'NotAllowedError');
      };
    });
    const errors = captureErrors(page), canvas = await startVilla(page);
    await page.keyboard.press('f');
    await assertWindow(page); await assertRenderedCamera(page);
    await expect(canvas).not.toHaveAttribute('aria-label', /fullscreen|全屏/i);
    await page.locator('#helpBtn').click();
    await expect(page.locator('#keyboardPanel')).not.toContainText(/fullscreen|全屏/i);
    await page.locator('#helpBtn').click();
    await expect(canvas).toBeFocused();
    expect(await page.evaluate(() => (window as any).__nativeCalls)).toBe(0);
    expect(errors).toEqual([]);
  });
});
