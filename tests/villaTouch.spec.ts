import { test, expect } from '@playwright/test';

test('villa releases pointer lock when its game picker opens', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/#/villa');
  await page.locator('#startOverlay').click();
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('gameCanvas');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBeNull();
  await page.locator('.game-list-item[data-id="snake"]').click();
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-villa-renderer', /.+/);
});

test('villa coarse-pointer map and real multi-touch use usable targets and independent fingers', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/villa');
  await page.locator('#startOverlay').tap();
  const canvas = page.locator('#gameCanvas');
  const geometry = await canvas.evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const s = Math.min(3.5, Math.max(1.2, 1120 / c.clientWidth));
    const p = { x: 12 * s, y: 10 * s, w: 1120 - 24 * s, h: 700 - 20 * s };
    const tabW = (p.w - 64 * s) / 3 - 4 * s;
    const client = (x: number, y: number) => ({ x: r.x + x * r.width / 1120, y: r.y + y * r.height / 700 });
    return {
      map: client(1120 - 24 - 123 * s, 22 + 21 * s),
      home: client(1120 - 24 - 21 * s, 22 + 21 * s),
      thirdFloor: client(p.x + 8 * s + 2 * (tabW + 4 * s) + tabW / 2, p.y + 28 * s),
      close: client(p.x + p.w - 26 * s, p.y + 28 * s),
      tabHeight: 44 * s * r.height / 700,
      closeWidth: 40 * s * r.width / 1120,
      left: client(280, 410), right: client(750, 390),
    };
  });
  expect(geometry.tabHeight).toBeGreaterThanOrEqual(40);
  expect(geometry.closeWidth).toBeGreaterThanOrEqual(39.5);
  const beforeMap = await canvas.getAttribute('data-villa-position');
  await page.touchscreen.tap(geometry.map.x, geometry.map.y);
  await expect(canvas).toHaveAttribute('data-villa-map', 'true');
  await page.touchscreen.tap(geometry.thirdFloor.x, geometry.thirdFloor.y);
  await expect(canvas).toHaveAttribute('data-villa-map-floor', '3');
  expect(await canvas.getAttribute('data-villa-position')).toBe(beforeMap);
  await canvas.screenshot({ path: 'test-results/villa-mobile-map.png' });
  await page.touchscreen.tap(geometry.close.x, geometry.close.y);
  await expect(canvas).toHaveAttribute('data-villa-map', 'false');
  await page.touchscreen.tap(geometry.home.x, geometry.home.y);
  await expect(canvas).toHaveAttribute('data-villa-position', '{"x":0,"y":0,"z":11.5}');

  const cdp = await context.newCDPSession(page);
  const left = { ...geometry.left, id: 1 }, right = { ...geometry.right, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  const moving = { ...left, y: left.y - 28 }, looking = { ...right, x: right.x + 25 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moving, looking] });
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-look'))!).yaw).toBeLessThan(-0.1);
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-position'))!).z).toBeLessThan(11.4);
  // CDP touchEnd lists the released points, not the points that remain down.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [looking] });
  const z = JSON.parse((await canvas.getAttribute('data-villa-position'))!).z;
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-position'))!).z).toBeLessThan(z - 0.03);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const stopped = await canvas.getAttribute('data-villa-position');
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute('data-villa-position')).toBe(stopped);
  expect(errors).toEqual([]);
  await context.close();
});
