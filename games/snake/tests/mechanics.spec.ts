import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, openOverflow, filterFavicon } from '../../../tests/support/gameplay';

if (!process.env.GAME_ID || process.env.GAME_ID === 'snake') {
  test.describe('Carrick Games - Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/snake');
      await page.waitForTimeout(300);
    });

    test('snake can be started and restarted without errors', async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);

      await selectGame(page, 'snake');
      await startGame(page);

      // Play a few moves
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);

      // Restart from the quiet overflow menu.
      await openOverflow(page);
      await page.locator('#restartBtn').click();
      await page.waitForTimeout(500);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
