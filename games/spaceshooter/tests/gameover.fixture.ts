import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideSpaceshooter(page: Page) {
  // Stay still, enemy will crash into you
  await page.waitForTimeout(5000);
}

export const gameoverProfile: GameProfile = { id: 'spaceshooter', suicide: suicideSpaceshooter, timeout: 15000 };
