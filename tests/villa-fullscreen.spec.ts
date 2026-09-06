import { test, expect, type Page } from '@playwright/test';

const CANVAS = '#gameCanvas', HOST = '[data-villa-fullscreen]';
const W = 1120, H = 700;

async function startVilla(page: Page) {
  await page.goto('/#/villa');
  const canvas = page.locator(CANVAS);
  await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 45_000 });
  await page.locator('#startOverlay').click();
  await expect(page.locator('#startOverlay')).not.toHaveClass(/active/);
  // A real browser Escape releases the game's automatic start capture. Native
  // fullscreen is requested only by the subsequent trusted key/mouse gesture.
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(canvas).toHaveAttribute('data-villa-fullscreen-state', 'window');
  return canvas;
}

async function snapshot(page: Page) {
  return page.locator(CANVAS).evaluate((canvas: HTMLCanvasElement) => ({
    style: canvas.getAttribute('style'),
    parent: canvas.parentElement?.id,
    siblings: Array.from(canvas.parentNode!.childNodes).map(node => node instanceof Element ? node.id || node.tagName : node.nodeType + ':' + node.textContent),
    width: canvas.getBoundingClientRect().width,
    height: canvas.getBoundingClientRect().height,
  }));
}

async function assertFullscreen(page: Page, native: boolean) {
  await expect(page.locator(CANVAS)).toHaveAttribute('data-villa-fullscreen-state', 'full');
  await expect(page.locator(HOST)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-villa-fullscreen') ?? false)).toBe(native);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!, host = document.querySelector('[data-villa-fullscreen]');
    const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
    const viewport = document.fullscreenElement === host ? null : window.visualViewport;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    const fittedWidth = Math.min(width, height * 1.6), fittedHeight = fittedWidth / 1.6;
    return canvas.parentElement === host && Math.abs(rect.width - fittedWidth) < 1 && Math.abs(rect.height - fittedHeight) < 1
      && Math.abs(rect.left - ((viewport?.offsetLeft ?? 0) + (width - fittedWidth) / 2)) < 1
      && Math.abs(rect.top - ((viewport?.offsetTop ?? 0) + (height - fittedHeight) / 2)) < 1
      && style.borderLeftWidth === '0px' && style.borderTopWidth === '0px'
      && style.paddingLeft === '0px' && style.paddingTop === '0px' && style.objectFit === 'fill';
  })).toBe(true);
}

async function clickLogical(page: Page, x: number, y: number) {
  const rect = (await page.locator(CANVAS).boundingBox())!;
  await page.mouse.click(rect.x + x / W * rect.width, rect.y + y / H * rect.height);
}
async function clickHud(page: Page, id: 'map' | 'time' | 'home' | 'fullscreen') {
  const slot = { map: 0, time: 1, home: 2, fullscreen: 5 }[id];
  // The desktop HUD has six118px buttons with9px gaps. Always map through
  // the current element rect, never cached normal-window/backing-store sizes.
  const start = W - 24 - 6 * 118 - 5 * 9;
  await clickLogical(page, start + slot * (118 + 9) + 59, 44);
}

async function assertRenderedCamera(page: Page) {
  const colors = await page.locator(CANVAS).evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas, data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const values = new Set<number>();
    // Exclude top/bottom HUD: color variation must come from the 3D camera.
    for (let row = 0; row < 26; row++) for (let column = 0; column < 38; column++) {
      const x = Math.floor(width * (.12 + column / 38 * .76)), y = Math.floor(height * (.22 + row / 26 * .57));
      const at = (y * width + x) * 4;
      if (data[at + 3] > 240) values.add((data[at] << 16) | (data[at + 1] << 8) | data[at + 2]);
    }
    return values.size;
  });
  expect(colors).toBeGreaterThan(100);
}

