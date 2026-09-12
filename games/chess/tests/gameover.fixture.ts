import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideChess(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Move pawn, then move king toward danger
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85);
  await page.waitForTimeout(600);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.waitForTimeout(4000);
  // Move king again toward danger
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.waitForTimeout(600);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.waitForTimeout(4000);
}

export const gameoverProfile: GameProfile = { id: 'chess', suicide: suicideChess, timeout: 25000, expectScore: false };
