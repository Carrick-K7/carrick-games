import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideMinesweeper(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click many cells rapidly, one will be a mine
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      await page.mouse.click(box.x + box.width * (0.12 + c * 0.1), box.y + box.height * (0.22 + r * 0.1));
      await page.waitForTimeout(80);
    }
  }
  await page.waitForTimeout(1000);
}

export const gameoverProfile: GameProfile = { id: 'minesweeper', suicide: suicideMinesweeper, timeout: 15000 };
