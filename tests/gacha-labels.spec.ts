import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('reel captions sit beneath each weapon without a duplicate readout; result retains the name', () => {
  const reel = readFileSync('src/games/gachaModeCsgo.ts', 'utf8');
  expect(reel.match(/\.fillText\(/g)).toHaveLength(1);
  expect(reel).toContain('c.fillText(caption, this.cardW / 2, this.cardH - 17');
  expect(reel).toContain('this.ctx.zh ? card.item.nameZh : card.item.name');
  expect(reel).not.toContain('readoutY');
  expect(reel).toContain('const photoH = this.cardH - 42');
  const game = readFileSync('src/games/gacha.ts', 'utf8');
  const result = game.slice(game.indexOf('private drawResult('), game.indexOf('private drawResult(') + 12000);
  expect(result).toContain('ctx.fillText(truncate(item.nameZh');
});
