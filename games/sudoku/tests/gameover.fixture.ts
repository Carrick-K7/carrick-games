import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideSudoku(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click a cell and input numbers
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  // Try to finish by pressing Space (restart)
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
}

export const gameoverProfile: GameProfile = { id: 'sudoku', suicide: suicideSudoku, timeout: 15000, expectScore: false };
