import { test, expect } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

if (!process.env.GAME_ID || process.env.GAME_ID === 'gacha') {
  test.describe('Game rules', () => {
    test('Gacha records deterministic pulls, persists stats, and supports reset', async ({ page }) => {
      await page.goto('/#/gacha');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');

      const result = await page.evaluate(async (moduleUrl) => {
        localStorage.removeItem('gacha-stats');
        const { GachaGame } = await import(moduleUrl);
        const game = new GachaGame() as any;
        game.init();
        game.sfx.enabled = false;

        // Force a gold (rarespecial) roll: tier rng=0.9999, item rng=0 → gold 1.
        const sequence = [0.9999, 0];
        game.random = () => sequence.shift() ?? 0;

        game.startUnlock();
        const screenDuringUnlock = game.screen;
        const openStats = JSON.parse(JSON.stringify(game.stats));
        const firstPullIsNew = game.isNewItem;

        // Drive the unlock prelude and the strip animation to completion.
        let guard = 0;
        while (game.screen !== 'result' && guard < 4000) {
          game.update(1 / 60);
          guard++;
        }
        const finalStats = JSON.parse(JSON.stringify(game.stats));

        // Pull the very same item again: the NEW badge is only for the
        // first-ever pull of an item.
        const sequence2 = [0.9999, 0];
        game.random = () => sequence2.shift() ?? 0;
        game.startUnlock();
        const repeatPullIsNew = game.isNewItem;
        while (game.screen !== 'result' && guard < 8000) {
          game.update(1 / 60);
          guard++;
        }

        // Reset via Shift+R.
        game.handleInput(new KeyboardEvent('keydown', { key: 'R', shiftKey: true }));
        const resetStats = JSON.parse(JSON.stringify(game.stats));
        const storageWasCleared = localStorage.getItem('gacha-stats') === null;

        game.destroy();
        return { screenDuringUnlock, openStats, finalStats, resetStats, storageWasCleared, firstPullIsNew, repeatPullIsNew };
      }, gameModuleUrl('gacha'));

      expect(result.screenDuringUnlock).toBe('unlock');
      // NEW badge: only the first-ever pull of an item, never a repeat.
      expect(result.firstPullIsNew).toBe(true);
      expect(result.repeatPullIsNew).toBe(false);
      // Stats are recorded at open time, before the animation ends.
      expect(result.openStats.totalPulls).toBe(1);
      expect(result.openStats.tierCounts.rarespecial).toBe(1);
      expect(result.openStats.history).toHaveLength(1);
      // Finish state: gold item counted in itemCounts; history kept in memory.
      expect(result.finalStats.totalPulls).toBe(1);
      expect(result.finalStats.tierCounts.rarespecial).toBe(1);
      expect(Object.values(result.finalStats.itemCounts)[0]).toBe(1);
      // Reset restores defaults and clears storage.
      expect(result.resetStats.totalPulls).toBe(0);
      expect(result.resetStats.history).toHaveLength(0);
      expect(result.storageWasCleared).toBe(true);
    });
  });
}
