import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, filterFavicon } from '../../../tests/support/gameplay';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === 'chess') {
  test.describe('Game rules', () => {
    test('chess legal moves preserve king safety and castling rules', async ({ page }) => {
      await page.goto('/#/chess');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const result = await page.evaluate(async (moduleUrl) => {
        const { ChessGame } = await import(moduleUrl);
        const game = new ChessGame() as any;
        const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));
        const noCastling = { w: { K: false, Q: false }, b: { K: false, Q: false } };

        const checkingBoard = emptyBoard();
        checkingBoard[7][4] = { type: 'K', color: 'w' };
        checkingBoard[0][4] = { type: 'K', color: 'b' };
        checkingBoard[2][0] = { type: 'R', color: 'w' };
        game.moveHistory = [];
        const checkingMoveAllowed = game.getLegalMoves(checkingBoard, 2, 0, noCastling)
          .some((move: { r: number; c: number }) => move.r === 2 && move.c === 4);

        const pinnedBoard = emptyBoard();
        pinnedBoard[7][4] = { type: 'K', color: 'w' };
        pinnedBoard[0][0] = { type: 'K', color: 'b' };
        pinnedBoard[0][4] = { type: 'R', color: 'b' };
        pinnedBoard[6][4] = { type: 'R', color: 'w' };
        const selfCheckMoveAllowed = game.getLegalMoves(pinnedBoard, 6, 4, noCastling)
          .some((move: { r: number; c: number }) => move.r === 6 && move.c === 3);

        const castleBoard = emptyBoard();
        castleBoard[7][4] = { type: 'K', color: 'w' };
        castleBoard[7][7] = { type: 'R', color: 'w' };
        castleBoard[0][0] = { type: 'K', color: 'b' };
        castleBoard[0][5] = { type: 'R', color: 'b' };
        const throughCheckCastleAllowed = game.getLegalMoves(
          castleBoard,
          7,
          4,
          { w: { K: true, Q: false }, b: { K: false, Q: false } }
        ).some((move: { flags?: string }) => move.flags === 'castleK');

        game.destroy();
        return { checkingMoveAllowed, selfCheckMoveAllowed, throughCheckCastleAllowed };
      }, gameModuleUrl('chess'));

      expect(result).toEqual({
        checkingMoveAllowed: true,
        selfCheckMoveAllowed: false,
        throughCheckCastleAllowed: false,
      });
    });
  });

  test.describe('Carrick Games - Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/chess');
      await page.waitForTimeout(300);
    });

    test('switching away cancels pending chess AI work', async ({ page }) => {
      const { pageErrors } = await collectErrors(page);
      await selectGame(page, 'chess');
      await startGame(page);
      const canvas = page.locator('#gameCanvas');
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.78);
        await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.58);
      }
      await selectGame(page, 'snake');
      await page.waitForTimeout(700);
      expect(pageErrors).toEqual([]);
      await expect(page.locator('#selectedGameLabel')).toHaveText('贪吃蛇');
    });
  });

  test.describe('Stability', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/chess');
      await page.waitForTimeout(300);
    });

    test('chess: player can select a piece and AI responds', async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, 'chess');
      await startGame(page);

      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();

      if (box) {
        // Click a white pawn (bottom center-ish)
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85);
        await page.waitForTimeout(500);
        // Click forward square
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
        await page.waitForTimeout(2500); // AI thinks
      }

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
}
