// Capture actual built game frames, never synthetic artwork or live previews.
// Run against the existing preview, with no other software-GL browser job active.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ROOT, DIST, json } from './workspaces.mjs';
import { parseCatalog } from '../packages/game-sdk/src/catalog.ts';

const origin = process.env.COVER_ORIGIN || 'http://127.0.0.1:8080';
const { catalog, rejected } = parseCatalog(await json(join(DIST, 'games', 'index.json')), origin);
if (rejected.length) throw new Error(`Invalid built cover catalog: ${rejected.join('; ')}`);
const selected = new Set(process.argv.slice(2));
for (const id of selected) if (!catalog.games.some(game => game.id === id)) throw new Error(`Unknown built game: ${id}`);
const browser = await chromium.launch();
const captures = [];
try {
  for (const game of catalog.games.filter(game => !selected.size || selected.has(game.id))) {
    const recipePath = join(ROOT, 'games', game.id, 'tests', 'cover.mjs');
    const recipe = existsSync(recipePath) ? await import(pathToFileURL(recipePath).href) : {};
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('cg-lang', 'en');
      localStorage.setItem('cg-theme', 'dark');
      let seed = 314159;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      // Let game-owned input recipes target actual painted controls.
      window.__coverLabels = {};
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        if (this.canvas.id === 'gameCanvas') {
          const m = this.getTransform(), r = this.canvas.getBoundingClientRect();
          window.__coverLabels[String(text)] = {
            x: r.x + (m.a * x + m.c * y + m.e) * r.width / this.canvas.width,
            y: r.y + (m.b * x + m.d * y + m.f) * r.height / this.canvas.height,
          };
        }
        if (maxWidth === undefined) fill.call(this, text, x, y);
        else fill.call(this, text, x, y, maxWidth);
      };
    });
    await page.goto(`${origin}/${recipe.query ? `?${recipe.query}` : ''}#/${game.id}`);
    await page.waitForFunction(id => {
      const canvas = document.getElementById('gameCanvas');
      return canvas?.dataset.gameId === id && canvas.dataset.gameRunning === 'true'
        && !document.getElementById('loadingOverlay')?.classList.contains('active');
    }, game.id, { timeout: 60_000 });
    let demo = false;
    if (recipe.prepare) await recipe.prepare(page);
    else if (await page.locator('#demoBtn').evaluate(button => !button.hidden && !button.disabled)) {
      await page.locator('#overflowBtn').click();
      await page.locator('#demoBtn').click();
      demo = true;
    }
    await page.waitForTimeout(recipe.settleMs ?? (demo ? 550 : 180));
    if (await page.locator('#gameCanvas').getAttribute('data-game-result-title')) {
      await page.keyboard.press('Escape');
      await page.locator('#overflowBtn').click();
      await page.locator('#restartBtn').click();
      await page.waitForTimeout(80);
      demo = false;
    }
    const capture = await page.locator('#gameCanvas').evaluate((canvas, crop) => {
      const out = document.createElement('canvas'); out.width = 640; out.height = 400;
      const ctx = out.getContext('2d');
      if (!ctx || !canvas.width || !canvas.height) throw new Error('No readable game frame');
      const sw = canvas.width, sh = canvas.height, aspect = sw / sh;
      if (crop) {
        ctx.drawImage(canvas, crop.x * sw, crop.y * sh, crop.width * sw, crop.height * sh, 0, 0, 640, 400);
      } else if (aspect >= 1.6) {
        const scale = Math.max(640 / sw, 400 / sh);
        ctx.drawImage(canvas, (640 - sw * scale) / 2, (400 - sh * scale) / 2, sw * scale, sh * scale);
      } else {
        // Keep a portrait/square board complete. Side extensions are a softened
        // copy of that same real frame, never invented game content.
        const scale = Math.max(704 / sw, 464 / sh);
        ctx.filter = 'blur(20px)';
        ctx.drawImage(canvas, (640 - sw * scale) / 2, (400 - sh * scale) / 2, sw * scale, sh * scale);
        ctx.filter = 'none'; ctx.fillStyle = 'rgba(7,15,15,.38)'; ctx.fillRect(0, 0, 640, 400);
        const width = 400 * aspect;
        ctx.drawImage(canvas, (640 - width) / 2, 0, width, 400);
      }
      return { image: out.toDataURL('image/webp', .9), sourceWidth: sw, sourceHeight: sh, terminal: canvas.dataset.gameResultTitle ?? null };
    }, recipe.crop ?? null);
    if (!capture.image.startsWith('data:image/webp;base64,')) throw new Error('Browser cannot encode WebP');
    if (errors.length) throw new Error(`${game.id}: ${errors.join('; ')}`);
    const bytes = Buffer.from(capture.image.split(',')[1], 'base64');
    const directory = join(ROOT, 'games', game.id, 'public');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'cover.webp'), bytes);
    captures.push({ id: game.id, version: game.version, revision: game.revision, demo, ...capture, bytes: bytes.length });
    console.log(`Captured ${game.id}: ${bytes.length} bytes, ${capture.sourceWidth}x${capture.sourceHeight} real frame${capture.terminal ? ` [${capture.terminal}]` : ''}`);
    await context.close();
  }
  const sheetItems = [];
  for (const game of catalog.games) {
    const path = join(ROOT, 'games', game.id, 'public', 'cover.webp');
    if (existsSync(path)) sheetItems.push({ id: game.id, image: `data:image/webp;base64,${(await readFile(path)).toString('base64')}` });
  }
  const page = await browser.newPage();
  const sheet = await page.evaluate(async items => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = Math.ceil(items.length / 4) * 228;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0d1412'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, item] of items.entries()) {
      const image = new Image(); image.src = item.image; await image.decode();
      const x = (index % 4) * 320, y = Math.floor(index / 4) * 228;
      ctx.drawImage(image, x, y, 320, 200);
      ctx.font = '14px system-ui'; ctx.fillStyle = '#edf5f1'; ctx.fillText(item.id, x + 10, y + 220);
    }
    return canvas.toDataURL('image/webp', .9);
  }, sheetItems);
  const output = join(ROOT, '.ci', 'covers'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'contact-sheet.webp'), Buffer.from(sheet.split(',')[1], 'base64'));
  await writeFile(join(output, 'captures.json'), JSON.stringify(captures.map(({ image, ...item }) => item), null, 2) + '\n');
  console.log('Review .ci/covers/contact-sheet.webp before accepting these covers.');
} finally { await browser.close(); }
