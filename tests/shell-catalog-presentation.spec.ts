import { expect, test, type Page } from '@playwright/test';
import { gameAssetBase, parseCatalog, type GameCatalog } from '../packages/game-sdk/src/catalog';
import { GAME_GROUPS } from './support/catalog';
import { builtCatalog } from './support/releases';

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function catalogFixture(page: Page, catalog: GameCatalog) {
  let queued: { body: unknown; status: number; started: ReturnType<typeof signal>; gate: ReturnType<typeof signal>; finished: ReturnType<typeof signal> } | undefined;
  await page.route('**/games/index.json', async route => {
    const response = queued;
    queued = undefined;
    if (!response) {
      await route.fulfill({ json: catalog });
      return;
    }
    response.started.resolve();
    await response.gate.promise;
    try { await route.fulfill({ status: response.status, json: response.body }); }
    finally { response.finished.resolve(); }
  });
  return {
    hold(body: unknown, status = 200) {
      expect(queued, 'Only one library refresh is held at a time').toBeUndefined();
      const response = { body, status, started: signal(), gate: signal(), finished: signal() };
      queued = response;
      return { requested: response.started.promise, finished: response.finished.promise, release: response.gate.resolve };
    },
  };
}

async function startBoard(page: Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('cg-lang', 'en');
    localStorage.setItem('cg-theme', 'light');
    const state = window as unknown as { __catalogUnhandled: string[] };
    state.__catalogUnhandled = [];
    window.addEventListener('unhandledrejection', event => state.__catalogUnhandled.push(String(event.reason)));
  });
  await page.goto('/#/minesweeper');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await page.evaluate(() => document.fonts.ready);
  // A fresh replacement also starts at prepare-count 1; use 2 to detect that regression.
  await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '2');
  return pageErrors;
}

async function settlePresentation(page: Page) {
  await page.locator('.library-dialog').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function openInitialLibrary(page: Page) {
  const response = page.waitForResponse('**/games/index.json');
  await page.locator('#siteBrand').click();
  await expect(page.locator('.library-dialog')).toBeVisible();
  await (await response).finished();
  await settlePresentation(page);
}

function categoryFor(group: string) {
  return GAME_GROUPS.some(category => category.id === group) ? group : 'other';
}

async function expectNoUnhandled(page: Page, pageErrors: string[]) {
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __catalogUnhandled: string[] }).__catalogUnhandled)).toEqual([]);
}

