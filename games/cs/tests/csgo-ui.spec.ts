import { expect, test, type Page } from '@playwright/test';
import { activateUi, uiRegion } from './ui.fixture';

async function ready(page: Page) {
  await page.goto('/#/cs');
  await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info()?.ready), { timeout: 60_000 }).toBe(true);
}
async function colorAt(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const ui = (window as any).__CSX_DEBUG__.ui();
    return [...canvas.getContext('2d')!.getImageData(Math.round(x * canvas.width / ui.width), Math.round(y * canvas.height / ui.height), 1, 1).data].slice(0, 3);
  }, { x, y });
}

test.describe('CS tactical interface presentation', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 1100, height: 640 } });
  test('real map cards load from the active release and hover does not move controls', async ({ page }, testInfo) => {
    const errors: string[] = [], assets: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).pathname.includes('/assets/ui/')) {
        expect(response.status()).toBe(200); assets.push(new URL(response.url()).pathname);
      }
    });
    const snow = page.waitForResponse(r => r.url().endsWith('/assets/ui/maps/fy_snow.webp'));
    const dust = page.waitForResponse(r => r.url().endsWith('/assets/ui/maps/de_dust2.webp'));
    await ready(page); await Promise.all([snow, dust]);
    const base = (await page.locator('#gameCanvas').getAttribute('data-game-asset-base'))!;
    const before = (await uiRegion(page, 'menu-mode-tdm'))!;
    await page.mouse.move(0, 0);
    await expect.poll(() => colorAt(page, before.x + 8, before.y + 8)).toEqual([38, 51, 62]);
    await page.mouse.move(before.clientX, before.clientY);
    await expect.poll(() => colorAt(page, before.x + 8, before.y + 8)).toEqual([52, 70, 82]);
    expect(await uiRegion(page, 'menu-mode-tdm')).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('tactical-map-selection.png') });
    const gun = page.waitForResponse(r => r.url().endsWith('/assets/ui/weapons/usp.svg'));
    await activateUi(page, 'menu-start'); await gun;
    await page.screenshot({ path: testInfo.outputPath('tactical-match-hud.png') });
    expect(assets.filter(path => !path.startsWith(base))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('CS optional map artwork fallback', () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('missing thumbnails retain usable map choices and the fixed play action', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/assets/ui/maps/*.webp', route => route.abort());
    await ready(page);
    expect(await uiRegion(page, 'menu-map-fy_snow')).not.toBeNull();
    expect(await uiRegion(page, 'menu-map-de_dust2')).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('tactical-map-fallback.png') });
    await activateUi(page, 'menu-start', true);
    await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__.info().playerAlive)).toBe(true);
    expect(errors).toEqual([]);
  });
});
