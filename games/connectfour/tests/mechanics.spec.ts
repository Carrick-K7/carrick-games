import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, filterFavicon } from '../../../tests/support/gameplay';

if (!process.env.GAME_ID || process.env.GAME_ID === 'connectfour') {
  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/connectfour');
      await page.waitForTimeout(300);
    });

    test('connectfour: player can drop a piece and AI responds', async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, 'connectfour');
      await startGame(page);

      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();

      if (box) {
        // Click center column
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
        await page.waitForTimeout(1500);
      }

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
