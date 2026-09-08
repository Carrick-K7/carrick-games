import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`gacha progress stays at page top and clear of canvas/utilities ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (viewport.width === 320) await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
    await page.goto('/#/gacha');
    const hud = page.getByTestId('gacha-progress');
    await expect(hud).toBeVisible();
    await expect(hud.locator('[data-value="pulls"]')).toHaveText('0');
    await expect(hud.locator('[data-value="collection"]')).toHaveText('0.0%');
    await expect.poll(async () => {
      const h = (await hud.boundingBox())!;
      const c = (await page.locator('#gameCanvas').boundingBox())!;
      const utility = (await page.locator('#helpBtn').boundingBox())!;
      return h.y >= 0 && h.y < 30 && h.y + h.height <= c.y && h.x + h.width <= utility.x;
    }).toBe(true);
    await page.locator('#gameCanvas').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-gacha-screen', 'unlock');
    await expect(hud.locator('[data-value="pulls"]')).toHaveText('1');
    await expect(hud.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '0');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-gacha-screen', 'opening');
    await expect(hud).toBeVisible();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-gacha-screen', 'result', { timeout: 15000 });
    await expect(hud).toBeVisible();
    await page.reload();
    await expect(hud.locator('[data-value="pulls"]')).toHaveText('1');
    for (const [screen, inset] of [['gallery', 122], ['stats', 78]] as const) {
      await page.locator('#gameCanvas').evaluate((canvas, inset) => {
        const box = canvas.getBoundingClientRect();
        const logicalWidth = Math.round(Math.max(300, Math.min(1560, box.width)));
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, clientX: box.right - inset * box.width / logicalWidth,
          clientY: box.top + 32 * box.width / logicalWidth,
        }));
      }, inset);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-gacha-screen', screen);
      await expect(hud).toBeVisible();
      await expect(hud.locator('[data-value="pulls"]')).toHaveText('1');
      await page.locator('#gameCanvas').focus();
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Shift+R');
    await expect(hud.locator('[data-value="pulls"]')).toHaveText('0');
    await expect(hud.locator('[data-value="collection"]')).toHaveText('0.0%');
    await page.goto('/#/snake');
    await expect(hud).toHaveCount(0);
  });
}
