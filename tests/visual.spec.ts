import { expect, test } from '@playwright/test';

test.describe('shell visual regression', () => {
  for (const mobile of [false, true]) {
    test(`refined game picker ${mobile ? 'light mobile' : 'dark desktop'}`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      await page.goto('/#/snake');
      await page.locator('#overflowBtn').click();
      await page.locator(`.theme-btn[data-set="${mobile ? 'light' : 'dark'}"]`).click();
      await page.locator('#gamePickerBtn').click();
      await expect(page.locator('#searchInput')).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      // Capture the dialog only: game animation behind the backdrop is not a
      // shell visual contract and must not destabilize the reference image.
      await expect(page.locator('.library-dialog')).toHaveScreenshot(`picker-${mobile ? 'light-mobile' : 'dark-desktop'}.png`, {
        animations: 'disabled',
      });
    });
  }

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
