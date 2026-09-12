import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideAsteroids(page: Page) {
  // No thrust, asteroid hits you
  await page.waitForTimeout(6000);
}

export const gameoverProfile: GameProfile = { id: 'asteroids', suicide: suicideAsteroids, timeout: 15000 };
