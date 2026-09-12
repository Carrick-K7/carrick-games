import { expect, test } from '@playwright/test';
import { GAMES } from './support/catalog';

test('visual-viewport zoom reflows the library instead of shrinking text or losing its only scroller', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await page.goto('/#/snake');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await page.evaluate(() => document.fonts.ready);
  const prepare = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
  await page.locator('#siteBrand').click();
  await expect(page.locator('.game-list-item')).toHaveCount(GAMES.length);
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const factor of [2, 4]) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: factor });
      await expect.poll(() => page.locator('#gameApp').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(1120 / factor);
      await page.locator('.library-dialog').evaluate(async element => Promise.all(element.getAnimations({ subtree: true })
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => undefined))));
      await expect(page.locator('#searchInput')).toBeVisible();
      await expect(page.locator('#libraryCloseBtn')).toBeVisible();
      expect(await page.locator('.game-list-name').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(16);
      expect(await page.locator('.game-list-desc').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(14);
      if (factor === 4) expect(await page.locator('#gameList').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
      await page.locator('.game-list-item').last().scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const root = document.getElementById('gameApp')!.getBoundingClientRect();
        const close = document.getElementById('libraryCloseBtn')!.getBoundingClientRect();
        const last = [...document.querySelectorAll('.game-list-item')].at(-1)!.getBoundingClientRect();
        const scrollers = ['.library-content', '#gameList'].filter(selector => {
          const element = document.querySelector<HTMLElement>(selector)!;
          return ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1;
        });
        return { within: close.left >= root.left && close.right <= root.right && close.top >= root.top && close.bottom <= root.bottom, reachable: last.top < root.bottom && last.bottom > root.top, scrollers };
      });
      expect(geometry.within).toBe(true);
      expect(geometry.reachable).toBe(true);
      expect(geometry.scrollers).toHaveLength(1);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepare!);
  } finally {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await cdp.detach();
  }
});

test('forced colors and reduced motion retain visible selection, controls and keyboard access', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/#/snake');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  for (const id of ['siteBrand', 'helpBtn', 'overflowBtn']) {
    const box = (await page.locator(`#${id}`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBe(44);
  }
  await page.keyboard.press('Control+k');
  const current = page.locator('.game-list-item[data-id="snake"]');
  await expect(current).toHaveAttribute('aria-current', 'true');
  await expect(current).toHaveCSS('outline-style', 'solid');
  await current.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.library-dialog')).toBeHidden();
  await expect(page.locator('#gameCanvas')).toBeFocused();
});
