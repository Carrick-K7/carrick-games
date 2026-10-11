import { expect, test, type Page } from '@playwright/test';
import { uiRegion } from './ui.fixture';

const sizes = [
  { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 },
  { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 },
];
async function metrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!, root = document.getElementById('gameApp')!;
    const c = canvas.getBoundingClientRect(), r = root.getBoundingClientRect();
    return { canvas: { x: c.x, y: c.y, width: c.width, height: c.height }, root: { x: r.x, y: r.y, width: r.width, height: r.height },
      pixels: canvas.width * canvas.height, info: (window as any).__GAME_VIEWPORT_DEBUG__?.info(),
      overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

test.describe('edge-to-edge game windows', () => {
  test('cs: real viewport aspect, all screen shapes, and resize without reinitializing', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Geometry is independent of pointer-lock recenter deltas; the dedicated
    // CS interaction specs exercise real capture/release.
    await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined }));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#/cs');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: 45_000 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info()?.ready), { timeout: 30_000 }).toBe(true);
    // Use the current painted target, never stale pixels or a state-changing QA hook.
    await expect.poll(() => uiRegion(page, 'menu-start')).not.toBeNull();
    const start = (await uiRegion(page, 'menu-start'))!;
    await page.mouse.click(start.clientX, start.clientY);
    await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__.info().playerAlive)).toBe(true);
    await page.keyboard.press('Escape');
    const state = () => page.evaluate(() => (window as any).__CSX_DEBUG__.info());
    const initial = await state();
    expect(typeof initial.mag).toBe('number');
    const prepared = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect.poll(async () => {
        const m = await metrics(page);
        return Math.abs(m.canvas.width - size.width) < 1 && Math.abs(m.canvas.height - size.height) < 1
          && Math.abs(m.canvas.x) < 1 && Math.abs(m.canvas.y) < 1
          && Math.abs(m.info.cameraAspect - size.width / size.height) < .002;
      }).toBe(true);
      const m = await metrics(page);
      expect(m.overflow).toBe(false);
      expect(m.pixels).toBeLessThanOrEqual(8_294_400);
      expect(m.info.width / m.info.height).toBeCloseTo(size.width / size.height, 3);
      expect(m.info.gunCameraAspect).toBeCloseTo(size.width / size.height, 3);
      expect(await state()).toEqual(initial);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
      await expect(page.locator('.app-header')).toBeHidden();
      await expect(page.locator('#keyboardPanel')).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`cs-${size.width}x${size.height}.png`) });
    }
    expect(errors).toEqual([]);
  });
});
