import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideSolitaire(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click various areas to move cards
  for (let i = 0; i < 15; i++) {
    const x = box.x + box.width * (0.1 + (i % 7) * 0.12);
    const y = box.y + box.height * (0.15 + (i % 3) * 0.2);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: 'solitaire', suicide: suicideSolitaire, timeout: 20000, expectScore: false };
