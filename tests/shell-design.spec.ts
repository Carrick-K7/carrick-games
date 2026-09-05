import { expect, test, type Locator, type Page } from '@playwright/test';

type Language = 'en' | 'zh';
type Theme = 'dark' | 'light';

async function openShell(page: Page, lang: Language = 'en', theme: Theme = 'dark') {
  await page.addInitScript(({ lang, theme }) => {
    localStorage.setItem('cg-lang', lang);
    localStorage.setItem('cg-theme', theme);
  }, { lang, theme });
  // A static, small game avoids animation and does not depend on the default entry.
  await page.goto('/#/snake');
  await expect(page.locator('#selectedGameLabel')).toHaveText(lang === 'zh' ? '贪吃蛇' : 'Snake');
  await expect(page.locator('#startOverlay')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, `${locator} should have layout bounds`).not.toBeNull();
  return box!;
}

async function noHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1);
}

async function touchTarget(locator: Locator) {
  const box = await bounds(locator);
  // DOMRects can report 39.999992px for a 40px target during translated menu entry.
  expect(Math.round(box.width * 1000) / 1000, `${locator} touch width`).toBeGreaterThanOrEqual(40);
  expect(Math.round(box.height * 1000) / 1000, `${locator} touch height`).toBeGreaterThanOrEqual(40);
}

