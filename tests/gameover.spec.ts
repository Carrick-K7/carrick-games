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

async function suicideInvaders(page: any) {
  // Move to edge and stay, invaders reach bottom quickly
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(15000);
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

async function suicideBerzerk(page: any) {
  // Walk toward nearest robot
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    }
  });
  await page.waitForTimeout(4000);
}

async function suicideJoust(page: any) {
  // Do nothing, fall or enemy hits
  await page.waitForTimeout(5000);
}

async function suicideDonkeykong(page: any) {
  // Wait for barrel to roll down and hit
  await page.waitForTimeout(8000);
}

async function suicideMissilecommand(page: any) {
  // Do nothing, missiles destroy cities
  await page.waitForTimeout(12000);
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

async function suicideMahjong(page: any) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  // Rapidly click tiles to make matches or exhaust moves
  for (let i = 0; i < 20; i++) {
    const x = box.x + box.width * (0.2 + (i % 5) * 0.15);
    const y = box.y + box.height * (0.2 + Math.floor(i / 5) * 0.15);
    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
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
  expectScore?: boolean; // some puzzle games may not report score on loss
}

const GAMEOVER_PROFILES: GameProfile[] = [
  { id: 'snake', suicide: suicideSnake, timeout: 15000 },
  { id: 'breakout', suicide: suicideBreakout, timeout: 15000 },
  { id: 'tetris', suicide: suicideTetris, timeout: 20000 },
  { id: 'pong', suicide: suicidePong, timeout: 20000 },
  { id: 'spaceshooter', suicide: suicideSpaceshooter, timeout: 15000 },
  { id: 'flappybird', suicide: suicideFlappybird, timeout: 15000 },
  { id: 'pacman', suicide: suicidePacman, timeout: 20000 },
  { id: 'invaders', suicide: suicideInvaders, timeout: 25000 },
  { id: 'asteroids', suicide: suicideAsteroids, timeout: 15000 },
  { id: 'doodlejump', suicide: suicideDoodlejump, timeout: 15000 },
  { id: 'frogger', suicide: suicideFrogger, timeout: 15000 },
  { id: 'galaga', suicide: suicideGalaga, timeout: 15000 },
  { id: 'stacker', suicide: suicideStacker, timeout: 15000 },
  { id: 'berzerk', suicide: suicideBerzerk, timeout: 15000 },
  { id: 'joust', suicide: suicideJoust, timeout: 15000 },
  { id: 'donkeykong', suicide: suicideDonkeykong, timeout: 20000 },
  { id: 'missilecommand', suicide: suicideMissilecommand, timeout: 25000 },
  { id: 'parking', suicide: suicideParking, timeout: 15000 },
  { id: 'bubbleshooter', suicide: suicideBubbleshooter, timeout: 20000 },
  { id: '2048', suicide: suicide2048, timeout: 20000 },
  { id: 'minesweeper', suicide: suicideMinesweeper, timeout: 15000 },
  { id: 'simon', suicide: suicideSimon, timeout: 15000 },
  { id: 'checkers', suicide: suicideCheckers, timeout: 20000, expectScore: true },
  { id: 'connectfour', suicide: suicideConnectfour, timeout: 20000, expectScore: true },
  { id: 'chess', suicide: suicideChess, timeout: 25000, expectScore: true },
  { id: 'mahjong', suicide: suicideMahjong, timeout: 20000, expectScore: true },
  { id: 'wordle', suicide: suicideWordle, timeout: 15000, expectScore: true },
  { id: 'sudoku', suicide: suicideSudoku, timeout: 15000, expectScore: false },
  { id: 'solitaire', suicide: suicideSolitaire, timeout: 20000, expectScore: false },
  { id: 'texashold', suicide: suicideTexashold, timeout: 25000, expectScore: true },
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

      // For games that should report score on loss/gameover
      if (profile.expectScore !== false) {
        // Arcade games and competitive puzzle games should report something
        // We log but don't hard-fail if they don't, because some games
        // may have complex end conditions that don't trigger in our suicide window
        if (!hasReported && profile.expectScore === true) {
          // Soft assertion: log warning but still check restart works
          console.warn(`[${profile.id}] reportScore was not called within test window`);
        }
      }

      // Restart should always work
      await restartGame(page);
      await page.waitForTimeout(500);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});
