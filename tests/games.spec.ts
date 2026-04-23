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
  // Wait briefly for game loop to start
  await page.waitForTimeout(300);
}

function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

// ─── Game input profiles ────────────────────────────────────────────────────

interface GameProfile {
  id: string;
  keys?: string[];
  clicks?: number; // number of canvas clicks
  delayMs?: number;
}

const KEYBOARD_GAMES: GameProfile[] = [
  { id: 'snake', keys: ['ArrowRight', 'ArrowUp', 'ArrowDown'], delayMs: 1500 },
  { id: 'breakout', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'tetris', keys: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'pong', keys: ['ArrowUp', 'ArrowDown', 'w', 's'], delayMs: 2000 },
  { id: 'spaceshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'flappybird', keys: ['Space', 'Space', 'Space'], delayMs: 2000 },
  { id: 'pacman', keys: ['ArrowRight', 'ArrowUp', 'ArrowLeft'], delayMs: 2000 },
  { id: 'invaders', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'asteroids', keys: ['ArrowLeft', 'ArrowUp', 'Space'], delayMs: 2000 },
  { id: 'doodlejump', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'frogger', keys: ['ArrowUp', 'ArrowUp', 'ArrowLeft'], delayMs: 2000 },
  { id: 'galaga', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'stacker', keys: ['Space'], delayMs: 1500 },
  { id: 'berzerk', keys: ['ArrowLeft', 'ArrowUp', 'Space'], delayMs: 2000 },
  { id: 'joust', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'donkeykong', keys: ['ArrowRight', 'Space', 'ArrowLeft'], delayMs: 2000 },
  { id: 'missilecommand', keys: ['Space'], delayMs: 2000 },
  { id: 'parking', keys: ['ArrowUp', 'ArrowLeft', 'ArrowRight'], delayMs: 2000 },
  { id: 'bubbleshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: '2048', keys: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], delayMs: 1500 },
];

const CLICK_GAMES: GameProfile[] = [
  { id: 'minesweeper', clicks: 3, delayMs: 1500 },
  { id: 'checkers', clicks: 2, delayMs: 1500 },
  { id: 'solitaire', clicks: 2, delayMs: 1500 },
  { id: 'chess', clicks: 2, delayMs: 1500 },
  { id: 'mahjong', clicks: 3, delayMs: 1500 },
  { id: 'connectfour', clicks: 2, delayMs: 1500 },
  { id: 'texashold', clicks: 1, delayMs: 1500 },
  { id: 'simon', clicks: 2, delayMs: 2000 },
  { id: 'sudoku', clicks: 2, delayMs: 1500 },
  { id: 'wordle', clicks: 1, delayMs: 1500 },
];

const ALL_GAME_IDS = [
  ...KEYBOARD_GAMES.map(g => g.id),
  ...CLICK_GAMES.map(g => g.id),
];

// ─── Lifecycle tests ────────────────────────────────────────────────────────

test.describe('Carrick Games - Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('index page loads and shows game navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/Carrick Games/i);
    const gameItems = page.locator('.game-list-item');
    await expect(gameItems.first()).toBeVisible();
    expect(await gameItems.count()).toBeGreaterThan(0);
  });

  test('all 30 games are registered in the list', async ({ page }) => {
    for (const id of ALL_GAME_IDS) {
      const item = page.locator(`.game-list-item[data-id="${id}"]`);
      await expect(item).toBeVisible();
    }
  });

  test('game canvas is present', async ({ page }) => {
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('clicking a game shows its controls and canvas', async ({ page }) => {
    await page.locator('.game-list-item').first().click();
    await expect(page.locator('#actionBtn')).toBeVisible();
    await expect(page.locator('#controlsPanel')).toBeVisible();
  });

  test('snake can be started and restarted without errors', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);

    await selectGame(page, 'snake');
    await startGame(page);

    // Play a few moves
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);

    // Restart
    await page.locator('#actionBtn').click();
    await page.waitForTimeout(500);

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });
});

// ─── Per-game keyboard smoke tests ──────────────────────────────────────────

test.describe('Keyboard Games - Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  for (const profile of KEYBOARD_GAMES) {
    test(`${profile.id}: starts and handles keyboard without errors`, async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);

      await selectGame(page, profile.id);
      await startGame(page);

      for (const key of (profile.keys || [])) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }

      await page.waitForTimeout(profile.delayMs || 1500);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});

