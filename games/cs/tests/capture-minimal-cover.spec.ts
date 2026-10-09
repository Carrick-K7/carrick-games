import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { activateUi } from './ui.fixture';

// Outputs evidence to test-results only. The release owner reviews/copies the
// genuine 640x400 frame into public/cover.webp; tests never rewrite source art.
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false });
test('CS minimal HUD cover comes from a normal live arena frame', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
  await page.goto('/#/cs');
  await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info().ready), { timeout: 60_000 }).toBe(true);
  await activateUi(page, 'menu-mode-tdm');
  await activateUi(page, 'menu-start');
  // Existing game-owned QA skips only the pre-round wait on software GL;
  // the next real simulation tick enters play. No actor/camera/HUD is fabricated.
  await page.evaluate(() => (window as any).__CSX_DEBUG__?.skipFreeze());
  await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info().phase), { timeout: 30_000 }).toBe('active');
  await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info().playerAlive)).toBe(true);
  // Wait for the ordinary scene/HUD paint; no forced weapon, health, actor,
  // camera or simulation state. Downsample that same complete frame, no crop.
  const image = await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const game = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const output = document.createElement('canvas'); output.width = 640; output.height = 400;
    const ctx = output.getContext('2d')!; ctx.drawImage(game, 0, 0, game.width, game.height, 0, 0, 640, 400);
    return output.toDataURL('image/webp', .9).split(',')[1];
  });
  await writeFile(testInfo.outputPath('minimal-hud-cover.webp'), Buffer.from(image, 'base64'));
  await page.screenshot({ path: testInfo.outputPath('normal-arena-minimal-hud.png') });
  expect(errors).toEqual([]);
});
