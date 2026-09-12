import { expect, test, type Page } from '@playwright/test';
import { GAMES } from './support/catalog';
import { gameModuleUrl } from './support/releases';

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 600 },
  { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 }, { width: 667, height: 375 },
];
async function openShell(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('cg-lang', 'en'); localStorage.setItem('cg-theme', 'light'); });
  await page.goto('/#/snake');
  await expect(page.locator('#selectedGameLabel')).toHaveText('Snake');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await page.evaluate(() => document.fonts.ready);
}
async function openPicker(page: Page) {
  await page.locator('#siteBrand').click();
  await expect(page.locator('.library-dialog')).toBeVisible();
  await page.locator('.library-dialog').evaluate(async element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))));
}
async function expectReadableScrollableLibrary(page: Page) {
  await expect(page.locator('.game-list-item')).toHaveCount(GAMES.length);
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    const list = document.getElementById('gameList')!;
    const dialog = document.querySelector<HTMLElement>('.library-dialog')!;
    const box = dialog.getBoundingClientRect();
    if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) errors.push('dialog outside viewport');
    if (dialog.scrollHeight > dialog.clientHeight + 1) errors.push('dialog scrolls instead of its card body');
    if (!['auto', 'scroll'].includes(getComputedStyle(list).overflowY) || list.clientHeight < 50 || list.scrollHeight <= list.clientHeight) errors.push('library needs a real native scrollable card body');
    if (list.scrollWidth > list.clientWidth + 1) errors.push('horizontal card overflow');
    for (const card of list.querySelectorAll<HTMLElement>('.game-list-item')) {
      const name = card.querySelector<HTMLElement>('.game-list-name')!;
      const desc = card.querySelector<HTMLElement>('.game-list-desc')!;
      if (parseFloat(getComputedStyle(name).fontSize) !== 16) errors.push('title must remain 16px');
      if (parseFloat(getComputedStyle(desc).fontSize) !== 14) errors.push('description must remain 14px');
      if (name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1) errors.push(`clipped name: ${name.textContent}`);
      const cardBox = card.getBoundingClientRect();
      if (card.scrollHeight > card.clientHeight + 1) errors.push(`card content overlaps next row: ${name.textContent}`);
      for (const child of [name, desc, card.querySelector<HTMLElement>('.game-list-bottom')!]) {
        const b = child.getBoundingClientRect();
        if (b.top < cardBox.top - 1 || b.bottom > cardBox.bottom + 1 || b.left < cardBox.left - 1 || b.right > cardBox.right + 1) errors.push(`copy outside card: ${name.textContent}`);
      }
      // A range catches line-clamp and ancestor clipping that scrollWidth misses.
      const nameBox = name.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(name);
      for (const textBox of range.getClientRects()) {
        if (textBox.left < nameBox.left - 1 || textBox.right > nameBox.right + 1 || textBox.top < nameBox.top - 1 || textBox.bottom > nameBox.bottom + 1) errors.push(`clipped title text: ${name.textContent}`);
      }
      const cover = card.querySelector('.game-list-cover')!.getBoundingClientRect();
      if (cover.width < 100 || cover.height < 60) errors.push('missing readable artwork region');
      if (card.querySelector('button, a, input, select, textarea, [role="button"], [tabindex]')) errors.push('nested card target');
    }
    for (const button of dialog.querySelectorAll<HTMLElement>('button')) {
      if (!button.getClientRects().length || getComputedStyle(button).visibility === 'hidden') continue;
      const b = button.getBoundingClientRect();
      if (b.width < 43.99 || b.height < 43.99) errors.push(`small target: ${button.textContent}`);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) errors.push('page scrolls');
    return errors;
  });
  expect(failures).toEqual([]);
  for (const card of await page.locator('.game-list-item').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
  }
  expect(await page.locator('#gameList').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#libraryCloseBtn')).toBeInViewport();
  await expect(page.locator('#searchInput')).toBeInViewport();
}

