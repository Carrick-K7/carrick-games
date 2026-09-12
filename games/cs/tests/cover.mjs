import { tapPainted } from '../../../tests/support/cover.mjs';
export async function prepare(page) {
  await page.waitForFunction(() => window.__CSX_DEBUG__?.info()?.ready, null, { timeout: 60_000 });
  await tapPainted(page, /enter (?:the )?arena|进入战场/);
  await page.waitForFunction(() => window.__CSX_DEBUG__?.info()?.playerAlive, null, { timeout: 45_000 });
  await page.evaluate(() => window.__CSX_DEBUG__.skipFreeze());
}
export const settleMs = 1200;
