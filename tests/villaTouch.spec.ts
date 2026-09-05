import { test, expect } from '@playwright/test';

test('villa captures mouse on start without extra keys and releases it for its picker', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/#/villa');
  await page.locator('#startOverlay').click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('gameCanvas');
  const canvas = page.locator('#gameCanvas');
  const before = await canvas.getAttribute('data-villa-look');
  // CDP absolute moves under pointer lock emit equal-and-opposite recenter
  // events. Supply raw relative MouseEvent deltas to the real document listener.
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 70, movementY: 12, bubbles: true })));
  await expect.poll(() => canvas.getAttribute('data-villa-look')).not.toBe(before);
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

test('villa hover-look works without dragging when capture is denied, and Escape frees the cursor', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Capture disabled by this test', 'NotAllowedError'));
  });
  await page.goto('/#/villa');
  await page.locator('#startOverlay').click();
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-villa-mouse-look', 'active');
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height * 0.48;
  await page.mouse.move(box.x + box.width * 0.4, y);
  const before = await canvas.getAttribute('data-villa-look');
  await page.mouse.move(box.x + box.width * 0.58, y + 15, { steps: 3 });
  await expect.poll(() => canvas.getAttribute('data-villa-look')).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-villa-mouse-look', 'cursor');
  const freed = await canvas.getAttribute('data-villa-look');
  await page.mouse.move(box.x + box.width * 0.7, y + 5, { steps: 3 });
  expect(await canvas.getAttribute('data-villa-look')).toBe(freed);
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect(canvas).toHaveAttribute('data-villa-mouse-look', 'active');
  await page.mouse.move(box.x + box.width * 0.55, y);
  await page.mouse.move(box.x + box.width * 0.65, y - 10);
  await expect.poll(() => canvas.getAttribute('data-villa-look')).not.toBe(freed);
});
