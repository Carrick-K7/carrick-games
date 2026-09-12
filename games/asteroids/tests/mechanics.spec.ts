import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame } from '../../../tests/support/gameplay';

if (!process.env.GAME_ID || process.env.GAME_ID === 'asteroids') {
  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/asteroids');
      await page.waitForTimeout(300);
    });

    test('asteroids runs 10s without page errors', async ({ page }) => {
      const { pageErrors } = await collectErrors(page);
      await selectGame(page, 'asteroids');
      await startGame(page);
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(10000);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
