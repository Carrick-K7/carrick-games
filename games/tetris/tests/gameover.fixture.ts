import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideTetris(page: Page) {
  // Spam hard drop to fill board quickly
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: 'tetris', suicide: suicideTetris, timeout: 20000 };
