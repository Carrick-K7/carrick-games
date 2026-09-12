import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideIwanna(page: Page) {
  // Walk into the opening spike pit
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1200);
}

export const gameoverProfile: GameProfile = { id: 'iwanna', suicide: suicideIwanna, timeout: 15000 };