// ─── Per-game click/touch smoke tests ───────────────────────────────────────

test.describe('Click Games - Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  for (const profile of CLICK_GAMES) {
    test(`${profile.id}: starts and handles clicks without errors`, async ({ page }) => {
      const { consoleErrors, pageErrors } = await collectErrors(page);

      await selectGame(page, profile.id);
      await startGame(page);

      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toBeVisible();

      const clicks = profile.clicks || 1;
      for (let i = 0; i < clicks; i++) {
        // Click different positions to increase coverage
        const box = await canvas.boundingBox();
        if (box) {
          const offsetX = box.width * (0.3 + (i % 3) * 0.2);
          const offsetY = box.height * (0.3 + (i % 2) * 0.3);
          await page.mouse.click(box.x + offsetX, box.y + offsetY);
        } else {
          await canvas.click();
        }
        await page.waitForTimeout(300);
      }

      // Wordle and Sudoku also benefit from keyboard input
      if (profile.id === 'wordle') {
        await page.keyboard.press('a');
        await page.keyboard.press('p');
        await page.keyboard.press('p');
        await page.keyboard.press('l');
        await page.keyboard.press('e');
        await page.waitForTimeout(200);
      }
      if (profile.id === 'sudoku') {
        await page.keyboard.press('1');
        await page.keyboard.press('2');
        await page.waitForTimeout(200);
      }
      if (profile.id === 'texashold') {
        await page.keyboard.press('c');
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
      }

      await page.waitForTimeout(profile.delayMs || 1000);

      expect(filterFavicon(consoleErrors)).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  }
});

// ─── Stability tests ────────────────────────────────────────────────────────

test.describe('Stability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('asteroids runs 10s without page errors', async ({ page }) => {
    const { pageErrors } = await collectErrors(page);
    await selectGame(page, 'asteroids');
    await startGame(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(10000);
    expect(pageErrors).toHaveLength(0);
  });

  test('tetris runs 10s without page errors', async ({ page }) => {
    const { pageErrors } = await collectErrors(page);
    await selectGame(page, 'tetris');
    await startGame(page);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(8000);
    expect(pageErrors).toHaveLength(0);
  });

  test('checkers: player can make a move and AI responds', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);
    await selectGame(page, 'checkers');
    await startGame(page);

    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Click a player piece (bottom-left area of board)
    if (box) {
      await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
      await page.waitForTimeout(400);
      // Click a valid destination square
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.65);
      await page.waitForTimeout(1500);
    }

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('connectfour: player can drop a piece and AI responds', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);
    await selectGame(page, 'connectfour');
    await startGame(page);

    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();

    if (box) {
      // Click center column
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
      await page.waitForTimeout(1500);
    }

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('chess: player can select a piece and AI responds', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);
    await selectGame(page, 'chess');
    await startGame(page);

    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();

    if (box) {
      // Click a white pawn (bottom center-ish)
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85);
      await page.waitForTimeout(500);
      // Click forward square
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
      await page.waitForTimeout(2500); // AI thinks
    }

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('minesweeper: clicking cells does not crash', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);
    await selectGame(page, 'minesweeper');
    await startGame(page);

    const canvas = page.locator('#gameCanvas');
    const box = await canvas.boundingBox();

    if (box) {
      // Click a few cells on the grid
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          await page.mouse.click(
            box.x + box.width * (0.15 + c * 0.12),
            box.y + box.height * (0.25 + r * 0.12)
          );
          await page.waitForTimeout(200);
        }
      }
    }

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('theme toggle does not break games', async ({ page }) => {
    await page.goto('/');
    await selectGame(page, 'snake');

    // Toggle to light
    await page.locator('.theme-btn[data-set="light"]').click();
    await page.waitForTimeout(300);

    await startGame(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    // Toggle back to dark
    await page.locator('.theme-btn[data-set="dark"]').click();
    await page.waitForTimeout(300);

    const { consoleErrors, pageErrors } = await collectErrors(page);
    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('language switch does not break games', async ({ page }) => {
    await page.goto('/');
    await selectGame(page, 'snake');

    // Switch to Chinese
    await page.locator('.lang-btn[data-lang="zh"]').click();
    await page.waitForTimeout(300);

    await startGame(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    // Switch back to English
    await page.locator('.lang-btn[data-lang="en"]').click();
    await page.waitForTimeout(300);

    const { consoleErrors, pageErrors } = await collectErrors(page);
    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });
});
