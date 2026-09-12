import { expect, test } from '@playwright/test';
import { BUY_ZONE_RECT } from '../src/counterstrikeMap';
import { observeLabels, painted, tapLabel, cancelTap, swipe } from '../../../tests/support/responsiveHud';

test.describe('responsive touch HUD interaction', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test.setTimeout(90_000);

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
