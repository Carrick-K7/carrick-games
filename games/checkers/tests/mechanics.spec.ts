import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, filterFavicon } from '../../../tests/support/gameplay';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === 'checkers') {
  test.describe('Game rules', () => {
    test('checkers enforces mandatory captures and multi-jumps', async ({ page }) => {
      await page.goto('/#/checkers');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const result = await page.evaluate(async (moduleUrl) => {
        const { CheckersGame } = await import(moduleUrl);
        const game = new CheckersGame() as any;
        game.board = Array.from({ length: 8 }, () => Array(8).fill(0));
        game.board[1][5] = 1;
        game.board[2][4] = 2;
        game.board[4][2] = 2;
        game.board[7][7] = 1;
        game.currentPlayer = 1;

        const allMoves = game.getAllMoves(1);
        const ordinaryMoveIncluded = allMoves.some((move: { captures: unknown[] }) => move.captures.length === 0);
        game.executeMove(allMoves.find((move: { fromC: number }) => move.fromC === 1));

        const outcome = {
          ordinaryMoveIncluded,
          currentPlayer: game.currentPlayer,
          selected: game.selected,
          continuationTargets: game.validMoves.map((move: { toC: number; toR: number }) => [move.toC, move.toR]),
        };
        game.destroy();
        return outcome;
      }, gameModuleUrl('checkers'));

      expect(result.ordinaryMoveIncluded).toBe(false);
      expect(result.currentPlayer).toBe(1);
      expect(result.selected).toEqual({ c: 3, r: 3 });
      expect(result.continuationTargets).toContainEqual([5, 1]);
    });
  });

  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/checkers');
      await page.waitForTimeout(300);
    });

    test('checkers: player can make a move and AI responds', async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, 'checkers');
      await startGame(page);

      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Click a player piece (bottom-left area of board)
      if (box) {
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
        await page.waitForTimeout(400);
        // Click a valid destination square
        await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.65);
        await page.waitForTimeout(1500);
      }

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
