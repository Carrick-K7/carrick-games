import { expect, test, type Page } from '@playwright/test';

// Moved from the generic game-window suite: renderer internals belong to CS Kimi
// and must still run in its game cell even when it is absent from publication.
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

test('CS Kimi: real viewport aspect, all screen shapes, and resize without reinitializing', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Real capture/release remains in the dedicated interaction specs, independent
  // of CDP pointer-lock recenter deltas in this camera/state geometry test.
  await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?cs3d=force#/cs-kimi');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: 45_000 });
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'cs-kimi');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await page.keyboard.press('Escape');
  const state = () => page.evaluate(() => (window as any).__CS_DEBUG__.info());
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
    expect(await state()).toEqual(initial);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('#keyboardPanel')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`cs-kimi-${size.width}x${size.height}.png`) });
  }
  expect(errors).toEqual([]);
});

test('CS Kimi software renderer follows the viewport without stretching its buffer', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/?cs3d=off#/cs-kimi');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'cs-kimi');
  await page.keyboard.press('Escape');
  const initial = await page.evaluate(() => (window as any).__CS_DEBUG__.info());
  for (const size of [sizes[2], sizes[3], sizes[4], sizes[5]]) {
    await page.setViewportSize(size);
    await expect.poll(async () => (await metrics(page)).info.width).toBe(size.width);
    const m = await metrics(page), aspect = size.width / size.height;
    expect(m.info.cameraAspect).toBeUndefined();
    expect(m.info.raycastWidth / m.info.raycastHeight).toBeCloseTo(aspect, 2);
    expect(m.info.projectionHalfFov).toBeCloseTo(Math.tan(66 * Math.PI / 360) * aspect / (16 / 9), 3);
    expect(m.canvas).toEqual({ x: 0, y: 0, ...size });
    expect(await page.evaluate(() => (window as any).__CS_DEBUG__.info())).toEqual(initial);
    await page.screenshot({ path: testInfo.outputPath(`cs-kimi-software-${size.width}x${size.height}.png`) });
  }
});

test.describe('CS Kimi bounded high-density renderer', () => {
  test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 2 });
  test('real 3D renderer keeps its pixel budget at 4K / DPR 2', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?cs3d=force#/cs-kimi');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'cs-kimi');
    await expect.poll(async () => {
      const m = await metrics(page);
      return m.info.width === 3840 && m.info.renderWidth > 0;
    }, { timeout: 30_000 }).toBe(true);
    const m = await metrics(page);
    expect(m.canvas).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
    expect(m.info.cameraAspect).toBeCloseTo(16 / 9, 3);
    expect(m.pixels).toBeLessThanOrEqual(8_294_400);
    expect(m.info.renderWidth * m.info.renderHeight).toBeLessThanOrEqual(4_500_000);
    expect(m.overflow).toBe(false);
  });
});
