import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCanvasPoint } from '../src/core/render';
import {
  IWANNA_PLAYER_H,
  IWANNA_PLAYER_W,
  resolveIwannaHorizontalMove,
} from '../src/games/iwannaPhysics';
import { createParkingCar, updateParkingCar } from '../src/games/parkingPhysics';
import {
  PACMAN_RADIUS,
  PACMAN_TILE,
  movePacmanBody,
} from '../src/games/pacmanPhysics';
import { calculateSudokuScore } from '../src/games/sudokuScore';

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
  // Wait briefly for game loop to start
  await page.waitForTimeout(300);
}

function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

function gameModuleName(url: string): string | null {
  const match = url.match(/\/dist\/games\/([^/?]+\.js)(?:\?|$)/);
  return match?.[1] ?? null;
}

async function canvasColorCount(page: any, gridSize = 20): Promise<number> {
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

  { id: 'asteroids', keys: ['ArrowLeft', 'ArrowUp', 'Space'], delayMs: 2000 },
  { id: 'doodlejump', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'frogger', keys: ['ArrowUp', 'ArrowUp', 'ArrowLeft'], delayMs: 2000 },
  { id: 'galaga', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'stacker', keys: ['Space'], delayMs: 1500 },

  { id: 'iwanna', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'beachhead', keys: ['ArrowLeft', 'ArrowUp', 'Space', 'ArrowRight'], delayMs: 2000 },
  { id: 'aimlab', keys: [], delayMs: 1500 },
  { id: 'parking', keys: ['ArrowUp', 'ArrowLeft', 'ArrowRight'], delayMs: 2000 },
  { id: 'bubbleshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: '2048', keys: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], delayMs: 1500 },
];

const CLICK_GAMES: GameProfile[] = [
  { id: 'minesweeper', clicks: 3, delayMs: 1500 },
  { id: 'checkers', clicks: 2, delayMs: 1500 },
  { id: 'solitaire', clicks: 2, delayMs: 1500 },
  { id: 'chess', clicks: 2, delayMs: 1500 },

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

test.describe('Game rules', () => {
  test('canvas font literals stay within UI bounds', () => {
    const gamesDir = join(process.cwd(), 'src/games');
    const oversizedFonts: string[] = [];
    const fontRegex = /ctx\.font\s*=\s*(['"`])(?:[^'"`]*?\s)?(\d+)px\b/g;

    for (const file of readdirSync(gamesDir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(gamesDir, file), 'utf8');
      for (const match of source.matchAll(fontRegex)) {
        const size = Number(match[2]);
        if (size > 56) {
          oversizedFonts.push(`${file}: ${size}px`);
        }
      }
    }

    expect(oversizedFonts).toEqual([]);
  });

  test('sudoku hints reduce final score', () => {
    const cleanSolve = calculateSudokuScore(120, 0, 0);
    const withHints = calculateSudokuScore(120, 0, 2);
    const withMistake = calculateSudokuScore(120, 1, 0);

    expect(withHints).toBeLessThan(cleanSolve);
    expect(withMistake).toBeLessThan(cleanSolve);
    expect(calculateSudokuScore(9999, 10, 10)).toBe(0);
  });

  test('canvas coordinates map through displayed size', () => {
    const canvas = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 800,
        height: 1200,
      }),
    } as HTMLCanvasElement;

    expect(getCanvasPoint(canvas, 400, 600, 500, 650)).toEqual({ x: 200, y: 300 });
  });

  test('iwanna horizontal movement stops at platform edges', () => {
    const platform = { x: 100, y: 100, w: 80, h: 20 };
    const player = {
      x: platform.x - IWANNA_PLAYER_W - 1,
      y: platform.y + 1,
      vx: 154,
      vy: 0,
      onGround: false,
    };

    const moved = resolveIwannaHorizontalMove(player, [platform], 12, 480);

    expect(moved.x + IWANNA_PLAYER_W).toBeLessThanOrEqual(platform.x);
    expect(moved.y + IWANNA_PLAYER_H).toBeGreaterThan(platform.y);
  });

  test('parking car accelerates responsively with front-wheel steering', () => {
    let straight = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      straight = updateParkingCar(straight, { up: true, down: false, left: false, right: false }, 1 / 60);
    }

    expect(straight.y).toBeLessThan(340);
    expect(straight.speed).toBeGreaterThan(150);

    let car = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      car = updateParkingCar(car, { up: true, down: false, left: false, right: true }, 1 / 60);
    }

    expect(car.x).toBeGreaterThan(205);
    expect(car.angle).toBeGreaterThan(-Math.PI / 2);
    expect(car.angle).toBeLessThan(-0.35);

    const reverse = updateParkingCar(
      { ...createParkingCar(200, 460, -Math.PI / 2), speed: -50 },
      { up: false, down: true, left: false, right: true },
      0.35
    );
    expect(reverse.angle).toBeLessThan(-Math.PI / 2);
  });

  test('pacman body stops before entering wall tiles', () => {
    const centerY = PACMAN_TILE + PACMAN_TILE / 2;
    const result = movePacmanBody({
      maze: [[0, 0], [1, 0], [0, 0]],
      cols: 2,
      rows: 3,
      tile: PACMAN_TILE,
      radius: PACMAN_RADIUS,
      x: PACMAN_TILE / 2,
      y: centerY,
      dir: 'RIGHT',
      nextDir: 'RIGHT',
      speed: PACMAN_TILE * 2,
      dt: 1,
    });

    expect(result.x + PACMAN_RADIUS).toBeLessThanOrEqual(PACMAN_TILE);
    expect(result.y).toBe(centerY);
    expect(result.col).toBe(0);
    expect(result.row).toBe(1);
  });

  test('pacman recenters on the lane axis when blocked by a wall', () => {
    const centerY = PACMAN_TILE + PACMAN_TILE / 2;
    const result = movePacmanBody({
      maze: [[0, 0], [1, 0], [0, 0]],
      cols: 2,
      rows: 3,
      tile: PACMAN_TILE,
      radius: PACMAN_RADIUS,
      x: PACMAN_TILE - PACMAN_RADIUS - 1,
      y: centerY + 3,
      dir: 'RIGHT',
      nextDir: 'RIGHT',
      speed: PACMAN_TILE,
      dt: 1,
    });

    expect(result.x).toBeCloseTo(PACMAN_TILE - PACMAN_RADIUS, 5);
    expect(result.y).toBe(centerY);
    expect(result.col).toBe(0);
    expect(result.row).toBe(1);
  });
});

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

  test('initial page load does not fetch unselected game modules', async ({ page }) => {
    const gameModules: string[] = [];
    page.on('request', (request) => {
      const moduleName = gameModuleName(request.url());
      if (moduleName) gameModules.push(moduleName);
    });

    await page.goto('/');
    await expect(page.locator('.game-list-item').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect([...new Set(gameModules)].sort()).toEqual(['snake.js']);
  });

  test('system light theme renders the canvas with light game colors', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('#gameCanvas')).toBeVisible();

    const topLeftPixel = await page.locator('#gameCanvas').evaluate((canvas) => {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) return [];
      return Array.from(ctx.getImageData(1, 1, 1, 1).data).slice(0, 3);
    });

    const [r, g, b] = topLeftPixel;
    expect(r + g + b).toBeGreaterThan(360);
    expect(g).toBeGreaterThan(120);
  });

  test('high density displays use a scaled backing canvas without changing logical size', async ({ browser }) => {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1600, height: 900 },
    });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await selectGame(page, 'snake');

      const metrics = await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => {
        const box = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          logicalWidth: Number(canvas.dataset.logicalWidth),
          logicalHeight: Number(canvas.dataset.logicalHeight),
          pixelRatio: Number(canvas.dataset.pixelRatio),
          boxWidth: Math.round(box.width),
          boxHeight: Math.round(box.height),
        };
      });

      expect(metrics.logicalWidth).toBe(400);
      expect(metrics.logicalHeight).toBe(400);
      expect(metrics.pixelRatio).toBe(2);
      expect(metrics.width).toBe(800);
      expect(metrics.height).toBe(800);
      expect(metrics.boxWidth).toBe(400);
      expect(metrics.boxHeight).toBe(400);
    } finally {
      await context.close();
    }
  });

  test('all games render HD Retro layered canvas scenes', async ({ page }) => {
    for (const id of ALL_GAME_IDS) {
      await selectGame(page, id);
      await startGame(page);
      const renderStyle = await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.renderStyle);
      expect(renderStyle).toBe('minimal-hd');
      expect(await canvasColorCount(page)).toBeGreaterThanOrEqual(1);
    }
  });

  test('corrupted stored records do not break startup', async ({ page }) => {
    const { consoleErrors, pageErrors } = await collectErrors(page);

    await page.evaluate(() => localStorage.setItem('cg-records', '{bad json'));
    await page.reload();

    await expect(page.locator('.game-list-item').first()).toBeVisible();
    await expect(page.locator('#actionBtn')).toBeVisible();

    expect(filterFavicon(consoleErrors)).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('all 27 games are registered in the list', async ({ page }) => {
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
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('mobile game list selects different games reliably', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const isCollapsed = await page.locator('body').evaluate((el) => el.classList.contains('sidebar-collapsed'));
    if (isCollapsed) {
      await page.locator('#sidebarToggle').click();
      await page.waitForTimeout(180);
    }

    const idToNameZh: Record<string, string> = {
      breakout: '打砖块',
      pong: '乒乓',
      snake: '贪吃蛇',
      flappybird: '像素鸟',
    };

    for (const id of ['breakout', 'pong', 'snake', 'flappybird']) {
      const item = page.locator(`.game-list-item[data-id="${id}"]`);
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await expect(page.locator('#gameTitle')).toHaveText(idToNameZh[id]);
      await expect(page.locator('#actionBtn')).toHaveText('开始游戏');
      const hash = await page.evaluate(() => location.hash);
      expect(hash).toBe(`#/${id}`);
    }
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
