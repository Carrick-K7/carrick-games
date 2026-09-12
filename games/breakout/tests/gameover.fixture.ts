import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideBreakout(page: Page) {
  // Do nothing, ball drops
  await page.waitForTimeout(6000);
}

export const gameoverProfile: GameProfile = { id: 'breakout', suicide: suicideBreakout, timeout: 15000 };
