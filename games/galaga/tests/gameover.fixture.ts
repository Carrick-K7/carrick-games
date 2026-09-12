import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideGalaga(page: Page) {
  // Stay still, enemy dive-bombs you
  await page.waitForTimeout(5000);
}

export const gameoverProfile: GameProfile = { id: 'galaga', suicide: suicideGalaga, timeout: 15000 };
