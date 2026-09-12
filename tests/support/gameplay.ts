import { expect, type ConsoleMessage, type Page } from '@playwright/test';
import { GAMES } from './catalog';

/** Shared browser mechanics; never imports a game implementation. */
export async function collectErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err: Error) => pageErrors.push(err.message));
  return { consoleErrors, pageErrors };
}

export async function selectGame(page: Page, gameId: string) {
  // Follow the current game's Esc contract before targeting shell controls.
  if (await page.evaluate(() => !!document.pointerLockElement)) {
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  }
  await page.keyboard.press('Control+k');
  const item = page.locator(`.game-list-item[data-id="${gameId}"]`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  const meta = GAMES.find((g) => g.id === gameId);
  const zh = await page.locator('html').getAttribute('data-lang') === 'zh';
  if (meta) {
    // A previous game stays intact during preflight. Wait for the requested
    // identity AND successful startup, not an old label or an early ID alone.
    const mountTimeout = ['cs', 'cs-kimi', 'villa'].includes(gameId) ? 45_000 : 15_000;
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', gameId, { timeout: mountTimeout });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: mountTimeout });
    await expect(page.locator('#loadingOverlay')).not.toHaveClass(/active/, { timeout: mountTimeout });
    await expect(page.locator('#selectedGameLabel')).toHaveText(zh ? meta.nameZh : meta.name);
    // Responsive 3D and Gacha own logical dimensions; boards retain theirs.
    if (['cs', 'cs-kimi', 'villa'].includes(gameId)) {
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: gameId === 'villa' ? 30_000 : 5_000 });
    } else if (gameId !== 'gacha') {
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-width', String(meta.canvasSize.width));
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-height', String(meta.canvasSize.height));
    }
  }
  await expect(page.locator('#gameLibrary')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
}

export async function startGame(page: Page) {
  // Games play immediately on entry; the helper only settles the run loop.
  await page.waitForTimeout(300);
}

export async function openOverflow(page: Page) {
  if (!(await page.locator('#overflowMenu').isVisible())) await page.locator('#overflowBtn').click();
  await expect(page.locator('#overflowMenu')).toBeVisible();
}

export function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

export async function canvasColorCount(page: Page, gridSize = 20): Promise<number> {
  return page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement, size: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const colors = new Set<string>();
    const stepX = Math.max(1, Math.floor(canvas.width / size));
    const stepY = Math.max(1, Math.floor(canvas.height / size));
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const [r, g, b, a] = Array.from(ctx.getImageData(x, y, 1, 1).data);
        if (a === 0) continue;
        colors.add(`${r},${g},${b}`);
      }
    }
    return colors.size;
  }, gridSize);
}
