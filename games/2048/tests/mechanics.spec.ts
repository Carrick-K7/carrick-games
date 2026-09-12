import { test, expect } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === '2048') {
  test.describe('Game rules', () => {
    test('2048 can continue after reaching the winning tile', async ({ page }) => {
      await page.goto('/#/2048');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const hasWon = await page.evaluate(async (moduleUrl) => {
        const { Game2048 } = await import(moduleUrl);
        const game = new Game2048() as any;
        game.init();
        game.gameState = 'playing';
        game.hasWon = true;
        game.handleInput(new KeyboardEvent('keydown', { key: ' ' }));
        const result = game.hasWon;
        game.destroy();
        return result;
      }, gameModuleUrl('2048'));

      expect(hasWon).toBe(false);
    });
  });
}