for (const viewport of viewports) {
  const mobile = viewport.width < 700;
  test.describe(`artwork library ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });
    test('all catalog entries are readable and reachable in both languages without page overflow', async ({ page }) => {
      await openShell(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(mobile);
      await page.locator('#overflowBtn').click();
      const wordmark = page.locator('.wordmark');
      const source = await page.locator('script[type="module"][src]').first().getAttribute('src');
      expect(source).toMatch(/^\/shell\/[a-f0-9]{40}\//);
      const logoUrl = `${source!.match(/^\/shell\/[a-f0-9]{40}\//)![0]}brand/logo.svg`;
      await expect(wordmark.locator('img')).toHaveAttribute('src', logoUrl);
      await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', logoUrl);
      expect((await wordmark.innerText()).replace(/\s+/g, ' ').trim()).toBe('Carrick Games');
      await page.locator('#menuCloseBtn').click();
      for (const lang of ['en', 'zh'] as const) {
        if (lang === 'zh') {
          await page.locator('#overflowBtn').click();
          await page.locator('.lang-btn[data-lang="zh"]').click();
          await expect(page.locator('#overflowMenu')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
        }
        await openPicker(page);
        const dialog = page.locator('.library-dialog');
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(page.locator('#gamePickerBtn')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.library-brand')).toHaveText('Carrick Games');
        if (mobile) {
          await expect(dialog).toHaveAttribute('tabindex', '-1');
          await expect(dialog).toBeFocused();
          await expect(page.locator('#searchInput')).not.toBeFocused();
        } else await expect(page.locator('#searchInput')).toBeFocused();
        const columns = await page.locator('#gameList').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(viewport.width <= 760 ? 2 : viewport.width <= 1100 ? 3 : 4);
        await expectReadableScrollableLibrary(page);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(page.locator('#gameCanvas')).toBeFocused();
      }
    });
  });
}

test.describe('coarse-pointer library interaction', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  test('native scrolling, focus containment, bilingual search and empty recovery stay usable', async ({ page }) => {
    await openShell(page); await openPicker(page);
    const dialog = page.locator('.library-dialog'), search = page.locator('#searchInput');
    await expect(dialog).toBeFocused(); await expect(search).not.toBeFocused();
    const last = page.locator('.game-list-item').last();
    await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
    await page.keyboard.press('Tab'); await expect(search).toBeFocused();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const id = await last.getAttribute('data-id');
    const box = (await last.boundingBox())!;
    // Raw touch coordinates select the card only after actual native scrolling.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(new RegExp(`#/${id}$`));
    await expect(dialog).toBeHidden();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await openPicker(page);
    await search.tap(); await search.fill('俄罗斯方块');
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await expect(page.locator('.game-list-item')).toHaveAttribute('data-id', 'tetris');
    await search.fill('not-a-game-987654');
    await expect(page.locator('.game-list-item')).toHaveCount(0);
    await expect(page.locator('.search-empty')).toBeVisible();
    await page.locator('[data-clear-search]').tap();
    await expect(search).toHaveValue('');
    await expect(page.locator('.game-list-item')).toHaveCount(GAMES.length);
    await page.locator('#libraryCloseBtn').tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await expect(page.locator('#gamePickerBtn')).toHaveAttribute('aria-expanded', 'false');
  });
});

test('categories combine with search; selecting the current game preserves its instance and browsing context', async ({ page }) => {
  await openShell(page);
  await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '2');
  await openPicker(page);
  const prepare = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
  await page.locator('[data-category="puzzle"]').click();
  await expect(page.locator('.game-list-item')).toHaveCount(GAMES.filter(game => game.group === 'puzzle').length);
  await page.locator('#searchInput').fill('sudoku');
  await expect(page.locator('.game-list-item')).toHaveCount(1);
  await page.locator('[data-category="all"]').click();
  await page.locator('#searchInput').fill('snake');
  await page.locator('.game-list-item[data-id="snake"]').click();
  await expect(page.locator('.library-dialog')).toBeHidden();
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepare!);
  await expect(page.locator('#gameCanvas')).toBeFocused();
  await openPicker(page);
  await expect(page.locator('#searchInput')).toHaveValue('snake');
  await expect(page.locator('.game-list-item')).toHaveCount(1);
});

test('selecting the running card cancels a loading candidate and resumes the old instance', async ({ page }) => {
  await openShell(page);
  const canvas = page.locator('#gameCanvas'), candidateUrl = gameModuleUrl('tetris');
  // Distinguish the existing instance from a newly created one with a reset counter.
  await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
  await expect(canvas).toHaveAttribute('data-game-prepare-count', '2');
  const prepare = await canvas.getAttribute('data-game-prepare-count');
  const version = await canvas.getAttribute('data-game-version');
  let releaseCandidate!: () => void;
  const held = new Promise<void>(resolve => { releaseCandidate = resolve; });
  await page.route(`**${candidateUrl}`, async route => { await held; await route.continue(); });
  try {
    await openPicker(page);
    const requested = page.waitForRequest(`**${candidateUrl}`);
    await page.locator('.game-list-item[data-id="tetris"]').click();
    await requested;
    await expect(page.locator('.library-dialog')).toBeHidden();
    await openPicker(page);
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('.library-dialog')).toBeHidden();
    await expect(canvas).toHaveAttribute('data-game-running', 'true');
    await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
    await expect(canvas).toHaveAttribute('data-game-version', version!);
    await expect(page).toHaveURL(/#\/snake$/);
    await expect(canvas).toBeFocused();
    releaseCandidate();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#selectedGameLabel')).toHaveText('Snake');
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepare!);
    await expect(canvas).toHaveAttribute('data-game-version', version!);
    await expect(page.locator('#loadError')).toBeHidden();
  } finally {
    releaseCandidate();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('lazy image success and failure preserve card geometry and a playable icon fallback', async ({ page }) => {
  await openShell(page); await openPicker(page);
  await page.route('**/__ui-cover.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#0d9488"/></svg>' }));
  await page.route('**/__ui-missing.webp', route => route.fulfill({ status: 404, body: '' }));
  const cover = page.locator('.game-list-cover').first();
  const before = await cover.boundingBox();
  await cover.evaluate(el => {
    // Replace real catalog artwork with one controlled image, not a second overlapping cover.
    el.querySelector('.game-cover-image')?.remove();
    el.removeAttribute('data-image-ready');
    const image = new Image(); image.className = 'game-cover-image'; image.width = 640; image.height = 400;
    image.src = '/__ui-cover.svg'; el.append(image);
  });
  await expect(cover).toHaveAttribute('data-image-ready', 'true');
  expect(await cover.boundingBox()).toEqual(before);
  await cover.locator('.game-cover-image').evaluate((image: HTMLImageElement) => image.src = '/__ui-missing.webp');
  await expect(cover).toHaveAttribute('data-image-ready', 'false');
  await expect(cover.locator('.game-list-icon')).toBeVisible();
  expect(await cover.boundingBox()).toEqual(before);
});
