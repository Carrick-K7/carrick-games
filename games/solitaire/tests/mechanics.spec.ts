import { test, expect } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === 'solitaire') {
  test.describe('Game rules', () => {
    test('solitaire can select and move a face-up tableau sequence', async ({ page }) => {
      await page.goto('/#/solitaire');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const result = await page.evaluate(async (moduleUrl) => {
        const { SolitaireGame } = await import(moduleUrl);
        const game = new SolitaireGame() as any;
        game.init();
        game.phase = 'playing';
        game.tableau[0] = [
          { suit: 0, rank: 11, faceUp: true },
          { suit: 2, rank: 10, faceUp: true },
        ];
        game.tableau[1] = [{ suit: 2, rank: 12, faceUp: true }];
        game.handleClick({ type: 'tab', col: 0, index: 0 });
        game.handleClick({ type: 'tab', col: 1, index: 0 });
        const outcome = {
          foundations: game.foundations.length,
          sourceCount: game.tableau[0].length,
          destinationRanks: game.tableau[1].map((card: { rank: number }) => card.rank),
        };
        game.destroy();
        return outcome;
      }, gameModuleUrl('solitaire'));

      expect(result).toEqual({
        foundations: 4,
        sourceCount: 0,
        destinationRanks: [12, 11, 10],
      });
    });
  });
}
