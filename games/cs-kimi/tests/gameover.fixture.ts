import { type Page } from '@playwright/test';
import { type GameProfile } from '../../../tests/support/gameover';

async function suicideCounterstrike(page: Page) {
  // Charge into the central firefight every round: dying fast keeps CT at a
  // 3v4 disadvantage so the T side takes the first-to-3 match quickly.
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox() as NonNullable<Awaited<ReturnType<typeof canvas.boundingBox>>>;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const SENS_DRAG = 0.0022 * 1.6;

  await page.waitForFunction(
    () => (document.getElementById('gameCanvas')?.dataset.counterstrikeState || '').split(',')[1] === 'live',
    undefined,
    { timeout: 15000 },
  );

  const deadline = Date.now() + 215000;
  while (Date.now() < deadline) {
    const state = await canvas.getAttribute('data-counterstrike-state');
    if (!state) return;
    const result = await canvas.getAttribute('data-game-result');
    if (result) return;
    const [head, , pl] = state.split('|');
    const phase = head.split(',')[1];
    if (phase !== 'live') {
      await page.waitForTimeout(600);
      continue;
    }
    const [px, py, , ang] = pl.split(',');
    let target = Math.atan2(840 - Number(py), 720 - Number(px));
    let delta = target - (Number(ang.slice(1)) * Math.PI) / 180;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const move = Math.max(-600, Math.min(600, delta / SENS_DRAG));
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + move, cy, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    await page.keyboard.up('w');
  }
}

export const gameoverProfile: GameProfile = { id: 'cs-kimi', suicide: suicideCounterstrike, timeout: 230000, expectScore: true };

// Restart through the game's own terminal action; preserve the original Enter path.
export async function restartGameover(page: Page) {
  await page.keyboard.press('Enter');
}
