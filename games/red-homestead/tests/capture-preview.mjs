import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const base = process.env.RH_PREVIEW_URL || 'http://127.0.0.1:5274';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { localStorage.setItem('lang', 'zh'); });
await page.goto(`${base}/#red-homestead`);
await page.locator('[data-rh-action="new-session"]').waitFor();
await page.locator('[data-rh-field="economy"]').selectOption('creative');
await page.locator('[data-rh-action="new-session"]').click();
await page.locator('[data-rh-action="deploy"]').click();
async function place(kind, x, y) {
  await page.locator('[data-rh-action="build"]').click();
  const item = page.locator(`[data-rh-action="build-${kind}"]`); await item.scrollIntoViewIfNeeded(); await item.click();
  const p = await page.evaluate(({ x, y }) => {
    const state = window.__GAME_VIEWPORT_DEBUG__.info(); const c = state.camera;
    const canvas = document.getElementById('gameCanvas'), rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((x-y)*30*c.zoom+c.x)*rect.width/state.width, y: rect.top+((x+y+1)*15*c.zoom+c.y)*rect.height/state.height };
  }, { x, y });
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Escape');
}
await place('power', 10, 6);
await place('refinery', 10, 10);
await place('house', 5, 11);
await place('house', 8, 14);
await place('park', 4, 14);
await place('market', 12, 14);
await place('apartment', 3, 7);
await place('greenhouse', 15, 13);
await place('library', 14, 6);
await place('clinic', 7, 10);
for (let x = 3; x <= 13; x++) await place('road', x, 9);
for (const [x,y] of [[5,10],[10,12],[10,13],[10,14],[10,15],[10,16],[11,13],[12,13],[13,13]]) await place('road',x,y);
for (const [x,y] of [[2,12],[3,12],[7,16]]) await place('tree',x,y);
await place('lamp',7,11); await place('lamp',11,16); await place('fountain',7,13);
if (process.env.RA2_REFERENCE_DIR) {
  await page.locator('[data-rh-action="worlds"]').click(); await page.locator('[data-rh-action="classics"]').click();
  await page.locator('[data-rh-action="classic-files"]').setInputFiles(['gatech01.shp','unittem.pal'].map(name => join(process.env.RA2_REFERENCE_DIR,name)));
  await page.locator('[data-rh-action="classic-import"]').click();
  await page.waitForFunction(() => document.querySelector('[data-rh-import-status]')?.textContent?.match(/已保存到本机|Saved locally/));
  await page.locator('[data-rh-action^="classic-apply-"]').click();
  await page.waitForFunction(() => window.__GAME_VIEWPORT_DEBUG__.info().sourceArtIntegrated === true);
}
// Observe actual construction and resident movement, never replace/mutate the simulation.
await page.waitForFunction(() => { const s=window.__GAME_VIEWPORT_DEBUG__.info(); return s.buildings.every(b=>b.progress===1) && s.residentsVisible>=4; }, undefined, { timeout: 60000 });
await page.locator('[data-rh-action="pause"]').click();
await mkdir('games/red-homestead/tests/artifacts', { recursive: true });
await page.screenshot({ path: `games/red-homestead/tests/artifacts/${process.env.RA2_REFERENCE_DIR ? 'community-gameplay' : 'desktop-preview'}.png` });
const cover = await page.evaluate(() => {
  const source = document.getElementById('gameCanvas');
  const target = document.createElement('canvas'); target.width = 640; target.height = 400;
  target.getContext('2d').drawImage(source, 0, 0, 640, 400);
  return target.toDataURL('image/webp', .92).split(',')[1];
});
// The published cover contains only authored practice art. Private source screenshots stay ignored.
if (!process.env.RA2_REFERENCE_DIR) await writeFile('games/red-homestead/public/cover.webp', Buffer.from(cover, 'base64'));
console.log(JSON.stringify({ diagnostics: await page.evaluate(() => window.__GAME_VIEWPORT_DEBUG__.info()), errors }, null, 2));
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `games/red-homestead/tests/artifacts/${process.env.RA2_REFERENCE_DIR ? 'community-gameplay-phone' : 'phone-preview'}.png` });
await browser.close();
if (errors.length) process.exitCode = 1;
