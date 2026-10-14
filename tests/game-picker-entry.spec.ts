import { expect, test } from '@playwright/test';

for (const device of [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, hasTouch: false },
  { name: 'phone', viewport: { width: 320, height: 568 }, hasTouch: true },
  { name: 'landscape', viewport: { width: 667, height: 375 }, hasTouch: true },
]) {
  test.describe(`game picker entry ${device.name}`, () => {
    test.use({ viewport: device.viewport, hasTouch: device.hasTouch });
    for (const lang of ['en', 'zh'] as const) for (const theme of ['light', 'dark'] as const) {
      test(`${lang} ${theme}: explicit action, current game and arrow share one target`, async ({ page }, info) => {
        await page.addInitScript(({ lang, theme }) => {
          localStorage.setItem('cg-lang', lang);
          localStorage.setItem('cg-theme', theme);
        }, { lang, theme });
        await page.goto('/#/texashold');
        const canvas = page.locator('#gameCanvas');
        await expect(canvas).toHaveAttribute('data-game-running', 'true');
        const before = await canvas.boundingBox();
        const prepareCount = await canvas.getAttribute('data-game-prepare-count');
        await page.locator('#overflowBtn').click();
        const menu = page.locator('#overflowMenu'), picker = page.locator('#gamePickerBtn');
        await expect(picker.locator('#pickerMenuLabel')).toHaveText(lang === 'zh' ? '选择游戏' : 'Choose a game');
        const gameName = await page.locator('#selectedGameLabel').textContent();
        await expect(picker).toHaveAccessibleName(`${lang === 'zh' ? '选择游戏 当前：' : 'Choose a game Current: '}${gameName}`);
        await expect(picker.locator('.picker-chevron')).toBeVisible();
        await expect(picker.locator('button, a, input, [tabindex]')).toHaveCount(0);
        await expect(picker.locator('#selectedGameLabel')).toHaveCSS('font-size', '16px');
        if (device.hasTouch) await expect(picker.locator('#pickerShortcut')).toBeHidden();
        else await expect(picker.locator('#pickerShortcut')).toBeVisible();
        expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(76);
        expect(await canvas.boundingBox()).toEqual(before);
        await menu.screenshot({ path: info.outputPath('game-picker-menu.png'), animations: 'disabled', mask: [page.locator('#menuGameVersion')], maskColor: theme === 'light' ? '#ffffff' : '#151f1b' });
        // The arrow itself is part of the same native target, including on touch.
        if (device.hasTouch) await picker.locator('.picker-chevron').tap();
        else {
          await page.locator('#menuCloseBtn').focus();
          await page.keyboard.press('Tab');
          await expect(picker).toBeFocused();
          await expect(picker).toHaveCSS('outline-style', 'solid');
          await page.keyboard.press('Enter');
        }
        await expect(page.locator('.library-dialog')).toBeVisible();
        await expect(menu).toBeHidden();
        await expect(picker).toHaveAttribute('aria-expanded', 'true');
        await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
        await page.locator('.game-list-item[data-id="texashold"]').click();
        await expect(page.locator('.library-dialog')).toBeHidden();
        await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);
        await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
        await expect(canvas).toBeFocused();
        await page.locator('#overflowBtn').click();
        // Long catalog names and enlarged text wrap without losing the action/arrow.
        await page.locator('#selectedGameLabel').evaluate(el => {
          el.textContent = 'Very long current game name / 一个需要完整换行显示的游戏名称';
          el.style.fontSize = '24px';
        });
        const geometry = await picker.evaluate(el => {
          const box = el.getBoundingClientRect();
          const children = [...el.querySelectorAll<HTMLElement>('.picker-copy, .picker-chevron')];
          return {
            overflow: el.scrollWidth > el.clientWidth + 1,
            contained: children.every(child => {
              const b = child.getBoundingClientRect();
              return b.left >= box.left && b.right <= box.right && b.top >= box.top && b.bottom <= box.bottom;
            }),
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(geometry).toEqual({ overflow: false, contained: true, pageOverflow: false });
      });
    }
  });
}

test('picker remains explicit without a loaded game and updates language in place', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
  await page.route('**/games/index.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.locator('#loadError')).toBeVisible();
  await page.locator('#overflowBtn').click();
  const picker = page.locator('#gamePickerBtn');
  await expect(picker).toHaveAccessibleName('Choose a game Browse all games');
  await expect(page.locator('#pickerCurrentLabel')).toBeHidden();
  await page.locator('.lang-btn[data-lang="zh"]').click();
  await expect(picker).toHaveAccessibleName('选择游戏 浏览全部游戏');
  await picker.click();
  await expect(page.locator('.library-dialog')).toBeVisible();
  await expect(page.locator('#overflowMenu')).toBeHidden();
});