test.describe('live catalog presentation with a pinned running release', () => {
  test.use({ viewport: { width: 390, height: 640 } });

  test('bootstrap finishes paused beneath a newer opened library without losing query or focus', async ({ page }) => {
    const catalog = builtCatalog();
    const searched = catalog.games.find(game => game.id === 'minesweeper')!;
    const initial = catalog.games.find(game => game.id === 'gacha') ?? catalog.games[0]!;
    const fixture = await catalogFixture(page, catalog);
    const discovery = fixture.hold(catalog);
    await page.addInitScript(() => {
      localStorage.setItem('cg-lang', 'en');
      localStorage.setItem('cg-theme', 'light');
      localStorage.removeItem('cg-last-game');
    });
    try {
      await page.goto('/');
      await discovery.requested;
      await page.keyboard.press('Control+k');
      const library = page.locator('.library-dialog'), search = page.locator('#searchInput');
      await expect(library).toBeVisible();
      await search.fill(searched.name);
      await expect(search).toBeFocused();
      discovery.release();
      await discovery.finished;
      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
      await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
      await expect(canvas).toHaveAttribute('data-game-version', initial.version);
      await expect(page.locator('#selectedGameLabel')).toHaveText(initial.name);
      await expect(library).toBeVisible();
      await expect(search).toHaveValue(searched.name);
      await expect(search).toBeFocused();
      await expect(page.locator('.game-list-item')).toHaveCount(1);
      await expect(page.locator('.game-list-item')).toHaveAttribute('data-id', searched.id);
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
      await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
      await expect(canvas).toBeFocused();
    } finally { discovery.release(); }
  });

  test('an unchanged async refresh preserves cached card DOM, category, query, scroll and focus', async ({ page }) => {
    const catalog = builtCatalog(), board = catalog.games.find(game => game.id === 'minesweeper')!;
    const fixture = await catalogFixture(page, catalog);
    const pageErrors = await startBoard(page);
    const canvas = page.locator('#gameCanvas');
    const prepare = await canvas.getAttribute('data-game-prepare-count');
    await openInitialLibrary(page);
    // Two puzzle cards fit one phone row: select a populated filtered category
    // so this test still exercises real scroll retention with a smaller catalog.
    const query = 'a';
    const matches = catalog.games.filter(game => [game.name, game.nameZh, game.desc, game.descZh].some(text => text.toLowerCase().includes(query)));
    const categories = [...new Set(matches.map(game => categoryFor(game.group)))];
    const category = categories.sort((a, b) => matches.filter(game => categoryFor(game.group) === b).length - matches.filter(game => categoryFor(game.group) === a).length)[0]!;
    expect(matches.filter(game => categoryFor(game.group) === category).length).toBeGreaterThanOrEqual(3);
    await page.locator(`[data-category="${category}"]`).click();
    await page.locator('#searchInput').fill(query);
    const last = page.locator('.game-list-item').last();
    await last.scrollIntoViewIfNeeded();
    const id = await last.getAttribute('data-id');
    const originalCard = (await last.elementHandle())!;
    const scroll = await page.locator('#gameList').evaluate(el => el.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await page.locator('#libraryCloseBtn').click();

    // A new catalog generation is not a changed presentation when its entries are identical.
    const unchanged = structuredClone(catalog); unchanged.generation++;
    const refresh = fixture.hold(unchanged);
    try {
      await page.locator('#siteBrand').click();
      await refresh.requested;
      await expect(page.locator('.library-dialog')).toBeVisible();
      await settlePresentation(page);
      await expect(page.locator('#searchInput')).toHaveValue('a');
      await expect(page.locator(`[data-category="${category}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await originalCard.evaluate(el => el.isConnected)).toBe(true);
      expect(await page.locator('#gameList').evaluate(el => el.scrollTop)).toBe(scroll);
      const currentFocus = page.locator(`.game-list-item[data-id="${id}"]`);
      await currentFocus.focus();
      const focusedScroll = await page.locator('#gameList').evaluate(el => el.scrollTop);
      refresh.release(); await refresh.finished;
      await page.waitForLoadState('networkidle');
      await settlePresentation(page);
      expect(await originalCard.evaluate(el => el.isConnected && el === document.querySelector(`.game-list-item[data-id="${el.getAttribute('data-id')}"]`))).toBe(true);
      await expect(currentFocus).toBeFocused();
      await expect(page.locator('#searchInput')).toHaveValue('a');
      await expect(page.locator(`[data-category="${category}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.locator('#gameList').evaluate(el => el.scrollTop)).toBe(focusedScroll);
      await page.locator('#libraryCloseBtn').click();
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
      await expect(canvas).toHaveAttribute('data-game-version', board.version);
      await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
      await expectNoUnhandled(page, pageErrors);
    } finally { refresh.release(); }
  });

  test('changed cards retain browsing focus while current game, help and versions stay pinned until explicit update', async ({ page }) => {
    const catalog = builtCatalog(), board = catalog.games.find(game => game.id === 'minesweeper')!;
    const fixture = await catalogFixture(page, catalog);
    const pageErrors = await startBoard(page);
    const canvas = page.locator('#gameCanvas'), prepare = await canvas.getAttribute('data-game-prepare-count');
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpGameVersion')).toHaveText(`v${board.version}`);
    const originalHelp = await page.locator('#guideBody').textContent();
    await page.locator('#helpCloseBtn').click();
    await openInitialLibrary(page);
    const category = categoryFor(board.group);
    await page.locator(`[data-category="${category}"]`).click();
    await page.locator('#searchInput').fill(board.name);
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await page.locator('#libraryCloseBtn').click();

    const changed = structuredClone(catalog); changed.generation++;
    const next = changed.games.find(game => game.id === 'minesweeper')!;
    next.name = `${board.name} — Catalog preview`;
    next.desc = 'New catalog copy, not a new running instance.';
    next.controls.keyboard = [{ keys: ['Q'], action: 'Preview-only mapping', actionZh: '仅预览操作' }];
    next.version = '999.0.0-ui-preview';
    next.revision = board.revision === 'f'.repeat(40) ? 'e'.repeat(40) : 'f'.repeat(40);
    next.assetBase = gameAssetBase(next.id, next.version, next.revision);
    const relocate = (path: string) => new URL(path, `${new URL(page.url()).origin}${board.assetBase}`).pathname.replace(board.assetBase, next.assetBase);
    next.entry = relocate(board.entry);
    next.icon = relocate(board.icon);
    next.styles = board.styles.map(relocate);
    if (next.cover) next.cover.src = relocate(next.cover.src);
    next.sequence++; next.handledRevision = next.revision;
    const parsed = parseCatalog(changed, new URL(page.url()).origin);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.catalog.games).toHaveLength(catalog.games.length);

    const unexpectedBundles: string[] = [];
    await page.route(`**${next.assetBase}**`, route => {
      if (new URL(route.request().url()).pathname.endsWith('.js')) {
        unexpectedBundles.push(route.request().url());
        return route.abort(); // Never execute a fabricated updated release.
      }
      // Artwork still uses real built bytes, inside a schema-valid cloned release URL.
      return route.continue({ url: route.request().url().replace(next.assetBase, board.assetBase) });
    });
    const refresh = fixture.hold(changed);
    try {
      await page.locator('#siteBrand').click();
      await refresh.requested;
      const card = page.locator(`.game-list-item[data-id="${board.id}"]`);
      await expect(card.locator('.game-list-name')).toHaveText(board.name);
      await card.focus();
      refresh.release(); await refresh.finished;
      await expect(card.locator('.game-list-name')).toHaveText(next.name);
      await expect(card.locator('.game-list-desc')).toHaveText(next.desc);
      await expect(card).toBeFocused();
      await expect(page.locator(`[data-category="${category}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#searchInput')).toHaveValue(board.name);
      await expect(card).toHaveAttribute('aria-current', 'true');
      await expect(canvas).toHaveAttribute('data-game-version', board.version);
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
      await card.click(); // Continue is not the explicit Update action.
      await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
      await expect(canvas).toBeFocused();
      await page.locator('#overflowBtn').click();
      await expect(page.locator('#menuGameVersion')).toHaveText(`v${board.version}`);
      await expect(page.locator('#selectedGameLabel')).toHaveText(board.name);
      await expect(page.locator('#updateGameBtn')).toBeVisible();
      await expect(page.locator('#updateGameBtn')).toContainText(`v${next.version}`);
      await page.locator('#helpBtn').click();
      await expect(page.locator('#helpGameName')).toHaveText(board.name);
      await expect(page.locator('#helpGameVersion')).toHaveText(`v${board.version}`);
      expect(await page.locator('#guideBody').textContent()).toBe(originalHelp);
      await expect(page.locator('#guideBody')).not.toContainText('Preview-only mapping');
      await expect(canvas).toHaveAttribute('data-game-version', board.version);
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
      expect(unexpectedBundles).toEqual([]);
      await expectNoUnhandled(page, pageErrors);
    } finally { refresh.release(); }
  });

  test('failed refresh keeps the cached library usable without an unhandled rejection or page error', async ({ page }) => {
    const catalog = builtCatalog(), board = catalog.games.find(game => game.id === 'minesweeper')!;
    const fixture = await catalogFixture(page, catalog);
    const pageErrors = await startBoard(page);
    const canvas = page.locator('#gameCanvas'), prepare = await canvas.getAttribute('data-game-prepare-count');
    await openInitialLibrary(page);
    const category = categoryFor(board.group);
    await page.locator(`[data-category="${category}"]`).click();
    await page.locator('#searchInput').fill(board.name);
    await page.locator('#libraryCloseBtn').click();
    const refresh = fixture.hold({ error: 'Temporarily offline' }, 503);
    try {
      await page.locator('#siteBrand').click();
      await refresh.requested;
      const card = page.locator(`.game-list-item[data-id="${board.id}"]`);
      await expect(card).toBeVisible();
      await card.focus();
      const originalCard = (await card.elementHandle())!;
      refresh.release(); await refresh.finished;
      await page.waitForLoadState('networkidle');
      await settlePresentation(page);
      expect(await originalCard.evaluate(el => el.isConnected)).toBe(true);
      await expect(card).toBeFocused();
      await expect(page.locator('#searchInput')).toHaveValue(board.name);
      await expect(page.locator(`[data-category="${category}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#loadError')).toBeHidden();
      await card.click();
      await expect(page.locator('.library-dialog')).toBeHidden();
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
      await expect(canvas).toHaveAttribute('data-game-version', board.version);
      await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
      await expect(canvas).toBeFocused();
      await expectNoUnhandled(page, pageErrors);
    } finally { refresh.release(); }
  });
});
