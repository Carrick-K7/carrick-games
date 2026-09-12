import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideDoodlejump(page: Page) {
  // No movement, fall off screen
  await page.waitForTimeout(4000);
}

export const gameoverProfile: GameProfile = { id: 'doodlejump', suicide: suicideDoodlejump, timeout: 15000 };
