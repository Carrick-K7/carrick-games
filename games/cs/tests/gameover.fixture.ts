import { expect, type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';
import { activateUi } from './ui.fixture';

async function suicideCs(page: Page) {
  // The migrated engine boots to an in-canvas menu first. Wait for the map to
  // load, click the current visible "进入战场" target, then force
  // the terminal state so the single CS result panel and one-shot score
  // reporting are exercised without seven realtime rounds. Responsive menu
  // layouts and scrolling are covered separately by game-window tests.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(
    () => (window as unknown as { __CSX_DEBUG__?: { info?: () => { ready: boolean } | null } }).__CSX_DEBUG__?.info?.()?.ready === true,
    undefined,
    { timeout: 60000 },
  );
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveCSS('width', '1280px');
  await activateUi(page, 'menu-start');
  await page.waitForFunction(
    () => (window as unknown as { __CSX_DEBUG__?: { info?: () => { phase: string } | null } }).__CSX_DEBUG__?.info?.()?.phase === 'freeze',
    undefined,
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    (window as unknown as { __CSX_DEBUG__?: { forceMatchEnd?: (won: boolean) => void } }).__CSX_DEBUG__?.forceMatchEnd?.(true);
  });
  await page.waitForTimeout(600);
}

export const gameoverProfile: GameProfile = { id: 'cs', suicide: suicideCs, timeout: 90000, expectScore: true };

// Restart through the game's own terminal action; preserve the original Enter path.
export async function restartGameover(page: Page) {
  await page.keyboard.press('Enter');
}
