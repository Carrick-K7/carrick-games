import { expect, test, type Page } from '@playwright/test';

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
  for (const id of ['cs', 'cs-kimi', 'villa']) {
    test(`${id}: real viewport aspect, all screen shapes, and resize without reinitializing`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      // Keep this geometry test independent of CDP pointer-lock recenter deltas.
      // Real capture/release is covered by the dedicated interaction specs.
      await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined }));
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`/${id === 'cs-kimi' ? '?cs3d=force' : ''}#/${id}`);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: 45_000 });
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      if (id === 'cs') {
        await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info()?.ready), { timeout: 30_000 }).toBe(true);
        // CS keeps its own in-canvas arena menu; entering it starts the match.
        await page.locator('#gameCanvas').click({ position: { x: 314, y: 590 } });
        await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__.info().playerAlive)).toBe(true);
      }
      await page.keyboard.press('Escape');
      const state = () => page.evaluate(id => {
        if (id === 'cs') return (window as any).__CSX_DEBUG__.info();
        if (id === 'cs-kimi') return (window as any).__CS_DEBUG__.info();
        const c = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
        return { position: c.dataset.villaPosition, look: c.dataset.villaLook };
      }, id);
      const initial = await state();
      if (id !== 'villa') expect(typeof initial.mag).toBe('number');
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
        if (id === 'cs') expect(m.info.gunCameraAspect).toBeCloseTo(size.width / size.height, 3);
        expect(await state()).toEqual(initial);
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('#keyboardPanel')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`${id}-${size.width}x${size.height}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }

  test('CS Kimi software renderer follows the viewport without stretching its buffer', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto('/?cs3d=off#/cs-kimi');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
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

  test('F11 remains browser-owned in every shell state; resizing and switching stay independent', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__nativeCalls = 0;
      Element.prototype.requestFullscreen = async () => { (window as any).__nativeCalls++; };
      document.exitFullscreen = async () => { (window as any).__nativeCalls++; };
    });
    await page.goto('/#/snake');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('#startOverlay, #fullscreenBtn, #resumeBtn, #helpReturnBtn, #fullscreenNotice')).toHaveCount(0);
    // Headless DOM keys cannot stand in for browser chrome fullscreen. Check
    // non-interception explicitly, and exercise the resulting resize separately.
    const f11 = async () => expect(await page.evaluate(() => (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F11', code: 'F11', bubbles: true, cancelable: true }),
    ))).toBe(true);
    await f11();
    await page.locator('#helpBtn').click(); await f11();
    for (const size of [{ width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#helpOverlay')).toBeVisible();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '1');
      expect((await metrics(page)).overflow).toBe(false);
    }
    await page.locator('#helpCloseBtn').click();
    await page.locator('#overflowBtn').click(); await f11();
    await page.locator('#gamePickerBtn').click(); await f11();
    await page.locator('.game-list-item[data-id="tetris"]').click();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-width', '420');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('#gameCanvas')).toBeFocused();
    expect(await page.evaluate(() => (window as any).__nativeCalls)).toBe(0);
    const m = await metrics(page);
    expect(Math.min(Math.abs(m.canvas.width - m.root.width), Math.abs(m.canvas.height - m.root.height))).toBeLessThan(1);
  });

  test('no fullscreen API is needed for entering, learning and rotating a game', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    });
    await page.goto('/#/snake');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await page.locator('#helpBtn').click();
    await page.locator('#helpCloseBtn').click();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await page.locator('#overflowBtn').click();
    await page.locator('#menuCloseBtn').click();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '1');
    expect((await metrics(page)).overflow).toBe(false);
  });
});

test.describe('bounded high-density game windows', () => {
  test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 2 });
  test('all three real-3D renderers keep their pixel budgets at 4K / DPR 2', async ({ page }) => {
    test.setTimeout(180_000);
    for (const id of ['cs', 'cs-kimi', 'villa']) {
      await page.goto(`/${id === 'cs-kimi' ? '?cs3d=force' : ''}#/${id}`);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
      await expect.poll(async () => {
        const m = await metrics(page);
        return m.info.width === 3840 && m.info.renderWidth > 0;
      }, { timeout: 30_000 }).toBe(true);
      const m = await metrics(page);
      expect(m.canvas).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
      expect(m.info.cameraAspect).toBeCloseTo(16 / 9, 3);
      expect(m.pixels).toBeLessThanOrEqual(8_294_400);
      expect(m.info.renderWidth * m.info.renderHeight).toBeLessThanOrEqual(id === 'villa' ? 4_200_000 : 4_500_000);
      expect(m.overflow).toBe(false);
    }
  });
});
