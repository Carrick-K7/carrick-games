import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gameAssetBase, type GameControls } from '../packages/game-sdk/src/catalog';
import { builtCatalog } from './support/releases';

// These are shell component examples, not a claim about any game's controls.
// Live release metadata is checked semantically in control-guide.spec.ts.
const referenceControls: GameControls = {
  keyboard: [
    { keys: ['←', '↑', '→', '↓'], action: 'Move', actionZh: '移动' },
    { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
    { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
  ],
  touch: [{ icon: 'tap', action: 'Tap sides to turn', actionZh: '点击边缘转向' }],
};

async function referenceCatalog(page: Page) {
  const catalog = builtCatalog();
  const runtime = catalog.games.find(game => game.id === 'minesweeper');
  if (!runtime) throw new Error('The visual fixture requires the published Minesweeper runtime');
  // Fix the presentation cardinality, category distribution and active-card slot.
  // No retired release is loaded, and no game-owned metadata/artwork is a golden.
  const groups = [...Array<string>(9).fill('casual'), ...Array<string>(7).fill('action'), ...Array<string>(7).fill('puzzle'), ...Array<string>(5).fill('tabletop')];
  catalog.games = groups.map((group, order) => {
    const id = order === 3 ? runtime.id : `visual-fixture-${order}`;
    const assetBase = gameAssetBase(id, runtime.version, runtime.revision);
    return {
      ...runtime, id, group, order, assetBase,
      entry: `${assetBase}entry.js`, styles: order === 3 ? runtime.styles : [],
      icon: `${assetBase}icon.svg`, cover: { src: `${assetBase}visual-cover.svg`, width: 640, height: 400 },
      name: `Example ${order + 1}`, nameZh: '测试项',
      desc: 'A shell-owned example card.', descZh: '用于检查游戏卡片布局的示例。',
      controls: structuredClone(referenceControls),
    };
  });
  await page.route('**/games/index.json', route => route.fulfill({ json: catalog }));
  await page.route('**/games/**/icon.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>' }));
  await page.route('**/games/**/visual-cover.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#0d9488"/></svg>' }));
  await page.goto(`/#/${runtime.id}`);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', runtime.id);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
}

async function waitForVisibleArtwork(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const viewport = document.getElementById('gameList')!.getBoundingClientRect();
    const artwork = [...document.querySelectorAll<HTMLElement>('.game-list-cover')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.bottom > viewport.top && box.top < viewport.bottom && box.right > viewport.left && box.left < viewport.right;
    });
    return artwork.length > 0 && artwork.every(element => {
      const image = element.querySelector<HTMLImageElement>('.game-cover-image');
      return !image || (image.complete && image.naturalWidth > 0 && element.dataset.imageReady === 'true');
    });
  }), { message: 'Visible release artwork must settle before taking a visual reference' }).toBe(true);
}

async function expectPersistentControlPixels(page: Page, info: TestInfo, reference: string) {
  const width = page.viewportSize()!.width;
  const controls = [
    { id: 'siteBrand', x: 12 },
    { id: 'helpBtn', x: width - 108 },
    { id: 'overflowBtn', x: width - 56 },
  ];
  for (const { id, x } of controls) {
    const control = page.locator(`#${id}`);
    await expect(control).toBeVisible();
    expect(await control.boundingBox()).toEqual({ x, y: 12, width: 44, height: 44 });
    expect(await control.evaluate(element => {
      const style = getComputedStyle(element);
      return { borderRadius: style.borderRadius, borderWidth: style.borderWidth };
    })).toEqual({ borderRadius: '11px', borderWidth: '1px' });
  }
  await expect(page.locator('#siteBrand')).toHaveAccessibleName(/Carrick Games/);
  await expect(page.locator('#siteBrand .site-brand-name')).toHaveCount(0);
  // Keep the immutable independent reference, but compare ONLY its shell-owned
  // targets. The old full-page reference also contains Gacha's HUD/Collection;
  // neither those pixels nor canvas/board placement belong to this shell test.
  const actual = await page.screenshot({ animations: 'disabled', fullPage: true, path: info.outputPath(reference) });
  const expected = readFileSync(info.snapshotPath(reference));
  const differences = await page.evaluate(async ({ actual, expected, controls }) => {
    const pixels = async (source: string) => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return { context, width: image.width, height: image.height };
    };
    const a = await pixels(actual), e = await pixels(expected);
    if (a.width !== e.width || a.height !== e.height) throw new Error('Reference viewport dimensions changed');
    return controls.map(({ id, x }) => {
      const actual = a.context.getImageData(x, 12, 44, 44).data;
      const expected = e.context.getImageData(x, 12, 44, 44).data;
      let changed = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if ([0, 1, 2, 3].some(channel => Math.abs(actual[i + channel] - expected[i + channel]) > 16)) changed++;
      }
      return { id, ratio: changed / (44 * 44) };
    });
  }, { actual: actual.toString('base64'), expected: expected.toString('base64'), controls });
  for (const difference of differences) expect(difference.ratio, `${difference.id}: shell-owned reference pixels`).toBeLessThanOrEqual(.01);
}

