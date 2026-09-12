import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideStacker(page: Page) {
  // Wait for block to pass edge then lock -> miss
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: 'stacker', suicide: suicideStacker, timeout: 15000 };
