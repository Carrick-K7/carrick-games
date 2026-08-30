import { expect, test } from '@playwright/test';

test.describe('shell visual regression', () => {
  test('minimal dark desktop shell', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('#overflowBtn').click();
    await page.locator('.theme-btn[data-set="dark"]').click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('shell-minimal-dark-desktop.png', {
      animations: 'disabled',
      mask: [page.locator('#gameCanvas')],
      fullPage: true,
    });
  });

  test('minimal light mobile shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#overflowBtn').click();
    await page.locator('.theme-btn[data-set="light"]').click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('shell-minimal-light-mobile.png', {
      animations: 'disabled',
      mask: [page.locator('#gameCanvas')],
      fullPage: true,
    });
  });
});
