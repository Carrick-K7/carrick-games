import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideConnectfour(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Drop a few pieces, AI will connect four quickly
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.waitForTimeout(1500);
  }
}

export const gameoverProfile: GameProfile = { id: 'connectfour', suicide: suicideConnectfour, timeout: 20000, expectScore: false };
