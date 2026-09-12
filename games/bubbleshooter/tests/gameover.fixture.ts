import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideBubbleshooter(page: Page) {
  // Rapid fire to fill board
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
}

export const gameoverProfile: GameProfile = { id: 'bubbleshooter', suicide: suicideBubbleshooter, timeout: 20000 };
