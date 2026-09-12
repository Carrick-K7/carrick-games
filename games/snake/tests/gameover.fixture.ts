import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideSnake(page: Page) {
  // Go right then immediately left -> wall collision
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1500);
}

export const gameoverProfile: GameProfile = { id: 'snake', suicide: suicideSnake, timeout: 15000 };
