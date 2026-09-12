import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideTexashold(page: Page) {
  // All-in and see result
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(15000);
}

export const gameoverProfile: GameProfile = { id: 'texashold', suicide: suicideTexashold, timeout: 25000, expectScore: false };