test.describe('responsive shell design contracts', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 800 }]) {
    for (const theme of ['dark', 'light'] as const) {
      for (const lang of ['en', 'zh'] as const) {
        const mobile = viewport.width < 600;
        test(`${mobile ? 'mobile' : 'desktop'} ${theme} ${lang}: header, stage, picker and settings fit`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await openShell(page, lang, theme);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('#gamePickerBtn')).toHaveAccessibleName(/Snake|贪吃蛇/);
          await expect(page.locator('#overflowBtn')).toHaveAccessibleName(/settings|设置/i);
          const brand = await bounds(page.locator('.wordmark'));
          const picker = await bounds(page.locator('#gamePickerBtn'));
          const settings = await bounds(page.locator('#overflowBtn'));
          expect(brand.x + brand.width).toBeLessThanOrEqual(picker.x + 1);
          expect(picker.x + picker.width).toBeLessThanOrEqual(settings.x + 1);
          expect(Math.abs(picker.y + picker.height / 2 - settings.y - settings.height / 2)).toBeLessThanOrEqual(2);
          const header = await bounds(page.locator('.app-header'));
          const canvas = await bounds(page.locator('#gameCanvas'));
          // Display bounds, never canvas.width/height: backing stores scale with DPR.
          expect(canvas.width).toBeGreaterThan(200);
          expect(canvas.x).toBeGreaterThanOrEqual(0);
          expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(canvas.y).toBeGreaterThanOrEqual(header.y + header.height);
          expect(canvas.y + canvas.height).toBeLessThanOrEqual(viewport.height + 1);
          expect(Math.abs(canvas.x + canvas.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(3);
          await noHorizontalOverflow(page);
          if (mobile) {
            await expect(page.locator('#keyboardPanel')).toBeHidden();
            await touchTarget(page.locator('#gamePickerBtn'));
            await touchTarget(page.locator('#overflowBtn'));
          } else {
            await expect(page.locator('#keyboardPanel')).toBeVisible();
          }

          await page.locator('#overflowBtn').click();
          await expect(page.locator('#overflowBtn')).toHaveAttribute('aria-expanded', 'true');
          const menu = await bounds(page.locator('#overflowMenu'));
          expect(menu.x).toBeGreaterThanOrEqual(0);
          expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
          await expect(page.locator(`.lang-btn[data-lang="${lang}"]`)).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator(`.theme-btn[data-set="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
          if (mobile) {
            for (const button of await page.locator('#overflowMenu button:visible').all()) await touchTarget(button);
          }
          await noHorizontalOverflow(page);
          await page.keyboard.press('Escape');
          await expect(page.locator('#overflowMenu')).toBeHidden();

          await page.locator('#gamePickerBtn').click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveAccessibleName(/Choose a game|选择游戏/);
          await expect(dialog).toHaveAttribute('aria-modal', 'true');
          await expect(page.locator('#searchInput')).toBeFocused();
          // Visibility/autofocus can precede the 140ms entry animation; measure the settled layout.
          await dialog.evaluate(async (element) => {
            await Promise.all(element.getAnimations().map((animation) => animation.finished));
          });
          const dialogBox = await bounds(dialog);
          expect(dialogBox.x).toBeGreaterThanOrEqual(0);
          expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(dialogBox.y).toBeGreaterThanOrEqual(0);
          expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
          if (mobile) {
            expect(Math.abs(dialogBox.y + dialogBox.height - viewport.height)).toBeLessThanOrEqual(2);
            await touchTarget(page.locator('#libraryCloseBtn'));
            await touchTarget(page.locator('#searchInput'));
            for (const row of await page.locator('.game-list-item').all()) await touchTarget(row);
          } else {
            expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
            await expect(dialog.locator('kbd').first()).toBeVisible();
          }
          const current = page.locator('.game-list-item[data-id="snake"]');
          await expect(current.locator('.game-list-name')).toHaveText(lang === 'zh' ? '贪吃蛇' : 'Snake');
          await expect(current.locator('.game-list-desc')).not.toBeEmpty();
          await expect(current.locator('svg').first()).toHaveAttribute('aria-hidden', 'true');
          await noHorizontalOverflow(page);
          await page.keyboard.press('Escape');
          await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
          await expect(page.locator('#gamePickerBtn')).toBeFocused();
        });
      }
    }
  }

  test('palette shortcuts, row navigation, focus containment and dismissal', async ({ page }) => {
    await openShell(page);
    const trigger = page.locator('#gamePickerBtn');
    const search = page.locator('#searchInput');
    const dialog = page.getByRole('dialog');
    for (const shortcut of ['Control+k', 'Meta+k']) {
      await trigger.focus();
      await page.keyboard.press(shortcut);
      await expect(dialog).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(search).toBeFocused();
      await expect(page.locator('.app-header')).toHaveAttribute('inert', '');
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      await search.press('ArrowDown');
      const rows = page.locator('.game-list-item');
      await expect(rows.nth(0)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(rows.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(rows.nth(0)).toBeFocused();
      // Native inert + focus trap must keep keyboard focus inside the dialog at both ends.
      await rows.last().focus();
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.locator('#libraryCloseBtn').focus();
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
      await expect(page.locator('.app-header')).not.toHaveAttribute('inert', '');
    }
    await trigger.click();
    await expect(search).toBeFocused();
    // Hit the actual backdrop outside the panel, not a forced click through the dialog.
    await page.locator('[data-library-close]').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('search supports both languages, empty recovery and keyboard switching', async ({ page }) => {
    await openShell(page);
    await page.locator('#gamePickerBtn').click();
    const search = page.locator('#searchInput');
    await search.fill('no-such-game-987654321');
    await expect(page.locator('.game-list-item')).toHaveCount(0);
    await expect(page.locator('.search-empty')).toBeVisible();
    await search.press('ArrowDown');
    await expect(search).toBeFocused();
    for (const query of ['俄罗斯方块', 'Tetris']) {
      await search.fill(query);
      await expect(page.locator('.game-list-item')).toHaveCount(1);
      await expect(page.locator('.game-list-item')).toHaveAttribute('data-id', 'tetris');
    }
    await search.press('ArrowDown');
    await expect(page.locator('.game-list-item')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/tetris$/);
    await expect(page.locator('#selectedGameLabel')).toHaveText('Tetris');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#gamePickerBtn')).toBeFocused();
    await expect(page.locator('#gameCanvas')).toHaveAccessibleName(/Tetris/);
    await expect(page.locator('#startOverlay')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('search accepts real spaces without starting the game and Enter selects the first result', async ({ page }) => {
    await openShell(page);
    await page.locator('#gamePickerBtn').click();
    const search = page.locator('#searchInput');
    // Unlike fill(), sequential typing dispatches the Space key through game/shell handlers.
    await search.pressSequentially('space shooter');
    await expect(search).toHaveValue('space shooter');
    await expect(search).toBeFocused();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#selectedGameLabel')).toHaveText('Snake');
    await expect(page.locator('#startOverlay')).toBeVisible();
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await expect(page.locator('.game-list-item').first()).toHaveAttribute('data-id', 'spaceshooter');
    await search.press('Enter');
    await expect(page).toHaveURL(/#\/spaceshooter$/);
    await expect(page.locator('#selectedGameLabel')).toHaveText('Space Shooter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#gamePickerBtn')).toBeFocused();
    await expect(page.locator('#startOverlay')).toBeVisible();
  });

  test('Chinese IME confirmation stays in search until composition is finished', async ({ page }) => {
    await openShell(page, 'zh');
    await page.locator('#gamePickerBtn').click();
    const search = page.locator('#searchInput');
    await search.fill('俄罗斯方块');
    for (const event of [
      { key: 'Enter', isComposing: true },
      { key: 'ArrowDown', isComposing: true },
      { key: 'Enter', keyCode: 229 },
    ]) {
      await search.dispatchEvent('keydown', event);
      await expect(search).toBeFocused();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('#selectedGameLabel')).toHaveText('贪吃蛇');
    }
    await search.press('Enter');
    await expect(page.locator('#selectedGameLabel')).toHaveText('俄罗斯方块');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('settings and palette release held gameplay keys before isolating input', async ({ page }) => {
    await openShell(page);
    await page.locator('#startOverlay').click();
    await page.evaluate(() => window.addEventListener('keyup', (event) => {
      document.documentElement.dataset.testReleasedKey = event.key;
    }));
    for (const trigger of ['#overflowBtn', '#gamePickerBtn']) {
      await page.evaluate(() => delete document.documentElement.dataset.testReleasedKey);
      await page.locator('#gameCanvas').focus();
      await page.keyboard.down('ArrowRight');
      await expect(page.locator('.vkey[data-key="ArrowRight"]')).toHaveClass(/pressed/);
      await page.locator(trigger).click();
      // The release must reach window, where BaseGame registers its listeners.
      await expect(page.locator('html')).toHaveAttribute('data-test-released-key', 'ArrowRight');
      await expect(page.locator('.vkey[data-key="ArrowRight"]')).not.toHaveClass(/pressed/);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.press('Escape');
    }
  });

  test('long input mappings stay inside the desktop gutter at 960px', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    await openShell(page);
    for (const game of [
      { id: 'wordle', name: 'Wordle' },
      { id: 'sudoku', name: 'Sudoku' },
      { id: 'connectfour', name: 'Connect Four' },
      { id: 'solitaire', name: 'Solitaire' },
    ]) {
      await test.step(game.name, async () => {
        await page.goto(`/#/${game.id}`);
        await expect(page.locator('#selectedGameLabel')).toHaveText(game.name);
        await expect(page.locator('#startOverlay')).toBeVisible();
        const panel = page.locator('#keyboardPanel');
        await expect(panel).toBeVisible();
        const panelBox = await bounds(panel);
        const keys = panel.locator('.vkey:visible');
        expect(await keys.count()).toBeGreaterThan(0);
        for (const key of await keys.all()) {
          const box = await bounds(key);
          expect(box.x).toBeGreaterThanOrEqual(panelBox.x - 1);
          expect(box.y).toBeGreaterThanOrEqual(panelBox.y - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(961);
          expect(box.y + box.height).toBeLessThanOrEqual(721);
        }
        await noHorizontalOverflow(page);
      });
    }
  });

  test('settings switch language and explicit/system themes with accessible state', async ({ page }) => {
    await openShell(page);
    const root = page.locator('html');
    for (const lang of ['zh', 'en'] as const) {
      await page.locator('#overflowBtn').click();
      await page.locator(`.lang-btn[data-lang="${lang}"]`).click();
      await expect(root).toHaveAttribute('data-lang', lang);
      await expect(page.locator('#selectedGameLabel')).toHaveText(lang === 'zh' ? '贪吃蛇' : 'Snake');
      await expect(page.locator('#overflowMenu')).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem('cg-lang'))).toBe(lang);
    }
    for (const theme of ['light', 'dark', 'system'] as const) {
      await page.locator('#overflowBtn').click();
      await page.locator(`.theme-btn[data-set="${theme}"]`).click();
      await expect(page.locator('#overflowMenu')).toBeHidden();
      await expect(page.locator(`.theme-btn[data-set="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('cg-theme'))).toBe(theme);
      if (theme === 'system') {
        await expect(root).not.toHaveAttribute('data-theme');
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme });
          await expect(root).toHaveCSS('color-scheme', colorScheme);
        }
      } else {
        await expect(root).toHaveAttribute('data-theme', theme);
        await expect(root).toHaveCSS('color-scheme', theme);
      }
    }
  });


  for (const game of [
    { id: 'snake', name: 'Snake' },
    { id: 'tetris', name: 'Tetris' },
    { id: 'gacha', name: 'Gacha' },
  ]) {
    test(`narrow landscape fits ${game.id} after portrait rotation`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await openShell(page);
      await page.goto(`/#/${game.id}`);
      await expect(page.locator('#selectedGameLabel')).toHaveText(game.name);
      await expect(page.locator('#startOverlay')).toBeVisible();
      await page.setViewportSize({ width: 667, height: 375 });
      const canvas = page.locator('#gameCanvas');
      await expect.poll(async () => {
        const box = await bounds(canvas);
        return box.y + box.height;
      }).toBeLessThanOrEqual(376);
      const box = await bounds(canvas);
      const header = await bounds(page.locator('.app-header'));
      expect(box.width).toBeGreaterThan(100);
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(668);
      expect(Math.abs(box.x + box.width / 2 - 667 / 2)).toBeLessThanOrEqual(3);
      await noHorizontalOverflow(page);
      const overlay = await bounds(page.locator('#startOverlay'));
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(overlay[key] - box[key])).toBeLessThanOrEqual(2);
      }
    });
  }

  test('reduced motion removes shell animation without disabling interactions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openShell(page);
    await page.locator('#gamePickerBtn').click();
    await expect(page.locator('#searchInput')).toBeFocused();
    const motion = await page.locator('.library-dialog, .game-list-item, #gamePickerBtn, #startOverlay').evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        const seconds = (value: string) => value.split(',').map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1));
        return { animation: seconds(style.animationDuration), transition: seconds(style.transitionDuration) };
      }),
    );
    for (const item of motion) {
      expect(Math.max(...item.animation)).toBeLessThanOrEqual(0.001);
      expect(Math.max(...item.transition)).toBeLessThanOrEqual(0.001);
    }
    await page.locator('#searchInput').fill('Snake');
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#startOverlay')).toBeVisible();
    await page.locator('#startOverlay').click();
    await expect(page.locator('#startOverlay')).toBeHidden();
  });
});
