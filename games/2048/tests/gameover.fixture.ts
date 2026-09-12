import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicide2048(page: Page) {
  // Fill board by spamming directions
  for (let i = 0; i < 40; i++) {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    await page.keyboard.press(keys[i % 4]);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: '2048', suicide: suicide2048, timeout: 20000 };
