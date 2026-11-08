import { expect, test, type Page } from '@playwright/test';

// Moved intact in scope from the generic game-window suite: camera, player
// position/look and renderer budgets are Villa-owned rather than Shell fixtures.
const sizes = [
  { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 },
  { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 },
];
async function metrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
    const c = canvas.getBoundingClientRect();
    return { canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
      pixels: canvas.width * canvas.height, info: (window as any).__GAME_VIEWPORT_DEBUG__?.info(),
      overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

test('Villa: real viewport aspect, all screen shapes, and resize without reinitializing', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep geometry independent of CDP pointer-lock recenter deltas. The existing
  // villa-window spec continues to cover real pointer capture/release.
  await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/villa');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: 45_000 });
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'villa');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await page.keyboard.press('Escape');
  const state = () => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
    return { position: c.dataset.villaPosition, look: c.dataset.villaLook };
  });
  const initial = await state();
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
    expect(await state()).toEqual(initial);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('#keyboardPanel')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`villa-${size.width}x${size.height}.png`) });
  }
  expect(errors).toEqual([]);
});

test.describe('Villa bounded high-density renderer', () => {
  test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 2 });
  test('real 3D renderer keeps its pixel budget at 4K / DPR 2', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/#/villa');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'villa');
    await expect.poll(async () => {
      const m = await metrics(page);
      return m.info.width === 3840 && m.info.renderWidth > 0;
    }, { timeout: 30_000 }).toBe(true);
    const m = await metrics(page);
    expect(m.canvas).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
    expect(m.info.cameraAspect).toBeCloseTo(16 / 9, 3);
    expect(m.pixels).toBeLessThanOrEqual(8_294_400);
    expect(m.info.renderWidth * m.info.renderHeight).toBeLessThanOrEqual(4_200_000);
    expect(m.overflow).toBe(false);
  });
});
