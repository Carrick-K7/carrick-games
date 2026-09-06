import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('moving reel has no weapon labels; result screen retains the name', () => {
  const reel = readFileSync('src/games/gachaModeCsgo.ts', 'utf8');
  expect(reel).not.toMatch(/\.fillText\(/);
  expect(reel).not.toContain('readoutY');
  expect(reel).toContain('const photoCy = this.cardH / 2');
  const game = readFileSync('src/games/gacha.ts', 'utf8');
  const result = game.slice(game.indexOf('private drawResult('), game.indexOf('private drawResult(') + 12000);
  expect(result).toContain('ctx.fillText(truncate(item.nameZh');
});
