import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideAimlab(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click randomly at various positions to try to hit targets
  for (let i = 0; i < 15; i++) {
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
  // Wait for timer to expire
  await page.waitForTimeout(6000);
}

export const gameoverProfile: GameProfile = { id: 'aimlab', suicide: suicideAimlab, timeout: 20000, expectScore: true };
