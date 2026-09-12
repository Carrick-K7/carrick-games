import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicidePong(page: Page) {
  // Move paddle away from ball to let AI score
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(8000);
}

export const gameoverProfile: GameProfile = { id: 'pong', suicide: suicidePong, timeout: 20000 };
