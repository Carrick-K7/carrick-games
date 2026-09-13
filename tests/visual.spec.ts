import { expect, test, type Page } from '@playwright/test';

async function waitForVisibleArtwork(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const viewport = document.getElementById('gameList')!.getBoundingClientRect();
    const artwork = [...document.querySelectorAll<HTMLElement>('.game-list-cover')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.bottom > viewport.top && box.top < viewport.bottom && box.right > viewport.left && box.left < viewport.right;
    });
    return artwork.length > 0 && artwork.every(element => {
      const image = element.querySelector<HTMLImageElement>('.game-cover-image');
      // Optional artwork may legitimately use an icon; real covers must finish decoding.
      return !image || (image.complete && image.naturalWidth > 0 && element.dataset.imageReady === 'true');
    });
  }), { message: 'Visible release artwork must settle before taking a visual reference' }).toBe(true);
}

test.describe('shell visual regression', () => {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const theme = mobile ? 'light' : 'dark';
    const variant = `${theme}-${mobile ? 'mobile' : 'desktop'}`;
    test.describe(`${theme} ${mobile ? 'touch phone' : 'mouse desktop'}`, () => {
      test.use({ viewport, hasTouch: mobile, isMobile: mobile });

      test(`refined game picker ${theme} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
        await page.goto('/#/snake');
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await page.keyboard.press('Control+k');
        await expect(page.locator(mobile ? '.library-dialog' : '#searchInput')).toBeFocused();
        await page.evaluate(() => document.fonts.ready);
        await waitForVisibleArtwork(page);
        await page.mouse.move(0, 0);
        // Game animation behind the backdrop is not a shell visual contract, and
        // neither is per-game card content: names, descriptions, control
        // summaries, artwork and group counts all come from 28 independently
        // released games. Masking them keeps this reference about the shell's own
        // layout, so a game release can never invalidate it.
        await expect(page.locator('.library-dialog')).toHaveScreenshot(`picker-${variant}.png`, {
          animations: 'disabled',
          mask: [
            page.locator('.game-list-cover'),
            page.locator('.game-list-name'),
            page.locator('.game-list-desc'),
            page.locator('.game-list-input'),
            page.locator('.game-group-count'),
            page.locator('#libraryResultCount'),
          ],
        });
      });

      test(`guide ${theme} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
        await page.goto('/#/snake');
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await page.locator('#helpBtn').click();
        await expect(page.locator('#helpBtn')).toHaveAttribute('aria-expanded', 'true');
        await page.evaluate(() => document.fonts.ready);
        // The guide names the running release, and that version changes on every
        // game release: masking the identity line keeps a game build from
        // invalidating a shell reference. The key rows stay visible because this
        // reference always drives one stable game and they render the shell's own
        // key-cap component; control-guide.spec.ts asserts their content and
        // geometry semantically.
        await expect(page.locator('#helpOverlay')).toHaveScreenshot(`controls-${variant}.png`, {
          animations: 'disabled',
          mask: [page.locator('#helpGameName'), page.locator('#helpGameVersion')],
        });
      });

      test(`minimal ${theme} ${mobile ? 'mobile' : 'desktop'} shell`, async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await expect(page.locator('#overflowMenu')).toBeVisible();
        await page.locator('#menuCloseBtn').click();
        await page.mouse.move(0, 0); // The close button can overlap a game-owned Collection target.
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`shell-minimal-${variant}.png`, {
          animations: 'disabled', mask: [page.locator('#gameCanvas')], fullPage: true,
        });
      });
    });
  }
});
