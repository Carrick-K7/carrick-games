import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideWordle(page: Page) {
  // Type 6 wrong words rapidly
  await page.evaluate(() => {
    const words = ['apple', 'beach', 'cloud', 'dance', 'eagle', 'flame'];
    for (const word of words) {
      for (const ch of word) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);
}

export const gameoverProfile: GameProfile = { id: 'wordle', suicide: suicideWordle, timeout: 15000, expectScore: true };
