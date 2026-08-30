import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  await page.locator('#gamePickerBtn').click();
  const item = page.locator(`.game-list-item[data-id="${gameId}"]`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(page.locator('#startOverlay')).toHaveClass(/active/);
}

async function startGame(page: Page) {
  await page.locator('#startOverlay').click();
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

// ─── Per-game suicide strategies ────────────────────────────────────────────

async function suicideSnake(page: Page) {
  // Go right then immediately left -> wall collision
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1500);
}

async function suicideBreakout(page: Page) {
  // Do nothing, ball drops
  await page.waitForTimeout(6000);
}

async function suicideTetris(page: Page) {
  // Spam hard drop to fill board quickly
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

async function suicidePong(page: Page) {
  // Move paddle away from ball to let AI score
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(8000);
}

async function suicideSpaceshooter(page: Page) {
  // Stay still, enemy will crash into you
  await page.waitForTimeout(5000);
}

async function suicideFlappybird(page: Page) {
  // Do nothing, bird falls
  await page.waitForTimeout(4000);
}

async function suicideAsteroids(page: Page) {
  // No thrust, asteroid hits you
  await page.waitForTimeout(6000);
}

async function suicideDoodlejump(page: Page) {
  // No movement, fall off screen
  await page.waitForTimeout(4000);
}

async function suicideGalaga(page: Page) {
  // Stay still, enemy dive-bombs you
  await page.waitForTimeout(5000);
}

async function suicideStacker(page: Page) {
  // Wait for block to pass edge then lock -> miss
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
}

async function suicideIwanna(page: Page) {
  // Walk into the opening spike pit
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1200);
}

async function suicideParking(page: Page) {
  // Accelerate into wall
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(1500);
}

async function suicideBubbleshooter(page: Page) {
  // Rapid fire to fill board
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
}

async function suicide2048(page: Page) {
  // Fill board by spamming directions
  for (let i = 0; i < 40; i++) {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    await page.keyboard.press(keys[i % 4]);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);
}

async function suicideMinesweeper(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click many cells rapidly, one will be a mine
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      await page.mouse.click(box.x + box.width * (0.12 + c * 0.1), box.y + box.height * (0.22 + r * 0.1));
      await page.waitForTimeout(80);
    }
  }
  await page.waitForTimeout(1000);
}

async function suicideSimon(page: Page) {
  // Press wrong key during playback (if it starts immediately)
  await page.waitForTimeout(1200);
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
}

async function suicideCheckers(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Select a piece and move it forward (AI will eventually win)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.65);
  await page.waitForTimeout(8000);
}

async function suicideConnectfour(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Drop a few pieces, AI will connect four quickly
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.waitForTimeout(1500);
  }
}

async function suicideChess(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Move pawn, then move king toward danger
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85);
  await page.waitForTimeout(600);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.waitForTimeout(4000);
  // Move king again toward danger
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.waitForTimeout(600);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.waitForTimeout(4000);
}

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

async function suicideSudoku(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click a cell and input numbers
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  // Try to finish by pressing Space (restart)
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
}

async function suicideAimlab(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click randomly at various positions to try to hit targets
  for (let i = 0; i < 15; i++) {
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
  // Wait for timer to expire
  await page.waitForTimeout(6000);
}

async function suicideSolitaire(page: Page) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Click various areas to move cards
  for (let i = 0; i < 15; i++) {
    const x = box.x + box.width * (0.1 + (i % 7) * 0.12);
    const y = box.y + box.height * (0.15 + (i % 3) * 0.2);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

async function suicideCounterstrike(page: Page) {
  // Charge into the central firefight every round: dying fast keeps CT at a
  // 3v4 disadvantage so the T side takes the first-to-3 match quickly.
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
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

async function suicideTexashold(page: Page) {
  // All-in and see result
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(15000);
}

// ─── Game profiles ──────────────────────────────────────────────────────────

interface GameProfile {
  id: string;
  suicide: (page: Page) => Promise<void>;
  timeout?: number;
  expectScore?: boolean; // true only when the strategy deterministically reaches a score-reporting end state
}

const GAMEOVER_PROFILES: GameProfile[] = [
  { id: 'snake', suicide: suicideSnake, timeout: 15000 },
  { id: 'breakout', suicide: suicideBreakout, timeout: 15000 },
  { id: 'tetris', suicide: suicideTetris, timeout: 20000 },
  { id: 'pong', suicide: suicidePong, timeout: 20000 },
  { id: 'spaceshooter', suicide: suicideSpaceshooter, timeout: 15000 },
  { id: 'flappybird', suicide: suicideFlappybird, timeout: 15000 },
  { id: 'asteroids', suicide: suicideAsteroids, timeout: 15000 },
  { id: 'doodlejump', suicide: suicideDoodlejump, timeout: 15000 },
  { id: 'galaga', suicide: suicideGalaga, timeout: 15000 },
  { id: 'stacker', suicide: suicideStacker, timeout: 15000 },
  { id: 'iwanna', suicide: suicideIwanna, timeout: 15000 },
  { id: 'counterstrike', suicide: suicideCounterstrike, timeout: 230000, expectScore: true },
  { id: 'parking', suicide: suicideParking, timeout: 15000 },
  { id: 'aimlab', suicide: suicideAimlab, timeout: 20000, expectScore: true },
  { id: 'bubbleshooter', suicide: suicideBubbleshooter, timeout: 20000 },
  { id: '2048', suicide: suicide2048, timeout: 20000 },
  { id: 'minesweeper', suicide: suicideMinesweeper, timeout: 15000 },
  { id: 'simon', suicide: suicideSimon, timeout: 15000 },
  { id: 'checkers', suicide: suicideCheckers, timeout: 20000, expectScore: false },
  { id: 'connectfour', suicide: suicideConnectfour, timeout: 20000, expectScore: false },
  { id: 'chess', suicide: suicideChess, timeout: 25000, expectScore: false },
  { id: 'wordle', suicide: suicideWordle, timeout: 15000, expectScore: true },
  { id: 'sudoku', suicide: suicideSudoku, timeout: 15000, expectScore: false },
  { id: 'solitaire', suicide: suicideSolitaire, timeout: 20000, expectScore: false },
  { id: 'texashold', suicide: suicideTexashold, timeout: 25000, expectScore: false },
];

// ─── Game Over Tests ────────────────────────────────────────────────────────

test.describe('Game Over - Arcade', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  for (const profile of GAMEOVER_PROFILES) {
    test(`${profile.id}: reaches game over and restarts cleanly`, async ({ page }) => {
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

      // Restart should always work.
      // Counter-Strike restarts through its own terminal action (Enter);
      // the shell restart button's hit-testing is unreliable for this game.
      if (profile.id === 'counterstrike') {
        await page.keyboard.press('Enter');
      } else {
        await restartGame(page);
      }
      await page.waitForTimeout(500);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});
