import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, filterFavicon } from '../../../tests/support/gameplay';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === 'minesweeper') {
  test.describe('Game rules', () => {
    test('minesweeper protects the first reveal and keeps a continuous timer', async ({ page }) => {
      await page.goto('/#/minesweeper');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const result = await page.evaluate(async (moduleUrl) => {
        const { MinesweeperGame } = await import(moduleUrl);
        const game = new MinesweeperGame() as any;
        game.init();
        game.beginAt(4, 4);
        game.update(1);
        game.beginAt(0, 0);
        game.update(1);
        const safeArea = game.grid.slice(3, 6).flatMap((row: number[]) => row.slice(3, 6));
        const outcome = {
          firstCell: game.grid[4][4],
          safeAreaHasMine: safeArea.includes(-1),
          timer: game.timer,
        };
        game.destroy();
        return outcome;
      }, gameModuleUrl('minesweeper'));

      expect(result.firstCell).toBeGreaterThanOrEqual(0);
      expect(result.safeAreaHasMine).toBe(false);
      expect(result.timer).toBeCloseTo(2, 5);
    });
  });

  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/minesweeper');
      await page.waitForTimeout(300);
    });

    test('minesweeper: clicking cells does not crash', async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, 'minesweeper');
      await startGame(page);

      const canvas = page.locator('#gameCanvas');
      const box = await canvas.boundingBox();

      if (box) {
        // Click a few cells on the grid
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            await page.mouse.click(
              box.x + box.width * (0.15 + c * 0.12),
              box.y + box.height * (0.25 + r * 0.12)
            );
            await page.waitForTimeout(200);
          }
        }
      }

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
