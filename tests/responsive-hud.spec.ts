import { expect, test, type Page } from '@playwright/test';
import { BUY_ZONE_RECT } from '../src/games/counterstrikeMap';

// Observe painted labels through the real canvas transform, rather than
// duplicating the HUD's hit-test geometry or reaching into game instances.
async function observeLabels(page: Page) {
  await page.addInitScript(() => {
    const labels: Record<string, { x: number; y: number; at: number }> = {};
    (window as any).__paintedHudLabels = labels;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.id === 'gameCanvas') {
        const m = this.getTransform(), r = this.canvas.getBoundingClientRect();
        labels[text] = { x: r.x + (m.a * x + m.c * y + m.e) * r.width / this.canvas.width,
          y: r.y + (m.b * x + m.d * y + m.f) * r.height / this.canvas.height, at: performance.now() };
      }
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
}
async function painted(page: Page, pattern: RegExp) {
  return page.evaluate(source => {
    const re = new RegExp(source);
    return Object.entries((window as any).__paintedHudLabels ?? {})
      .filter(([text, p]: [string, any]) => re.test(text) && performance.now() - p.at < 1000
        && p.x >= 0 && p.x < innerWidth && p.y >= 58 && p.y < innerHeight - 12)
      .map(([, p]) => p as { x: number; y: number })[0] ?? null;
  }, pattern.source);
}
async function tapLabel(page: Page, pattern: RegExp) {
  await expect.poll(() => painted(page, pattern)).not.toBeNull();
  const p = (await painted(page, pattern))!;
  await page.touchscreen.tap(p.x + 8, p.y);
}
async function cancelTap(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
}
async function swipe(page: Page, x: number, fromY: number, toY: number) {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromY) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: point(fromY + (toY - fromY) * i / 8),
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('responsive touch HUD interaction', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test.setTimeout(90_000);

  test('CS scrolls from a map card without selecting it, starts and exposes reachable pause', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await observeLabels(page);
    await page.goto('/#/cs');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
    const state = () => page.evaluate(() => (window as any).__CSX_DEBUG__.info());
    await expect.poll(async () => (await state()).ready, { timeout: 45_000 }).toBe(true);
    const before = (await state()).map;
    await expect.poll(() => painted(page, /炙热沙城|Dust II/)).not.toBeNull();
    const map = (await painted(page, /炙热沙城|Dust II/))!;
    await cancelTap(page, map.x + 35, map.y);
    expect((await state()).map).toBe(before);
    await swipe(page, map.x + 35, map.y, 72);
    // Complete the scroll using normal row content, not a tiny scrollbar.
    for (let i = 0; i < 3 && !(await painted(page, /进入战场|ENTER ARENA|Enter Arena/)); i++) {
      await swipe(page, 180, 310, 78);
    }
    expect((await state()).map).toBe(before);
    await tapLabel(page, /进入战场|ENTER ARENA|Enter Arena/);
    await expect.poll(async () => (await state()).playerAlive).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cs-touch-landscape-hud.png') });
    const ammo = (await state()).mag;
    await page.locator('#helpBtn').tap();
    await expect.poll(async () => (await state()).phase).toBe('paused');
    await page.locator('#helpCloseBtn').tap();
    await expect.poll(async () => (await state()).phase).not.toBe('paused');
    expect((await state()).mag).toBe(ammo);
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await tapLabel(page, /^Ⅱ$/);
    await expect.poll(async () => (await state()).phase).toBe('paused');
    await page.locator('#helpBtn').tap();
    await page.locator('#helpBtn').tap();
    await expect.poll(async () => (await state()).phase).toBe('paused');
    expect(errors).toEqual([]);
  });

  test('CS Kimi touch equipment scroll preserves funds, buys the visible row and closes', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await observeLabels(page);
    await page.goto('/#/cs-kimi');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
    // Exercise the real buy-zone rule rather than making buying global.
    await page.evaluate(({ x, y }) => (window as any).__CS_DEBUG__.tp(x, y), {
      x: BUY_ZONE_RECT.x + BUY_ZONE_RECT.w / 2, y: BUY_ZONE_RECT.y + BUY_ZONE_RECT.h / 2,
    });
    await tapLabel(page, /^(购买|BUY)$/);
    const open = () => page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info().buyOpen);
    await expect.poll(open).toBe(true);
    await page.locator('#helpBtn').tap();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
    await page.locator('#helpCloseBtn').tap();
    await expect.poll(open).toBe(true);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'active');
    await page.screenshot({ path: testInfo.outputPath('cs-kimi-touch-buy-categories.png') });
    await tapLabel(page, /^8\s+(装备|Equipment)$/);
    const canvas = page.locator('#gameCanvas');
    const money = () => canvas.getAttribute('data-counterstrike-state').then(s => Number(s?.match(/\$(\d+)/)?.[1]));
    const funds = await money();
    await expect.poll(() => painted(page, /Kevlar Vest/)).not.toBeNull();
    const row = (await painted(page, /Kevlar Vest/))!;
    await cancelTap(page, row.x + 45, row.y);
    expect(await money()).toBe(funds);
    await swipe(page, row.x + 45, row.y + 140, row.y + 12);
    expect(await money()).toBe(funds);
    await expect.poll(() => painted(page, /Nightvision/)).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('cs-kimi-touch-buy-scrolled.png') });
    await tapLabel(page, /Defusal Kit/);
    await expect.poll(money).toBe(funds - 200);
    await tapLabel(page, /^(关闭|CLOSE) ✕$/);
    await expect.poll(open).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('cs-kimi-touch-landscape-hud.png') });
    const paused = () => page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info().paused);
    const mag = () => page.evaluate(() => (window as any).__CS_DEBUG__.info().mag);
    const before = await mag();
    await page.keyboard.press('p');
    await expect.poll(paused).toBe(true);
    await page.locator('#helpBtn').tap();
    await page.locator('#helpCloseBtn').tap();
    await expect.poll(paused).toBe(true);
    await page.touchscreen.tap(120, 180);
    await expect.poll(paused).toBe(false);
    expect(await mag()).toBe(before);
    expect(errors).toEqual([]);
  });
});
