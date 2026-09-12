import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideParking(page: Page) {
  // Accelerate into wall
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(1500);
}

export const gameoverProfile: GameProfile = { id: 'parking', suicide: suicideParking, timeout: 15000 };
