import { expect, test, type Locator, type Page } from '@playwright/test';

type Language = 'en' | 'zh';
type Theme = 'dark' | 'light';
async function openShell(page: Page, lang: Language = 'en', theme: Theme = 'dark') {
  await page.addInitScript(({ lang, theme }) => { localStorage.setItem('cg-lang', lang); localStorage.setItem('cg-theme', theme); }, { lang, theme });
  await page.goto('/#/snake');
  await expect(page.locator('#selectedGameLabel')).toHaveText(lang === 'zh' ? '贪吃蛇' : 'Snake');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await expect(page.locator('#startOverlay')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function bounds(locator: Locator) {
  const box = await locator.boundingBox(); expect(box).not.toBeNull(); return box!;
}
async function noOverflow(page: Page) {
  const s = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
  expect(s.sw).toBeLessThanOrEqual(s.w + 1); expect(s.sh).toBeLessThanOrEqual(s.h + 1);
}
async function target(locator: Locator) {
  const box = await bounds(locator);
  expect(box.width).toBeGreaterThanOrEqual(39.999); expect(box.height).toBeGreaterThanOrEqual(39.999);
}
async function openMenu(page: Page) { await page.locator('#overflowBtn').click(); await expect(page.locator('#overflowMenu')).toBeVisible(); }
async function openPicker(page: Page) { await page.keyboard.press('Control+k'); await expect(page.locator('.library-dialog')).toBeVisible(); }

test.describe('game-window shell design contracts', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 800 }]) {
    for (const theme of ['dark', 'light'] as const) for (const lang of ['en', 'zh'] as const) {
      const mobile = viewport.width < 600;
      test(`${mobile ? 'mobile' : 'desktop'} ${theme} ${lang}: stage fills the page and menus float without refitting`, async ({ page }) => {
        await page.setViewportSize(viewport); await openShell(page, lang, theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('#keyboardPanel')).toBeHidden();
        await expect(page.locator('#overflowBtn')).toHaveAccessibleName(/settings|设置/i);
        await target(page.locator('#overflowBtn'));
        await target(page.locator('#helpBtn'));
        await expect(page.locator('#helpBtn')).toHaveAccessibleName(/Controls|操作指南/);
        await expect(page.locator('#fullscreenBtn, #resumeBtn, #helpReturnBtn')).toHaveCount(0);
        const help = await bounds(page.locator('#helpBtn')), menuButton = await bounds(page.locator('#overflowBtn'));
        expect(help.width).toBe(44); expect(help.height).toBe(44);
        expect(menuButton.x - help.x - help.width).toBe(8);
        const root = await bounds(page.locator('#gameApp')), canvas = await bounds(page.locator('#gameCanvas'));
        expect(root).toEqual({ x: 0, y: 0, ...viewport });
        expect(canvas.width).toBeCloseTo(Math.min(viewport.width, viewport.height), 0);
        expect(canvas.height).toBeCloseTo(canvas.width, 0);
        expect(canvas.x).toBeGreaterThanOrEqual(0); expect(canvas.y).toBeGreaterThanOrEqual(0);
        expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(canvas.y + canvas.height).toBeLessThanOrEqual(viewport.height + 1);
        await noOverflow(page);
        await openMenu(page);
        await expect(page.locator('#overflowMenu')).toHaveAttribute('aria-modal', 'true');
        await expect(page.locator('main')).toHaveAttribute('inert', '');
        await expect(page.locator('#gamePickerBtn')).toHaveAccessibleName(/Snake|贪吃蛇/);
        expect(await bounds(page.locator('#gameCanvas'))).toEqual(canvas);
        const menu = await bounds(page.locator('#overflowMenu'));
        expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.y).toBeGreaterThanOrEqual(0);
        expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(menu.y + menu.height).toBeLessThanOrEqual(viewport.height + 1);
        await expect(page.locator(`.lang-btn[data-lang="${lang}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator(`.theme-btn[data-set="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
        for (const button of await page.locator('#overflowMenu button:visible').all()) await target(button);
        await page.locator('#gamePickerBtn').click();
        const dialog = page.locator('.library-dialog');
        await expect(dialog).toHaveAccessibleName(/Choose a game|选择游戏/);
        await expect(page.locator('#searchInput')).toBeFocused();
        await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
        const box = await bounds(dialog);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        if (mobile) expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(2);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden(); await expect(page.locator('#gameCanvas')).toBeFocused();
        await expect(page.locator('main')).not.toHaveAttribute('inert', '');
        await noOverflow(page);
      });
    }
  }

  test('palette shortcuts, row navigation, focus containment and dismissal', async ({ page }) => {
    await openShell(page);
    const trigger = page.locator('#overflowBtn'), search = page.locator('#searchInput'), dialog = page.locator('.library-dialog');
    for (const shortcut of ['Control+k', 'Meta+k']) {
      await trigger.focus(); await page.keyboard.press(shortcut);
      await expect(dialog).toBeVisible(); await expect(search).toBeFocused();
      await expect(page.locator('.header-actions')).toHaveAttribute('inert', '');
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      await search.press('ArrowDown'); const rows = page.locator('.game-list-item');
      await expect(rows.nth(0)).toBeFocused(); await page.keyboard.press('ArrowDown'); await expect(rows.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp'); await expect(rows.nth(0)).toBeFocused();
      await rows.last().focus(); await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.locator('#libraryCloseBtn').focus(); await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(page.locator('#gameCanvas')).toBeFocused();
      await expect(page.locator('.header-actions')).not.toHaveAttribute('inert', '');
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    }
    await openPicker(page);
    await page.locator('[data-library-close]').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden(); await expect(page.locator('#gameCanvas')).toBeFocused();
  });

  test('game menu traps focus and releases it on dismissal', async ({ page }) => {
    await openShell(page); await openMenu(page);
    const menu = page.locator('#overflowMenu');
    await menu.locator('button').last().focus(); await page.keyboard.press('Tab');
    expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.locator('#menuCloseBtn').focus(); await page.keyboard.press('Shift+Tab');
    expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(page.locator('#gameCanvas')).toBeFocused();
  });

  test('search supports both languages, empty recovery and keyboard switching', async ({ page }) => {
    await openShell(page); await openPicker(page);
    const search = page.locator('#searchInput');
    await search.fill('no-such-game-987654321'); await expect(page.locator('.game-list-item')).toHaveCount(0);
    await expect(page.locator('.search-empty')).toBeVisible(); await search.press('ArrowDown'); await expect(search).toBeFocused();
    for (const query of ['俄罗斯方块', 'Tetris']) {
      await search.fill(query); await expect(page.locator('.game-list-item')).toHaveCount(1);
      await expect(page.locator('.game-list-item')).toHaveAttribute('data-id', 'tetris');
    }
    await search.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/tetris$/); await expect(page.locator('#selectedGameLabel')).toHaveText('Tetris');
    await expect(page.locator('.library-dialog')).toBeHidden(); await expect(page.locator('#gameCanvas')).toBeFocused();
    await expect(page.locator('#gameCanvas')).toHaveAccessibleName(/Tetris/);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  });

  test('search accepts real spaces without starting the game and Enter selects the first result', async ({ page }) => {
    await openShell(page); await openPicker(page);
    const search = page.locator('#searchInput'); await search.pressSequentially('space shooter');
    await expect(search).toHaveValue('space shooter'); await expect(search).toBeFocused();
    await expect(page.locator('#selectedGameLabel')).toHaveText('Snake'); await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await search.press('Enter'); await expect(page).toHaveURL(/#\/spaceshooter$/);
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  });

  test('Chinese IME confirmation stays in search until composition is finished', async ({ page }) => {
    await openShell(page, 'zh'); await openPicker(page);
    const search = page.locator('#searchInput'); await search.fill('俄罗斯方块');
    for (const event of [{ key: 'Enter', isComposing: true }, { key: 'ArrowDown', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
      await search.dispatchEvent('keydown', event); await expect(search).toBeFocused();
      await expect(page.locator('.library-dialog')).toBeVisible(); await expect(page.locator('#selectedGameLabel')).toHaveText('贪吃蛇');
    }
    await search.press('Enter'); await expect(page.locator('#selectedGameLabel')).toHaveText('俄罗斯方块');
    await expect(page.locator('.library-dialog')).toBeHidden();
  });

  test('settings and palette release held gameplay keys before isolating input', async ({ page }) => {
    await openShell(page);
    await page.evaluate(() => window.addEventListener('keyup', event => { if (event.key === 'ArrowRight') document.documentElement.dataset.testReleasedKey = event.key; }));
    for (const mode of ['menu', 'picker']) {
      await page.evaluate(() => delete document.documentElement.dataset.testReleasedKey);
      await page.locator('#gameCanvas').focus(); await page.keyboard.down('ArrowRight');
      await expect(page.locator('.vkey[data-key="ArrowRight"]')).toHaveClass(/pressed/);
      if (mode === 'menu') await openMenu(page); else await openPicker(page);
      await expect(page.locator('html')).toHaveAttribute('data-test-released-key', 'ArrowRight');
      await expect(page.locator('.vkey[data-key="ArrowRight"]')).not.toHaveClass(/pressed/);
      await page.keyboard.up('ArrowRight'); await page.keyboard.press('Escape');
    }
  });

  test('long input mappings are usable in an optional overlay and never resize the game', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 }); await openShell(page);
    for (const id of ['wordle', 'sudoku', 'connectfour', 'solitaire']) {
      await page.goto(`/#/${id}`); await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      const before = await bounds(page.locator('#gameCanvas'));
      await page.locator('#helpBtn').click();
      const panel = page.locator('#keyboardPanel'); await expect(panel).toBeVisible();
      const box = await bounds(panel), keys = panel.locator('.vkey:visible');
      expect(await keys.count()).toBeGreaterThan(0);
      for (const key of await keys.all()) {
        const k = await bounds(key);
        expect(k.x).toBeGreaterThanOrEqual(box.x - 1); expect(k.x + k.width).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(k.y).toBeGreaterThanOrEqual(box.y - 1); expect(k.y + k.height).toBeLessThanOrEqual(box.y + box.height + 1);
        expect(k.x).toBeGreaterThanOrEqual(0); expect(k.x + k.width).toBeLessThanOrEqual(961);
        expect(k.y + k.height).toBeLessThanOrEqual(721);
      }
      expect(await bounds(page.locator('#gameCanvas'))).toEqual(before); await noOverflow(page);
    }
  });

  test('settings switch language and explicit/system themes with accessible state', async ({ page }) => {
    await openShell(page); const root = page.locator('html');
    for (const lang of ['zh', 'en'] as const) {
      await openMenu(page); await page.locator(`.lang-btn[data-lang="${lang}"]`).click();
      await expect(root).toHaveAttribute('data-lang', lang); await expect(page.locator('#selectedGameLabel')).toHaveText(lang === 'zh' ? '贪吃蛇' : 'Snake');
      await expect(page.locator('#overflowMenu')).toBeHidden(); expect(await page.evaluate(() => localStorage.getItem('cg-lang'))).toBe(lang);
    }
    for (const theme of ['light', 'dark', 'system'] as const) {
      await openMenu(page); await page.locator(`.theme-btn[data-set="${theme}"]`).click();
      await expect(page.locator('#overflowMenu')).toBeHidden(); await expect(page.locator(`.theme-btn[data-set="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('cg-theme'))).toBe(theme);
      if (theme === 'system') {
        await expect(root).not.toHaveAttribute('data-theme');
        for (const colorScheme of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme }); await expect(root).toHaveCSS('color-scheme', colorScheme); }
      } else { await expect(root).toHaveAttribute('data-theme', theme); await expect(root).toHaveCSS('color-scheme', theme); }
    }
  });

  for (const id of ['snake', 'tetris', 'gacha']) {
    test(`narrow landscape fits ${id} after portrait rotation`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 }); await openShell(page); await page.goto(`/#/${id}`);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      await page.setViewportSize({ width: 667, height: 375 });
      await expect.poll(async () => { const b = await bounds(page.locator('#gameCanvas')); return b.y + b.height; }).toBeLessThanOrEqual(376);
      const b = await bounds(page.locator('#gameCanvas'));
      expect(b.width).toBeGreaterThan(100); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(668); expect(Math.abs(b.x + b.width / 2 - 667 / 2)).toBeLessThanOrEqual(2);
      expect(Math.min(Math.abs(b.width - 667), Math.abs(b.height - 375))).toBeLessThanOrEqual(1);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      await noOverflow(page);
    });
  }

  test('reduced motion removes shell animation without disabling interactions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await openShell(page); await openPicker(page);
    await expect(page.locator('#searchInput')).toBeFocused();
    const motion = await page.locator('.library-dialog, .game-list-item, #gamePickerBtn').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      const seconds = (value: string) => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? .001 : 1));
      return { animation: seconds(style.animationDuration), transition: seconds(style.transitionDuration) };
    }));
    for (const item of motion) { expect(Math.max(...item.animation)).toBeLessThanOrEqual(.001); expect(Math.max(...item.transition)).toBeLessThanOrEqual(.001); }
    await page.locator('#searchInput').fill('Snake'); await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('.library-dialog')).toBeHidden();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  });
});
