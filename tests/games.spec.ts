import { test, expect } from '@playwright/test';
import { collectErrors, selectGame, startGame, filterFavicon, canvasColorCount } from './support/gameplay';
import { KEYBOARD_GAMES as KEYBOARD_PROFILES, CLICK_GAMES as CLICK_PROFILES, selectedProfiles } from './support/profiles';

// Shared browser contracts consume metadata and release URLs, never game sources.
// A game-only job registers only its input profile and opens that release directly.
const KEYBOARD_GAMES = selectedProfiles(KEYBOARD_PROFILES);
const CLICK_GAMES = selectedProfiles(CLICK_PROFILES);
const ALL_GAME_IDS = [...KEYBOARD_GAMES, ...CLICK_GAMES].map(game => game.id);
const entryRoute = `/#/${process.env.GAME_ID || 'gacha'}`;

test.describe('Carrick Games - Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(entryRoute);
  });

  test('all games render HD Retro layered canvas scenes', async ({ page }) => {
    test.setTimeout(90_000);
    for (const id of ALL_GAME_IDS) {
      await selectGame(page, id);
      await startGame(page);
      const renderStyle = await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.renderStyle);
      expect(renderStyle).toBe('minimal-hd');
      expect(await canvasColorCount(page)).toBeGreaterThanOrEqual(1);
    }
  });

  test('all games accept real touch events without page errors', async ({ page }) => {
    test.setTimeout(90_000);
    const { pageErrors } = await collectErrors(page);
    for (const id of ALL_GAME_IDS) {
      await selectGame(page, id);
      await startGame(page);
      await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const touch = new Touch({
          identifier: 1,
          target: canvas,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          radiusX: 2,
          radiusY: 2,
        });
        canvas.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        }));
        canvas.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch],
        }));
      });
    }
    expect(pageErrors).toEqual([]);
  });
});

test.describe('Keyboard Games - Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(entryRoute);
  });

  for (const profile of KEYBOARD_GAMES) {
    test(`${profile.id}: starts and handles keyboard without errors`, async ({ page }) => {
      if (profile.id === 'villa') test.setTimeout(60_000); // Cold software WebGL + fourteen real key gestures.
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, profile.id);
      await startGame(page);
      for (const key of (profile.keys || [])) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(profile.delayMs || 1500);
      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});

test.describe('Click Games - Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(entryRoute);
  });

  for (const profile of CLICK_GAMES) {
    test(`${profile.id}: starts and handles clicks without errors`, async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);
      await selectGame(page, profile.id);
      await startGame(page);
      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toBeVisible();
      const clicks = profile.clicks || 1;
      for (let i = 0; i < clicks; i++) {
        // Click different positions to increase coverage.
        const box = await canvas.boundingBox();
        if (box) {
          const offsetX = box.width * (0.3 + (i % 3) * 0.2);
          const offsetY = box.height * (0.3 + (i % 2) * 0.3);
          await page.mouse.click(box.x + offsetX, box.y + offsetY);
        } else {
          await canvas.click();
        }
        await page.waitForTimeout(300);
      }
      // Wordle and Sudoku also benefit from keyboard input.
      if (profile.id === 'wordle') {
        await page.keyboard.press('a');
        await page.keyboard.press('p');
        await page.keyboard.press('p');
        await page.keyboard.press('l');
        await page.keyboard.press('e');
        await page.waitForTimeout(200);
      }
      if (profile.id === 'sudoku') {
        await page.keyboard.press('1');
        await page.keyboard.press('2');
        await page.waitForTimeout(200);
      }
      if (profile.id === 'texashold') {
        await page.keyboard.press('c');
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(profile.delayMs || 1000);
      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});
