import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame } from '../../../tests/support/gameplay';

if (!process.env.GAME_ID || process.env.GAME_ID === 'tetris') {
  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/tetris');
      await page.waitForTimeout(300);
    });

    test('tetris runs 10s without page errors', async ({ page }) => {
      const { pageErrors } = await collectErrors(page);
      await selectGame(page, 'tetris');
      await startGame(page);
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(8000);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
