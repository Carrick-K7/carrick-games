import { test, expect, type Page } from '@playwright/test';
import { rectsOverlap, type HudRect } from '@carrick/game-sdk/layout';
import { VILLA_ENTRANCE } from '../src/villaWorld';

type Utility = HudRect & { id: string; label: string };
async function utilities(page: Page): Promise<Utility[]> {
  return page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => {
    const box = canvas.getBoundingClientRect();
    const sx = box.width / Number(canvas.dataset.logicalWidth);
    const sy = box.height / Number(canvas.dataset.logicalHeight);
    const buttons = JSON.parse(canvas.dataset.villaUtilities || '[]');
    return buttons.map((button: { id: string; label: string; x: number; y: number; w: number; h: number }) => ({
      ...button, x: box.x + button.x * sx, y: box.y + button.y * sy, w: button.w * sx, h: button.h * sy,
    }));
  });
}

async function tapUtility(page: Page, id: string) {
  const button = (await utilities(page)).find(button => button.id === id);
  expect(button).toBeTruthy();
  await page.touchscreen.tap(button!.x + button!.w / 2, button!.y + button!.h / 2);
}

if (!process.env.GAME_ID || process.env.GAME_ID === 'villa') {
  test.describe('Villa direct utilities and game menu', () => {
    test.use({ hasTouch: true });
    test('two44 CSS utilities clear chrome, open map/terminal and preserve menu pause ownership', async ({ page }) => {
      test.setTimeout(60_000);
      await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/#/villa');
      const canvas = page.locator('#gameCanvas');
      // The first real software-GL scene compiles before the game marks itself running.
      await expect(canvas).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
      await expect(canvas).toHaveAttribute('data-viewport-mode', 'responsive');
      const prepareCount = await canvas.getAttribute('data-game-prepare-count');

      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await expect(canvas).toHaveAttribute('data-logical-width', String(viewport.width));
        const buttons = await utilities(page);
        expect(buttons.map(button => button.id)).toEqual(['map', 'terminal']);
        for (const button of buttons) {
          expect(button.w, button.id).toBeGreaterThanOrEqual(44);
          expect(button.h, button.id).toBeGreaterThanOrEqual(44);
          expect(button.x, button.id).toBeGreaterThanOrEqual(0);
          expect(button.y, button.id).toBeGreaterThanOrEqual(0);
          expect(button.x + button.w, button.id).toBeLessThanOrEqual(viewport.width);
          expect(button.y + button.h, button.id).toBeLessThanOrEqual(viewport.height);
          for (const selector of ['#siteBrand', '#helpBtn', '#overflowBtn']) {
            const chrome = (await page.locator(selector).boundingBox())!;
            expect(chrome, selector).toBeTruthy();
            expect(rectsOverlap(button, { x: chrome.x, y: chrome.y, w: chrome.width, h: chrome.height }), `${button.id}/${selector}`).toBe(false);
          }
        }
        expect(rectsOverlap(buttons[0], buttons[1])).toBe(false);
        expect(buttons[1].label).toBe('Terminal');
      }

      await tapUtility(page, 'map');
      await expect(canvas).toHaveAttribute('data-villa-map', 'true');
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-villa-map', 'false');
      await tapUtility(page, 'terminal');
      await expect(canvas).toHaveAttribute('data-villa-terminal', 'true');
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-villa-terminal', 'false');

      await page.locator('#overflowBtn').tap();
      const menu = page.locator('#overflowMenu');
      const actions = page.locator('#currentGameActions');
      const immersive = actions.locator('[data-action-id="villa-immersive"]');
      await expect(actions.getByRole('button')).toHaveCount(2);
      await expect(immersive).toHaveAccessibleName(/Immersive mode/);
      await expect(actions.locator('[data-action-id="villa-home"]')).toHaveAccessibleName(/Return to entrance/);
      await expect(immersive).toHaveAttribute('aria-pressed', 'false');
      await immersive.tap();
      await expect(immersive).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-villa-immersive', 'true');
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      await expect(menu).toBeVisible();
      expect((await utilities(page)).map(button => button.id)).toEqual(['map', 'terminal']);
      await immersive.tap();
      await expect(immersive).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-villa-immersive', 'false');
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');

      await actions.locator('[data-action-id="villa-home"]').tap();
      await expect(menu).toBeHidden();
      await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-position'))!)).toEqual(VILLA_ENTRANCE);
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);
      await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
    });
  });
}
