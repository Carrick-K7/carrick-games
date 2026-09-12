import { test, expect } from '@playwright/test';
import { builtCatalog, gameModuleUrl } from './support/releases';
import { GAMES, GAME_GROUPS } from './support/catalog';
import { ALL_GAME_IDS } from './support/profiles';
import { collectErrors, selectGame, startGame, openOverflow, filterFavicon } from './support/gameplay';

// Shell-only compatibility assertions, preserved separately from per-game jobs.
function gameModuleName(url: string): string | null {
  const pathname = new URL(url).pathname;
  const game = builtCatalog().games.find(game => new URL(game.entry, 'https://games.test').pathname === pathname);
  return game ? `${game.id}.js` : null;
}

test('failed dynamic game loads show a retry path', async ({ page }) => {
  const gachaModule = gameModuleUrl('gacha');
  await page.route(`**${gachaModule}`, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#loadError')).toBeVisible();
  await expect(page.locator('#retryLoadBtn')).toBeVisible();
  await page.unroute(`**${gachaModule}`);
  await page.locator('#retryLoadBtn').click();
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await expect(page.locator('#loadError')).toBeHidden();
});

test.describe('Carrick Games - Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('index page loads with an on-demand game picker', async ({ page }) => {
    await expect(page).toHaveTitle(/Carrick Games/i);
    await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Control+k');
    const gameItems = page.locator('.game-list-item');
    await expect(gameItems.first()).toBeVisible();
    await expect(gameItems).toHaveCount(GAMES.length);
    const knownGroups = new Set(GAME_GROUPS.map(group => group.id));
    const populatedGroups = new Set(GAMES.map(game => knownGroups.has(game.group) ? game.group : 'other'));
    await expect(page.locator('.game-list-group')).toHaveText(GAME_GROUPS.filter(group => populatedGroups.has(group.id)).map(group => group.nameZh));
    await expect(page.locator('#librarySummary')).toHaveText('留一点时间，玩点喜欢的。');
  });

  test('prepare, first start, and overflow restart initialize exactly once each', async ({ page }) => {
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
    await startGame(page);
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
    await openOverflow(page);
    await page.locator('#restartBtn').click();
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '2');
  });

  test('game picker search narrows the on-demand library', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator('#searchInput').fill('I Wanna');
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await expect(page.locator('.game-list-item[data-id="iwanna"]')).toBeVisible();
    await page.locator('.game-list-item[data-id="iwanna"]').click();
    await expect(page.locator('#selectedGameLabel')).toHaveText('I Wanna');
    await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
  });

  test('legacy sidebar state cannot change the minimal shell', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.evaluate(() => {
      localStorage.setItem('cg-sidebar-collapsed', '1');
      localStorage.setItem('cg-sidebar-collapsed-desktop-v2', '1');
    });
    await page.reload();
    await expect(page.locator('.main-sidebar')).toHaveCount(0);
    await expect(page.locator('#overflowBtn')).toBeVisible();
    await expect(page.locator('#gamePickerBtn')).toBeHidden();
    await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
  });

  test('game canvas exposes an accessible name and contextual inputs', async ({ page }) => {
    await selectGame(page, 'snake');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('aria-label', '贪吃蛇游戏画布');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('tabindex', '0');
    const controls = GAMES.find(game => game.id === 'snake')!.controls;
    const keyboardCount = (controls.keyboard?.length ?? 0) + (controls.sections ?? []).reduce((count, section) => count + (section.keyboard?.length ?? 0), 0);
    await expect(page.locator('#keyboardPanel .input-map-row')).toHaveCount(keyboardCount);
    await expect(page.locator('#keyboardPanel')).toBeHidden();
    await page.locator('#helpBtn').click();
    await expect(page.locator('#keyboardPanel .guide-basics .input-map-row')).toHaveCount(Math.min(3, controls.keyboard?.length ?? 0));
    await expect(page.locator('#keyboardPanel kbd[data-key="ArrowLeft"]')).toBeVisible();
    await expect(page.locator('#keyboardPanel button, #keyboardPanel .compact-mouse')).toHaveCount(0);
  });

  test('initial page load does not fetch unselected game modules', async ({ page }) => {
    const gameModules: string[] = [];
    page.on('request', (request) => {
      const moduleName = gameModuleName(request.url());
      if (moduleName) gameModules.push(moduleName);
    });
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.game-list-item').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect([...new Set(gameModules)]).toEqual(['gacha.js']);
  });

  test('gacha is the first game and default entry is playable', async ({ page }) => {
    await expect(page.locator('#selectedGameLabel')).toHaveText('抽卡');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.game-list-item').first()).toHaveAttribute('data-id', 'gacha');
    await page.locator('#libraryCloseBtn').click();
    await startGame(page);
    const box = await page.locator('#gameCanvas').boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Click the crate: the unlock prelude starts.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect
      .poll(() => page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.gachaScreen))
      .toMatch(/unlock|opening|result/);
  });

  test('wide desktop maximizes the game and context never reserves side gutters', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await selectGame(page, 'parking');
    const canvas = (await page.locator('#gameCanvas').boundingBox())!;
    expect(Math.abs(canvas.height - 900)).toBeLessThanOrEqual(1);
    await expect(page.locator('#keyboardPanel')).toBeHidden();
    await expect(page.locator('#statsPanel')).toBeHidden();
    await openOverflow(page);
    await expect(page.locator('#statsPanel')).toBeVisible();
    expect(await page.locator('#gameCanvas').boundingBox()).toEqual(canvas);
    const viewport = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(viewport.scrollHeight).toBe(viewport.clientHeight);
  });

  test('system light theme renders the canvas with light game colors', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    // Responsive backing-store resize can clear pixels before the next paint.
    await expect.poll(async () => page.locator('#gameCanvas').evaluate((canvas) => {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) return false;
      const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
      return r + g + b > 360 && g > 120;
    })).toBe(true);
  });

  test('high density displays use a scaled backing canvas without changing logical size', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await selectGame(page, 'snake');
      // Wait for the scheduled first fit instead of racing constructor CSS size.
      await expect.poll(
        () => page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => Math.round(canvas.getBoundingClientRect().width)),
        { timeout: 5000 },
      ).toBeGreaterThan(400);
      const metrics = await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => {
        const box = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          logicalWidth: Number(canvas.dataset.logicalWidth),
          logicalHeight: Number(canvas.dataset.logicalHeight),
          pixelRatio: Number(canvas.dataset.pixelRatio),
          boxWidth: Math.round(box.width),
          boxHeight: Math.round(box.height),
          parkingState: canvas.dataset.parkingState ?? '',
        };
      });
      expect(metrics.logicalWidth).toBe(400);
      expect(metrics.logicalHeight).toBe(400);
      expect(metrics.pixelRatio).toBeGreaterThanOrEqual(2);
      expect(metrics.width).toBe(Math.round(metrics.logicalWidth * metrics.pixelRatio));
      expect(metrics.height).toBe(Math.round(metrics.logicalHeight * metrics.pixelRatio));
      expect(metrics.boxWidth).toBeGreaterThan(400);
      expect(Math.abs(metrics.width / 2 - metrics.boxWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(metrics.height / 2 - metrics.boxHeight)).toBeLessThanOrEqual(2);
      expect(metrics.parkingState).toBe('');
    } finally {
      await context.close();
    }
  });

  test('corrupted stored records do not break startup', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);
    await page.evaluate(() => localStorage.setItem('cg-records', '{bad json'));
    await page.reload();
    await page.keyboard.press('Control+k');
    await expect(page.locator('.game-list-item').first()).toBeVisible();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('all catalog games are registered and reachable in the list', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.game-list-item')).toHaveCount(GAMES.length);
    const catalogIds = GAMES.map(game => game.id);
    for (const id of ALL_GAME_IDS) expect(catalogIds).toContain(id);
    for (const id of catalogIds) {
      const item = page.locator(`.game-list-item[data-id="${id}"]`);
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeVisible();
      await expect(item).toBeInViewport();
    }
  });

  test('game canvas is present', async ({ page }) => {
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('clicking a game shows its controls and canvas', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator('.game-list-item').first().click();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('control guidance follows the primary pointer type', async ({ browser }) => {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const touch = await touchContext.newPage();
    try {
      await desktop.goto('/#/snake');
      await expect(desktop.locator('#keyboardPanel')).toBeHidden();
      await desktop.locator('#helpBtn').click();
      await expect(desktop.locator('#keyboardPanel .guide-basics .input-map-row').first()).toBeVisible();
      await expect(desktop.locator('#keyboardPanel .compact-mouse, #keyboardPanel button')).toHaveCount(0);
      await expect(desktop.locator('#guideBody [data-guide-mode="keyboard"]')).toHaveAttribute('aria-pressed', 'true');
      await touch.goto('/#/snake');
      await touch.locator('#helpBtn').click();
      await expect(touch.locator('#keyboardPanel')).toBeHidden();
      await expect(touch.locator('#touchHelp')).toBeVisible();
      const controls = GAMES.find(game => game.id === 'snake')!.controls;
      await expect(touch.locator('#touchHelp .guide-basics .guide-touch-row')).toHaveCount(Math.min(3, controls.touch?.length ?? 0));
      await expect(touch.locator('#guideBody [data-guide-mode="touch"]')).toHaveAttribute('aria-pressed', 'true');
      await touch.locator('#guideBody [data-guide-mode="keyboard"]').tap();
      await expect(touch.locator('#keyboardPanel .guide-basics .input-map-row')).toHaveCount(Math.min(3, controls.keyboard?.length ?? 0));
      await expect(touch.locator('#keyboardPanel')).toBeVisible();
      await expect(touch.locator('#touchHelp')).toBeHidden();
    } finally {
      await desktop.close();
      await touchContext.close();
    }
  });

  test('mobile game sheet selects different games reliably', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const idToNameZh: Record<string, string> = { breakout: '打砖块', pong: '乒乓', snake: '贪吃蛇', flappybird: '像素鸟' };
    for (const id of ['breakout', 'pong', 'snake', 'flappybird']) {
      await page.keyboard.press('Control+k');
      const item = page.locator(`.game-list-item[data-id="${id}"]`);
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await expect(page.locator('#selectedGameLabel')).toHaveText(idToNameZh[id]);
      await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/${id}`);
    }
  });
});

test.describe('Stability', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('theme toggle does not break games', async ({ page }) => {
    await page.goto('/');
    await selectGame(page, 'snake');
    await openOverflow(page);
    await page.locator('.theme-btn[data-set="light"]').click();
    await expect(page.locator('#overflowMenu')).toBeVisible();
    await page.locator('#menuCloseBtn').click();
    await page.waitForTimeout(300);
    await startGame(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    await openOverflow(page);
    await page.locator('.theme-btn[data-set="dark"]').click();
    await page.waitForTimeout(300);
    const { consoleErrors, pageErrors } = await collectErrors(page);
    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('language switch does not break games', async ({ page }) => {
    await page.goto('/');
    await selectGame(page, 'snake');
    await openOverflow(page);
    await page.locator('.lang-btn[data-lang="zh"]').click();
    await expect(page.locator('#overflowMenu')).toBeVisible();
    await page.locator('#menuCloseBtn').click();
    await page.waitForTimeout(300);
    await startGame(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    await openOverflow(page);
    await page.locator('.lang-btn[data-lang="en"]').click();
    await page.waitForTimeout(300);
    const { consoleErrors, pageErrors } = await collectErrors(page);
    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });
});
