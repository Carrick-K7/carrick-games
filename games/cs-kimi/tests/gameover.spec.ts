import { test } from '@playwright/test';
import { runGameover } from '../../../tests/support/gameover';
import { gameoverProfile as profile, restartGameover } from './gameover.fixture';

test.describe('Game Over - Arcade', () => {
  test.beforeEach(async ({ page }) => {
    // Enter this package directly instead of loading an unrelated default game.
    await page.goto(`/#/${profile.id}`);
  });

  test(`${profile.id}: reaches game over and restarts cleanly`, async ({ page }) => {
    await runGameover(page, profile, restartGameover);
  });
});
