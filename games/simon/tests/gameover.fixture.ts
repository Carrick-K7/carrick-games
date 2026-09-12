import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideSimon(page: Page) {
  // Press wrong key during playback (if it starts immediately)
  await page.waitForTimeout(1200);
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: 'simon', suicide: suicideSimon, timeout: 15000 };
