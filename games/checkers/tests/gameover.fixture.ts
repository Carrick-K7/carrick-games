import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideCheckers(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Select a piece and move it forward (AI will eventually win)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.65);
  await page.waitForTimeout(8000);
}

export const gameoverProfile: GameProfile = { id: 'checkers', suicide: suicideCheckers, timeout: 20000, expectScore: false };
