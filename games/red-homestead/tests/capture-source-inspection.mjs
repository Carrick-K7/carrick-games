import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const directory = process.env.RA2_REFERENCE_DIR;
if (!directory) throw new Error('RA2_REFERENCE_DIR is required; source assets are never bundled');
const base = process.env.RH_PREVIEW_URL || 'http://127.0.0.1:5274';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 950 }, deviceScaleFactor: 1 });
const errors = [], uploads = []; page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (['POST','PUT'].includes(request.method())) uploads.push(request.url()); });
try {
  await page.goto(`${base}/#red-homestead`);
  await page.locator('[data-rh-action="materials"]').click();
  await page.locator('[data-rh-action="inspect-assets"]').setInputFiles(['unittem.pal','gatech01.shp','seas.vxl','seas.hva','cala03.shp','cagard03.shp'].map(name => join(directory, name)));
  await page.waitForFunction(() => document.querySelectorAll('.rh-inspector canvas').length === 4);
  await mkdir('games/red-homestead/tests/artifacts', { recursive: true });
  await page.screenshot({ path: 'games/red-homestead/tests/artifacts/community-source-inspection.png' });
  const images = await page.locator('.rh-inspector canvas').evaluateAll(items => items.map(canvas => ({ width: canvas.width, height: canvas.height })));
  if (process.env.RA2_MAP_REFERENCE_DIR) {
    await page.locator('[data-rh-action="inspect-assets"]').setInputFiles(join(process.env.RA2_MAP_REFERENCE_DIR, '2_snow_valley.map'));
    await page.waitForFunction(() => document.querySelector('.rh-inspector')?.textContent?.includes('19305 decoded cells'));
    await page.screenshot({ path: 'games/red-homestead/tests/artifacts/community-map-inspection.png' });
  }
  console.log(JSON.stringify({ images, errors, uploads, scope: 'local community source inspection, not complete original game scene' }, null, 2));
  if (errors.length || uploads.length) process.exitCode = 1;
} finally { await browser.close(); }
