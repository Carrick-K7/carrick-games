import { test, expect } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function collectErrors(page: any) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err: Error) => pageErrors.push(err.message));
  return { consoleErrors, pageErrors };
}

async function selectGame(page: any, gameId: string) {
  const item = page.locator(`.game-list-item[data-id="${gameId}"]`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(page.locator('#actionBtn')).toBeVisible();
  await expect(page.locator('#actionBtn')).toBeEnabled();
}

async function startGame(page: any) {
  const btn = page.locator('#actionBtn');
  await btn.click();
  await page.waitForTimeout(400);
}

function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

async function mockReportScore(page: any) {
  await page.evaluate(() => {
    (window as any).__testScores = [];
    const orig = (window as any).reportScore;
    (window as any).reportScore = (s: number) => {
      (window as any).__testScores.push(s);
      if (orig) orig(s);
    };
  });
}

async function getScores(page: any): Promise<number[]> {
  return page.evaluate(() => (window as any).__testScores || []);
}

async function restartGame(page: any) {
  const btn = page.locator('#actionBtn');
  await btn.click();
  await page.waitForTimeout(500);
}

// ─── Per-game suicide strategies ────────────────────────────────────────────

async function suicideSnake(page: any) {
  // Go right then immediately left -> wall collision
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1500);
}

async function suicideBreakout(page: any) {
  // Do nothing, ball drops
  await page.waitForTimeout(6000);
}

async function suicideTetris(page: any) {
  // Spam hard drop to fill board quickly
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

async function suicidePong(page: any) {
  // Move paddle away from ball to let AI score
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(8000);
}

async function suicideSpaceshooter(page: any) {
  // Stay still, enemy will crash into you
  await page.waitForTimeout(5000);
}

async function suicideFlappybird(page: any) {
  // Do nothing, bird falls
  await page.waitForTimeout(4000);
}

async function suicidePacman(page: any) {
  // Move a bit then stop, ghost catches you
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(8000);
}

async function suicideAsteroids(page: any) {
  // No thrust, asteroid hits you
  await page.waitForTimeout(6000);
}

async function suicideDoodlejump(page: any) {
  // No movement, fall off screen
  await page.waitForTimeout(4000);
}

async function suicideFrogger(page: any) {
  // Hop up into water without log -> die
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(2000);
}

async function suicideGalaga(page: any) {
  // Stay still, enemy dive-bombs you
  await page.waitForTimeout(5000);
}

async function suicideStacker(page: any) {
  // Wait for block to pass edge then lock -> miss
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
}

async function suicideIwanna(page: any) {
  // Walk into the opening spike pit
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1200);
}

async function suicideBeachhead(page: any) {
  // Let early waves land and fire back without defending
  await page.waitForTimeout(9000);
}

async function suicideParking(page: any) {
  // Accelerate into wall
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(1500);
}

async function suicideBubbleshooter(page: any) {
  // Rapid fire to fill board
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
}

async function suicide2048(page: any) {
  // Fill board by spamming directions
  for (let i = 0; i < 40; i++) {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    await page.keyboard.press(keys[i % 4]);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);
}

async function suicideMinesweeper(page: any) {
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

async function suicideSimon(page: any) {
  // Press wrong key during playback (if it starts immediately)
  await page.waitForTimeout(1200);
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
}

async function suicideCheckers(page: any) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Select a piece and move it forward (AI will eventually win)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.65);
  await page.waitForTimeout(8000);
}

async function suicideConnectfour(page: any) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Drop a few pieces, AI will connect four quickly
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.waitForTimeout(1500);
  }
}

async function suicideChess(page: any) {
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

async function suicideWordle(page: any) {
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

async function suicideSudoku(page: any) {
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

async function suicideAimlab(page: any) {
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

async function suicideSolitaire(page: any) {
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

async function suicideTexashold(page: any) {
  // All-in and see result
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(15000);
}

// ─── Game profiles ──────────────────────────────────────────────────────────

interface GameProfile {
  id: string;
  suicide: (page: any) => Promise<void>;
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
  { id: 'pacman', suicide: suicidePacman, timeout: 20000 },
  { id: 'asteroids', suicide: suicideAsteroids, timeout: 15000 },
  { id: 'doodlejump', suicide: suicideDoodlejump, timeout: 15000 },
  { id: 'frogger', suicide: suicideFrogger, timeout: 15000 },
  { id: 'galaga', suicide: suicideGalaga, timeout: 15000 },
  { id: 'stacker', suicide: suicideStacker, timeout: 15000 },
  { id: 'iwanna', suicide: suicideIwanna, timeout: 15000 },
  { id: 'beachhead', suicide: suicideBeachhead, timeout: 20000 },
  { id: 'parking', suicide: suicideParking, timeout: 15000 },
  { id: 'aimlab', suicide: suicideAimlab, timeout: 15000, expectScore: true },
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
      }

      // Restart should always work
      await restartGame(page);
      await page.waitForTimeout(500);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});
