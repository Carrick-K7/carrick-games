import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

// Generic game-over mechanics only. Each game owns its profile and strategy.

async function collectErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err: Error) => pageErrors.push(err.message));
  return { consoleErrors, pageErrors };
}

async function selectGame(page: Page, gameId: string) {
  await page.keyboard.press('Control+k');
  const item = page.locator(`.game-list-item[data-id="${gameId}"]`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
}

async function startGame(page: Page) {
  // Games play immediately on entry; the helper only settles the run loop.
  await page.waitForTimeout(400);
}

function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

async function mockReportScore(page: Page) {
  await page.evaluate(() => {
    sessionStorage.setItem('test-scores', '[]');
    window.addEventListener('carrick:score', (event) => {
      const scores = JSON.parse(sessionStorage.getItem('test-scores') || '[]') as number[];
      scores.push((event as CustomEvent<number>).detail);
      sessionStorage.setItem('test-scores', JSON.stringify(scores));
    });
  });
}

async function getScores(page: Page): Promise<number[]> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('test-scores') || '[]') as number[]);
}

async function restartGame(page: Page) {
  await page.locator('#gameCanvas').click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(500);
}

export interface GameProfile {
  id: string;
  suicide: (page: Page) => Promise<void>;
  timeout?: number;
  expectScore?: boolean; // true only when the strategy deterministically reaches a score-reporting end state
}

/** Keep registrations in game-owned specs; inject any game-owned restart action. */
export async function runGameover(
  page: Page,
  profile: GameProfile,
  restart: (page: Page) => Promise<void> = restartGame,
) {
  test.setTimeout(profile.timeout || 20000);
  const { consoleErrors, pageErrors } = await collectErrors(page);
  await mockReportScore(page);

  await selectGame(page, profile.id);
  await startGame(page);

  await profile.suicide(page);

  const scores = await getScores(page);
  const hasReported = scores.length > 0;

  if (profile.expectScore === true) {
    expect(hasReported, `[${profile.id}] should report score during deterministic game-over path`).toBe(true);
    await expect(
      page.locator('#gameCanvas'),
      `[${profile.id}] should expose the shared result state`,
    ).toHaveAttribute('data-game-result', /^(success|danger|neutral)$/);
  }

  // Restart should always work; terminal-specific actions belong to the game.
  await restart(page);
  await page.waitForTimeout(500);

  expect(filterFavicon(consoleErrors)).toHaveLength(0);
  expect(pageErrors).toHaveLength(0);
}
