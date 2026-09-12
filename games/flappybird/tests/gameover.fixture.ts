import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideFlappybird(page: Page) {
  // Do nothing, bird falls
  await page.waitForTimeout(4000);
}

export const gameoverProfile: GameProfile = { id: 'flappybird', suicide: suicideFlappybird, timeout: 15000 };
