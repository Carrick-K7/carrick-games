import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
];

async function openShell(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cg-lang', 'en');
    localStorage.setItem('cg-theme', 'light');
  });
  await page.goto('/#/snake');
  await expect(page.locator('#selectedGameLabel')).toHaveText('Snake');
  await expect(page.locator('#startOverlay')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function openPicker(page: Page) {
  await page.locator('#gamePickerBtn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Visibility and focus can precede entry animation completion. Ignore any
  // infinite decorative animations rather than waiting forever for them.
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function expectAllGamesFit(page: Page) {
  await expect(page.locator('.game-list-item')).toHaveCount(27);
  await expect(page.locator('.game-list-name:visible')).toHaveCount(27);
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    const tolerance = 1;
    const list = document.querySelector<HTMLElement>('#gameList')!;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const listBox = list.getBoundingClientRect();
    const clientBox = {
      left: listBox.left + list.clientLeft,
      top: listBox.top + list.clientTop,
      right: listBox.left + list.clientLeft + list.clientWidth,
      bottom: listBox.top + list.clientTop + list.clientHeight,
    };
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    function contains(outer: typeof viewport, inner: DOMRect, description: string) {
      if (inner.left < outer.left - tolerance || inner.top < outer.top - tolerance
        || inner.right > outer.right + tolerance || inner.bottom > outer.bottom + tolerance) {
        errors.push(`${description}: ${JSON.stringify(inner.toJSON())} outside ${JSON.stringify(outer)}`);
      }
    }
    contains(viewport, dialog.getBoundingClientRect(), 'dialog outside viewport');
    for (const container of [list, dialog]) {
      if (container.scrollHeight > container.clientHeight + tolerance
        || container.scrollWidth > container.clientWidth + tolerance
        || container.scrollTop !== 0 || container.scrollLeft !== 0) {
        errors.push(`${container.id || container.className} needs scrolling`);
      }
    }
    for (const row of list.querySelectorAll<HTMLElement>('.game-list-item')) {
      const name = row.querySelector<HTMLElement>('.game-list-name')!;
      const label = name.textContent?.trim() || '(empty label)';
      const rowBox = row.getBoundingClientRect();
      contains(clientBox, rowBox, `${label}: row outside gameList client rect`);
      contains(viewport, rowBox, `${label}: row outside viewport`);
      const nameBox = name.getBoundingClientRect();
      contains(rowBox, nameBox, `${label}: label outside button`);
      if (name.scrollWidth > name.clientWidth + tolerance || name.scrollHeight > name.clientHeight + tolerance) {
        errors.push(`${label}: label content clipped or ellipsized`);
      }
      // scrollWidth alone misses some line-clamp/ancestor clipping cases.
      const range = document.createRange();
      range.selectNodeContents(name);
      for (const textBox of range.getClientRects()) {
        contains(nameBox, textBox, `${label}: text outside label bounds`);
        contains(rowBox, textBox, `${label}: text outside button bounds`);
      }
    }
    for (const button of dialog.querySelectorAll<HTMLElement>('button')) {
      if (button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden'
        && button.getBoundingClientRect().height < 39.999) {
        errors.push(`${button.textContent || button.id}: button shorter than 40px`);
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + tolerance) errors.push('page overflows horizontally');
    return errors;
  });
  expect(failures, 'Every game must be fully readable and reachable without scrolling').toEqual([]);
}

for (const viewport of viewports) {
  const mobile = viewport.width < 700;
  test.describe(`single-screen picker ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });

    test('all 27 complete labels fit in English and Chinese with text-only branding', async ({ page }) => {
      await openShell(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(mobile);
      const wordmark = page.locator('.wordmark');
      await expect(wordmark.locator('svg, .brand-mark')).toHaveCount(0);
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /viewBox='0 0 24 24'.*%230d9488/);
      await expect(wordmark).toHaveText('Carrick Games');
      const visibleBrand = (await wordmark.innerText()).replace(/\s+/g, ' ').trim();
      expect(visibleBrand).toBe(mobile ? 'Carrick' : 'Carrick Games');

      for (const lang of ['en', 'zh'] as const) {
        await test.step(lang, async () => {
          if (lang === 'zh') {
            await page.locator('#overflowBtn').click();
            await page.locator('.lang-btn[data-lang="zh"]').click();
            await page.keyboard.press('Escape');
            await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
          }
          await openPicker(page);
          const dialog = page.getByRole('dialog');
          await expect(dialog).toHaveAttribute('aria-modal', 'true');
          await expect(page.locator('#gamePickerBtn')).toHaveAttribute('aria-expanded', 'true');
          if (mobile) {
            await expect(dialog).toHaveAttribute('tabindex', '-1');
            await expect(dialog).toBeFocused();
            await expect(page.locator('#searchInput')).not.toBeFocused();
          } else {
            await expect(page.locator('#searchInput')).toBeFocused();
          }
          await expectAllGamesFit(page);
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
          await expect(page.locator('#gamePickerBtn')).toBeFocused();
        });
      }
    });
  });
}

test.describe('coarse-pointer picker interaction', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test('opens without search focus, selects the last game directly, and retains search and dismissal', async ({ page }) => {
    await openShell(page);
    await openPicker(page);
    const dialog = page.getByRole('dialog');
    const search = page.locator('#searchInput');
    await expect(dialog).toBeFocused();
    await expect(search).not.toBeFocused();
    await expectAllGamesFit(page);
    const lastGame = page.locator('.game-list-item').last();
    // Coarse pointers initially focus the dialog, so reverse Tab must not
    // escape to its backdrop before entering the ordinary focus cycle.
    await page.keyboard.press('Shift+Tab');
    await expect(lastGame).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search).toBeFocused();
    await dialog.focus();
    await expect(lastGame.locator('.game-list-name')).toHaveText("Texas Hold'em");
    // Raw touch coordinates cannot silently scroll an offscreen row into view.
    const box = await lastGame.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator('#selectedGameLabel')).toHaveText("Texas Hold'em");
    await expect(dialog).toBeHidden();
    await expect(page.locator('#gamePickerBtn')).toBeFocused();

    await openPicker(page);
    await expect(dialog).toBeFocused();
    await search.tap();
    await expect(search).toBeFocused();
    await search.fill('俄罗斯方块');
    await expect(page.locator('.game-list-item')).toHaveCount(1);
    await expect(page.locator('.game-list-item')).toHaveAttribute('data-id', 'tetris');
    await search.fill('no-such-game-987654321');
    await expect(page.locator('.game-list-item')).toHaveCount(0);
    await expect(page.locator('.search-empty')).toBeVisible();
    await search.fill('');
    await expect(page.locator('.game-list-item')).toHaveCount(27);
    await page.locator('#libraryCloseBtn').tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#gamePickerBtn')).toBeFocused();
    await expect(page.locator('#gamePickerBtn')).toHaveAttribute('aria-expanded', 'false');
  });
});
