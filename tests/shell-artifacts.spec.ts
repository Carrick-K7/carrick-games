import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtCatalog } from './support/releases';

test('Vite owns production module loading and emits hashed assets', () => {
  const builtIndex = readFileSync(join(process.cwd(), 'dist/index.html'), 'utf8');
  expect(builtIndex).toMatch(/<script type="module" crossorigin src="\/shell\/[a-f0-9]{40}\/assets\/[^\"]+-[A-Za-z0-9_-]+\.js"><\/script>/);
  expect(builtIndex).toMatch(/<link rel="stylesheet" crossorigin href="\/shell\/[a-f0-9]{40}\/assets\/[^\"]+-[A-Za-z0-9_-]+\.css">/);
  for (const game of builtCatalog().games) {
    expect(game.entry).toBe(`${game.assetBase}entry.js`);
    expect(game.entry).toMatch(/^\/games\/[a-z0-9-]+\/[^/]+\/[a-f0-9]{40}\/entry\.js$/);
    const descriptor = JSON.parse(readFileSync(join(process.cwd(), 'dist', game.assetBase, 'game.json'), 'utf8'));
    expect(descriptor.id).toBe(game.id);
    expect(descriptor.version).toBe(game.version);
    expect(descriptor.revision).toBe(game.revision);
    expect(descriptor.files['entry.js']).toBeTruthy();
    for (const style of game.styles) {
      expect(style.startsWith(game.assetBase)).toBe(true);
      expect(descriptor.files[style.slice(game.assetBase.length)]).toBeTruthy();
    }
  }
});
