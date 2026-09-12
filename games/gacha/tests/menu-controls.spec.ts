import { test, expect, type Page } from '@playwright/test';
import { rectsOverlap } from '@carrick/game-sdk/layout';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 240 },
  { width: 320, height: 240 },
];

async function pulls(page: Page): Promise<number> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gacha-stats') || '{}').totalPulls || 0);
}

async function navigationFits(page: Page) {
  const viewport = page.viewportSize()!;
  const buttons = page.locator('.gacha-navigation button');
  const rectangles = [];
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await button.getAttribute('aria-label')).toBe(await button.textContent());
    rectangles.push({ x: box.x, y: box.y, w: box.width, h: box.height });
  }
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) expect(rectsOverlap(rectangles[i], rectangles[j])).toBe(false);
  }
}

if (!process.env.GAME_ID || process.env.GAME_ID === 'gacha') {
  test.describe('Gacha native navigation and menu actions', () => {
    test.use({ hasTouch: true });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('cg-lang', 'en');
        localStorage.removeItem('gacha-stats');
      });
    });

    for (const viewport of viewports) {
      test(`${viewport.width}x${viewport.height}: one labeled Collection target stays at least44 real CSS pixels`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/#/gacha');
        const canvas = page.locator('#gameCanvas');
        await expect(canvas).toHaveAttribute('data-game-running', 'true');
        const collection = page.getByTestId('gacha-collection');
        await expect(collection).toHaveCount(1);
        await expect(collection).toHaveText('Collection');
        await expect(page.locator('.gacha-navigation button')).toHaveCount(1);
        await navigationFits(page);

        await collection.tap();
        await expect(canvas).toHaveAttribute('data-gacha-screen', 'gallery');
        await expect(collection).toHaveCount(0);
        await expect(page.getByTestId('gacha-back')).toHaveText('Back to Gacha');
        await navigationFits(page);
        await page.getByTestId('gacha-back').tap();
        await expect(canvas).toHaveAttribute('data-gacha-screen', 'menu');
        expect(await pulls(page)).toBe(0);

        const box = (await canvas.boundingBox())!;
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expect.poll(() => pulls(page)).toBe(1);
        await expect(canvas).toHaveAttribute('data-gacha-screen', /unlock|opening/);
        await expect(collection).toHaveCount(1);
        await expect(page.getByTestId('gacha-back')).toHaveCount(1);
        await navigationFits(page);
        await page.getByTestId('gacha-back').tap();
        await expect(canvas).toHaveAttribute('data-gacha-screen', 'menu');
        expect(await pulls(page)).toBe(1);
      });
    }

    test('keyboard activation, Stats, Sound and reveal navigation do not restart or duplicate pulls', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/#/gacha');
      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      const prepareCount = await canvas.getAttribute('data-game-prepare-count');
      await page.getByTestId('gacha-collection').focus();
      await page.keyboard.press('Space');
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'gallery');
      expect(await pulls(page)).toBe(0);
      await page.getByTestId('gacha-back').click();
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'menu');

      await page.locator('#overflowBtn').click();
      await expect(page.locator('#overflowMenu')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      const actions = page.locator('#currentGameActions');
      // CSS supplies the checked glyph, so use the host's stable action IDs.
      const sound = actions.locator('[data-action-id="gacha-sound"]');
      const stats = actions.locator('[data-action-id="gacha-stats"]');
      await expect(actions.getByRole('button')).toHaveCount(2);
      await expect(sound).toHaveAccessibleName(/Sound/);
      await expect(stats).toHaveAccessibleName(/Stats/);
      const beforeSound = await sound.getAttribute('aria-pressed');
      await sound.click();
      await expect(sound).toHaveAttribute('aria-pressed', beforeSound === 'true' ? 'false' : 'true');
      await expect(page.locator('#overflowMenu')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      expect(await pulls(page)).toBe(0);

      await stats.click();
      await expect(page.locator('#overflowMenu')).toBeHidden();
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'stats');
      await expect(page.getByTestId('gacha-back')).toHaveText('Back to Gacha');
      await page.getByTestId('gacha-back').click();
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'menu');
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);

      const box = (await canvas.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => pulls(page)).toBe(1);
      await page.locator('#overflowBtn').click();
      await expect(stats).toBeDisabled();
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      await sound.click();
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      expect(await pulls(page)).toBe(1);
      await page.locator('#overflowBtn').click();
      await page.getByTestId('gacha-collection').tap();
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'gallery');
      expect(await pulls(page)).toBe(1);
      await page.getByTestId('gacha-back').tap();
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'menu');
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);
    });
  });
}
