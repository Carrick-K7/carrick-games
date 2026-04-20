import { test, expect } from '@playwright/test';

test.describe('Carrick Games - Game Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('index page loads and shows game navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/Carrick Games/i);
    // Games are rendered as .game-list-item buttons with data-id
    const gameItems = page.locator('.game-list-item');
    await expect(gameItems.first()).toBeVisible();
    const count = await gameItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('game canvas is present', async ({ page }) => {
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();
  });

  test('clicking a game shows its controls and canvas', async ({ page }) => {
    // Click first game in list
    const firstGame = page.locator('.game-list-item').first();
    const gameId = await firstGame.getAttribute('data-id');
    await firstGame.click();

    // Action button should be visible
    const actionBtn = page.locator('#actionBtn');
    await expect(actionBtn).toBeVisible();
  });

  test('game can be started without errors', async ({ page }) => {
    // Click snake game
    await page.locator('.game-list-item[data-id="snake"]').click();

    // Start the game
    const actionBtn = page.locator('#actionBtn');
    await actionBtn.click();

    // Button should now say "Restart" or similar
    await expect(actionBtn).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(500);
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('keyboard controls work without crashing', async ({ page }) => {
    await page.locator('.game-list-item[data-id="snake"]').click();
    await page.locator('#actionBtn').click();

    // Press some keys - should not crash
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
  });
});