async function expectRoundedGuidePixels(page: Page, info: TestInfo, reference: string, options: { style: string; mask: ReturnType<Page['locator']>[] }) {
  const guide = page.locator('#helpOverlay');
  await expect(guide).toHaveCSS('border-top-left-radius', '20px');
  await expect(guide).toHaveCSS('border-top-right-radius', '20px');
  const actual = await guide.screenshot({ ...options, animations: 'disabled', path: info.outputPath(reference) });
  const expected = readFileSync(info.snapshotPath(reference));
  // Rectangular screenshots include the game behind a sheet's rounded corners.
  // Keep the independent golden, comparing only its actual shell surface.
  const changed = await page.evaluate(async ({ actual, expected }) => {
    const pixels = async (source: string) => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
    };
    const a = await pixels(actual), e = await pixels(expected);
    if (a.width !== e.width || a.height !== e.height) throw new Error('Guide reference dimensions changed');
    let changed = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      // Only outside/antialiased top corners mix in game-owned colors.
      if (y < 20 && (x < 20 || x >= a.width - 20)) {
        const cx = x < 20 ? 20 : a.width - 20;
        if (Math.hypot(x + .5 - cx, y + .5 - 20) >= 19) continue;
      }
      const offset = (y * a.width + x) * 4;
      if ([0, 1, 2, 3].some(channel => Math.abs(a.data[offset + channel] - e.data[offset + channel]) > 16)) changed++;
    }
    return changed;
  }, { actual: actual.toString('base64'), expected: expected.toString('base64') });
  expect(changed, 'unchanged shell-owned guide reference pixels').toBe(0);
}

test.describe('shell visual regression', () => {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const theme = mobile ? 'light' : 'dark';
    const variant = `${theme}-${mobile ? 'mobile' : 'desktop'}`;
    test.describe(`${theme} ${mobile ? 'touch phone' : 'mouse desktop'}`, () => {
      test.use({ viewport, hasTouch: mobile, isMobile: mobile });

      test(`refined game picker ${theme} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
        await referenceCatalog(page);
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await page.keyboard.press('Control+k');
        await expect(page.locator(mobile ? '.library-dialog' : '#searchInput')).toBeFocused();
        await page.evaluate(() => document.fonts.ready);
        await waitForVisibleArtwork(page);
        await page.mouse.move(0, 0);
        // Fixture content has fixed geometry; the reference covers shell layout,
        // not real names, descriptions, artwork, input metadata or catalog size.
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

      test(`guide ${theme} ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, info) => {
        await referenceCatalog(page);
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await page.locator('#helpBtn').click();
        await expect(page.locator('#helpBtn')).toHaveAttribute('aria-expanded', 'true');
        await page.evaluate(() => document.fonts.ready);
        // Keycaps and touch rows now render explicit shell-owned examples; live
        // game control metadata must never silently become a golden expectation.
        const options = {
          // Identity is checked against the real release in control-guide. Fixed
          // masked fixture slots prevent game SemVer/name length coupling here.
          style: '#helpGameName { width: 39px; overflow: hidden; white-space: nowrap; } #helpGameVersion { width: 41px; overflow: hidden; white-space: nowrap; }',
          mask: [page.locator('#helpGameName'), page.locator('#helpGameVersion')],
        };
        if (mobile) await expectRoundedGuidePixels(page, info, `controls-${variant}.png`, options);
        else await expect(page.locator('#helpOverlay')).toHaveScreenshot(`controls-${variant}.png`, { ...options, animations: 'disabled' });
      });

      test(`minimal ${theme} ${mobile ? 'mobile' : 'desktop'} shell`, async ({ page }, info) => {
        await page.goto('/#/gacha');
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
        await page.locator('#overflowBtn').click();
        await page.locator(`.theme-btn[data-set="${theme}"]`).click();
        await expect(page.locator('#overflowMenu')).toBeVisible();
        await page.locator('#menuCloseBtn').click();
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.fonts.ready);
        await expectPersistentControlPixels(page, info, `shell-minimal-${variant}.png`);
      });
    });
  }
});