async function assertRestored(page: Page, before: Awaited<ReturnType<typeof snapshot>>) {
  await expect(page.locator(HOST)).toHaveCount(0);
  await expect(page.locator(CANVAS)).toHaveAttribute('data-villa-fullscreen-state', 'window');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect.poll(() => snapshot(page)).toEqual(before);
}

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test.describe('Villa fullscreen in the real desktop shell', () => {
  test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

  test('trusted F and HUD clicks enter native fullscreen, fit the camera, and restore exactly on Esc/repeat', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = captureErrors(page), canvas = await startVilla(page), before = await snapshot(page);
    await page.keyboard.press('f');
    await assertFullscreen(page, true);
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(before.width + 100);
    await assertRenderedCamera(page);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);

    const time = await canvas.getAttribute('data-villa-time');
    await clickHud(page, 'time'); await expect(canvas).toHaveAttribute('data-villa-time', time === 'day' ? 'evening' : 'day');
    await clickHud(page, 'home'); await expect(canvas).toHaveAttribute('data-villa-position', '{"x":0,"y":0,"z":11.5}');
    await page.screenshot({ path: testInfo.outputPath('villa-native-fullscreen.png') });
    await clickHud(page, 'map'); await expect(canvas).toHaveAttribute('data-villa-map', 'true');
    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-villa-map', 'false'); await assertRestored(page, before);

    await page.keyboard.press('f'); await assertFullscreen(page, true);
    await clickHud(page, 'fullscreen'); await assertRestored(page, before);
    await clickHud(page, 'fullscreen'); await assertFullscreen(page, true);
    await assertRenderedCamera(page);
    await page.keyboard.press('Escape'); await assertRestored(page, before);
    expect(errors).toEqual([]);
  });

  test('native fullscreen refits on resize and opening the shell picker restores focus and cleans up before another game', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = captureErrors(page), canvas = await startVilla(page);
    await page.keyboard.press('f'); await assertFullscreen(page, true);
    // setViewportSize also resizes the OS window, which Chromium correctly
    // rejects while native-fullscreen. Change viewport/monitor metrics directly
    // instead, exercising real resize/layout events without exiting fullscreen.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 800 });
    await assertFullscreen(page, true);
    await assertRenderedCamera(page);
    const time = await canvas.getAttribute('data-villa-time');
    await clickHud(page, 'time'); await expect(canvas).toHaveAttribute('data-villa-time', time === 'day' ? 'evening' : 'day');

    await page.keyboard.press('Control+k');
    await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
    await expect.poll(() => page.evaluate(() => ({
      focus: document.activeElement?.id || document.activeElement?.tagName,
      fullscreen: document.fullscreenElement?.tagName ?? null,
      hosts: document.querySelectorAll('[data-villa-fullscreen]').length,
      parent: document.querySelector('#gameCanvas')?.parentElement?.id,
      state: (document.querySelector('#gameCanvas') as HTMLCanvasElement).dataset.villaFullscreenState,
    })), { message: 'Native exit must preserve the shell picker search focus as well as restore the canvas' })
      .toEqual({ focus: 'searchInput', fullscreen: null, hosts: 0, parent: 'canvasWrapper', state: 'window' });
    await expect(page.locator(HOST)).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-villa-fullscreen-state', 'window');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null && document.pointerLockElement === null)).toBe(true);
    await expect.poll(() => canvas.evaluate(c => c.parentElement?.id)).toBe('canvasWrapper');
    expect((await canvas.boundingBox())!.width).toBeLessThan(1440 - 200);
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('#startOverlay')).toHaveClass(/active/);
    await expect(canvas).not.toHaveAttribute('data-villa-renderer', /.+/);
    await expect(canvas).not.toHaveAttribute('data-villa-fullscreen-state', /.+/);
    await expect(page.locator(HOST)).toHaveCount(0);
    await page.locator('#startOverlay').click(); await page.keyboard.press('f');
    await cdp.detach();
    await page.setViewportSize({ width: 1360, height: 900 });
    await expect(page.locator(HOST)).toHaveCount(0);
    await expect.poll(() => canvas.evaluate(c => c.parentElement?.id)).toBe('canvasWrapper');
    await expect.poll(() => canvas.evaluate(c => ({ width: c.dataset.logicalWidth, height: c.dataset.logicalHeight }))).toEqual({ width: '400', height: '400' });
    expect(errors).toEqual([]);
  });

  test('denied native API keeps a correctly fitted fallback and real Escape/re-entry/menu cleanup', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      (window as unknown as { villaDeniedFullscreen: number }).villaDeniedFullscreen = 0;
      Element.prototype.requestFullscreen = function () {
        (window as unknown as { villaDeniedFullscreen: number }).villaDeniedFullscreen++;
        return Promise.reject(new DOMException('Native fullscreen denied for fallback regression', 'NotAllowedError'));
      };
    });
    const errors = captureErrors(page), canvas = await startVilla(page), before = await snapshot(page);
    await page.keyboard.press('f'); await assertFullscreen(page, false); await assertRenderedCamera(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { villaDeniedFullscreen: number }).villaDeniedFullscreen)).toBe(1);
    const time = await canvas.getAttribute('data-villa-time');
    await clickHud(page, 'time'); await expect(canvas).toHaveAttribute('data-villa-time', time === 'day' ? 'evening' : 'day');
    await page.keyboard.press('Escape'); await assertRestored(page, before);
    await clickHud(page, 'fullscreen'); await assertFullscreen(page, false);
    await page.setViewportSize({ width: 1280, height: 900 }); await assertFullscreen(page, false);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#gameLibrary')).toHaveClass(/open/); await expect(page.locator('#searchInput')).toBeFocused();
    await expect(page.locator(HOST)).toHaveCount(0); await expect(canvas).toHaveAttribute('data-villa-fullscreen-state', 'window');
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(canvas).not.toHaveAttribute('data-villa-fullscreen-state', /.+/); await expect(page.locator(HOST)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
