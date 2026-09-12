import { expect, test } from '@playwright/test';
import { observeLabels, painted, tapLabel, cancelTap, swipe } from '../../../tests/support/responsiveHud';

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
});
