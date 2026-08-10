import { expect, test } from '@playwright/test';

test.describe('shell visual regression', () => {
  test('modern dark desktop shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('shell-modern-dark.png', {
      animations: 'disabled',
      mask: [page.locator('#gameCanvas')],
      fullPage: true,
    });
  });

  test('pixel light mobile shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('.style-btn[data-mode="pixel"]').click();
    await page.locator('.theme-btn[data-set="light"]').click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('shell-pixel-light-mobile.png', {
      animations: 'disabled',
      mask: [page.locator('#gameCanvas')],
      fullPage: true,
    });
  });
});
