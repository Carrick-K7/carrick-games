import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCanvasPoint } from '../src/core/render';
import { GAMES } from '../src/games/catalog';
import {
  IWANNA_PLAYER_H,
  IWANNA_PLAYER_W,
  resolveIwannaHorizontalMove,
} from '../src/games/iwannaPhysics';
import {
  PARKING_CAR_LENGTH,
  PARKING_CAR_WIDTH,
  PARKING_FORWARD_ACCEL,
  PARKING_MAX_STEER,
  PARKING_MIN_TURN_RADIUS,
  PARKING_PIXELS_PER_METER,
  PARKING_WHEEL_BASE,
  createParkingCar,
  updateParkingCar,
} from '../src/games/parkingPhysics';
import {
  PARKING_LEVELS,
  createParkingDemoRoute,
  parkingCarCollides,
  parkingCarIsParked,
  parkingRouteIsClear,
} from '../src/games/parking';
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
  const meta = GAMES.find((g) => g.id === gameId);
  const zh = await page.locator('html').getAttribute('data-lang') === 'zh';
  if (meta) {
    await expect(page.locator('#gameTitle')).toHaveText(zh ? meta.nameZh : meta.name);
  }
  await expect(item).toHaveClass(/active/);
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
  const moduleName = match?.[1] ?? null;
  return moduleName === 'catalog.js' ? null : moduleName;
}

function normalizeRadians(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
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
  test('published game catalog matches source and README', () => {
    const ids = GAMES.map((g) => g.id);
    expect(ids).toHaveLength(27);
    expect(new Set(ids).size).toBe(ids.length);

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    expect(readme).toContain('Carrick Games currently ships 27 playable games');

    const gamesDir = join(process.cwd(), 'src/games');
    const gameClassFiles = readdirSync(gamesDir).filter((file) => {
      if (!file.endsWith('.ts') || file === 'catalog.ts') return false;
      const source = readFileSync(join(gamesDir, file), 'utf8');
      return /export class \w+ extends BaseGame/.test(source);
    });

    expect(gameClassFiles).toHaveLength(ids.length);
  });

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

  test('parking car accelerates responsively with a tight parking turn radius', () => {
    let straight = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      straight = updateParkingCar(straight, { up: true, down: false, left: false, right: false }, 1 / 60);
    }

    expect(straight.y).toBeGreaterThan(441);
    expect(straight.y).toBeLessThan(447);
    expect(straight.speed).toBeGreaterThan(30);
    expect(straight.speed).toBeLessThan(35);

    let cruising = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 180; i++) {
      cruising = updateParkingCar(cruising, { up: true, down: false, left: false, right: false }, 1 / 60);
    }

    expect(cruising.y).toBeGreaterThan(311);
    expect(cruising.y).toBeLessThan(318);
    expect(cruising.speed).toBeGreaterThan(94);
    expect(cruising.speed).toBeLessThan(99);

    let car = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      car = updateParkingCar(car, { up: true, down: false, left: false, right: true }, 1 / 60);
    }

    expect(car.x).toBeGreaterThan(200.0);
    expect(car.x).toBeLessThan(200.5);
    expect(car.y).toBeGreaterThan(453);
    expect(car.y).toBeLessThan(459);
    expect(car.angle).toBeGreaterThan(-1.54);
    expect(car.angle).toBeLessThan(-1.48);

    const reverse = updateParkingCar(
      { ...createParkingCar(200, 460, -Math.PI / 2), speed: -50 },
      { up: false, down: true, left: false, right: true },
      0.35
    );
    expect(reverse.angle).toBeLessThan(-Math.PI / 2);

    let analog = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      analog = updateParkingCar(analog, { up: true, down: false, left: false, right: false, steer: 0.5 }, 1 / 60);
    }
    expect(analog.steerAngle).toBeGreaterThan(PARKING_MAX_STEER * 0.40);
    expect(analog.steerAngle).toBeLessThan(PARKING_MAX_STEER * 0.60);
  });

  test('parking car model follows Tank 500 proportions', () => {
    expect(PARKING_CAR_LENGTH).toBe(50);
    expect(PARKING_PIXELS_PER_METER).toBeCloseTo(50 / 5.078, 5);
    expect(PARKING_CAR_WIDTH / PARKING_CAR_LENGTH).toBeCloseTo(1934 / 5078, 5);
    expect(PARKING_WHEEL_BASE / PARKING_CAR_LENGTH).toBeCloseTo(2850 / 5078, 5);
    expect(PARKING_MIN_TURN_RADIUS / PARKING_CAR_LENGTH).toBeCloseTo(5600 / 5078, 5);
    expect(PARKING_MAX_STEER).toBeCloseTo(Math.atan(2850 / 5600), 5);
    expect(PARKING_FORWARD_ACCEL).toBeCloseTo((100000 / 3600 / 8.5) * PARKING_PIXELS_PER_METER, 5);
  });

  test('parking completion requires the full car footprint inside the spot', () => {
    const level = PARKING_LEVELS[0];
    const centered = {
      x: level.spot.x + level.spot.w / 2,
      y: level.spot.y + level.spot.h / 2,
      angle: -Math.PI / 2,
      speed: 0,
    };

    expect(parkingCarIsParked(level, centered)).toBe(true);
    expect(parkingCarIsParked(level, {
      ...centered,
      x: level.spot.x + 7,
    })).toBe(false);
  });

  test('parking ships 100 non-repeating levels with planned technique coverage', () => {
    expect(PARKING_LEVELS).toHaveLength(100);
    expect(new Set(PARKING_LEVELS.map((level) => level.id)).size).toBe(100);

    const signatures = PARKING_LEVELS.map((level) => JSON.stringify({
      start: level.playerStart,
      spot: level.spot,
      obstacles: level.obstacles,
    }));
    expect(new Set(signatures).size).toBe(100);

    expect(new Set(PARKING_LEVELS.map((level) => level.technique))).toEqual(new Set([
      'front-bay-top',
      'front-bay-bottom',
      'reverse-bay-top',
      'reverse-bay-bottom',
      'parallel-right',
      'reverse-parallel-right',
      'angled-bay',
      'tight-garage',
      'alley-weave',
      'precision-curb',
    ]));
  });

  test('parking levels all have a theoretical demo route', () => {
    const missingRoutes = PARKING_LEVELS
      .map((level, index) => ({ index, route: createParkingDemoRoute(level) }))
      .filter(({ route, index }) =>
        !route || route.waypoints.length < 2 || !parkingRouteIsClear(PARKING_LEVELS[index], route)
      )
      .map(({ index }) => index + 1);

    expect(missingRoutes).toEqual([]);
  });

  test('parking demo routes drive into the spot without a final pivot', () => {
    const badRoutes = PARKING_LEVELS
      .map((level, index) => ({ index, route: createParkingDemoRoute(level) }))
      .filter(({ route }) => {
        if (!route || route.waypoints.length < 2) return true;
        const prev = route.waypoints[route.waypoints.length - 2];
        const last = route.waypoints[route.waypoints.length - 1];
        const lastSegmentAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
        let delta = route.finalAngle - lastSegmentAngle;
        while (delta <= -Math.PI) delta += Math.PI * 2;
        while (delta > Math.PI) delta -= Math.PI * 2;
        return Math.abs(delta) > 0.08;
      })
      .map(({ index }) => index + 1);

    expect(badRoutes).toEqual([]);
  });

  test('parking demo routes are physically drivable by the car footprint and turn radius', () => {
    const badRoutes = PARKING_LEVELS
      .map((level, index) => ({ level, index, route: createParkingDemoRoute(level) }))
      .filter(({ level, route }) => {
        if (!route || route.poses.length < 2) return true;

        if (route.poses.some((pose) => parkingCarCollides(level, pose))) return true;

        const finalPose = route.poses[route.poses.length - 1];
        if (!parkingCarIsParked(level, { ...finalPose, speed: 0 })) return true;

        const startHeadingError = Math.abs(normalizeRadians(route.poses[0].angle - level.playerStart.angle));
        if (startHeadingError > 0.65) return true;

        for (let i = 1; i < route.poses.length; i++) {
          const prev = route.poses[i - 1];
          const pose = route.poses[i];
          const dist = Math.hypot(pose.x - prev.x, pose.y - prev.y);
          const headingDelta = Math.abs(normalizeRadians(pose.angle - prev.angle));
          if (dist > 0.5 && headingDelta / dist > 1.15 / PARKING_MIN_TURN_RADIUS) {
            return true;
          }
        }

        return false;
      })
      .map(({ index }) => index + 1);

    expect(badRoutes).toEqual([]);
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

    const firstNameFontSize = await gameItems.first().locator('.game-list-name').evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    );
    expect(firstNameFontSize).toBeGreaterThanOrEqual(14);
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

    expect([...new Set(gameModules)].sort()).toEqual([
      'parking.js', 'parkingConstants.js', 'parkingGeometry.js',
      'parkingLevels.js', 'parkingPhysics.js', 'parkingRoute.js',
    ]);
  });

  test('parking is the first game and default entry is playable', async ({ page }) => {
    await expect(page.locator('.game-list-item').first()).toHaveAttribute('data-id', 'parking');
    await expect(page.locator('#gameTitle')).toHaveText('停车');

    await page.locator('#actionBtn').click();
    await expect
      .poll(() => page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.parkingState))
      .toBe('playing');
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
          parkingState: canvas.dataset.parkingState ?? '',
        };
      });

      expect(metrics.logicalWidth).toBe(400);
      expect(metrics.logicalHeight).toBe(400);
      expect(metrics.pixelRatio).toBe(2);
      expect(metrics.width).toBe(800);
      expect(metrics.height).toBe(800);
      expect(metrics.boxWidth).toBe(400);
      expect(metrics.boxHeight).toBe(400);
      expect(metrics.parkingState).toBe('');
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

  test('parking first start enters a drivable state for arrow keys', async ({ page }) => {
    await selectGame(page, 'parking');
    await page.locator('#actionBtn').click();

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowUp');

    await expect(page.locator('#ds-speed-val')).toBeVisible();
    const speed = Number(await page.locator('#ds-speed-val').textContent());
    expect(speed).toBeGreaterThan(0);
  });

  test('parking driving HUD has no countdown timer', async ({ page }) => {
    await selectGame(page, 'parking');
    await startGame(page);

    await expect(page.locator('#ds-speed-val')).toBeVisible();
    await expect(page.locator('.ds-time')).toHaveCount(0);
  });

  test('parking best record is completed level count and migrates stale score records', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('cg-records', JSON.stringify({ parking: 999 }));
      localStorage.setItem('carrick-parking-progress', JSON.stringify({ unlocked: 6, bestLevel: 7 }));
    });
    await page.reload();

    await selectGame(page, 'parking');

    const bestRow = page.locator('#statsPanel .stats-row').filter({ hasText: '最高关卡' });
    await expect(bestRow.locator('.stats-value')).toHaveText('7');
    const migratedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-records') || '{}').parking);
    expect(migratedRecord).toBe(7);

    await page.evaluate(() => {
      localStorage.removeItem('carrick-parking-progress');
      localStorage.setItem('cg-records', JSON.stringify({ parking: 999 }));
    });
    await page.reload();
    await selectGame(page, 'parking');

    await expect(bestRow.locator('.stats-value')).toHaveText('0');
    const discardedStaleRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-records') || '{}').parking);
    expect(discardedStaleRecord).toBe(0);
  });

  test('parking shows steering wheel and mouse steering updates it', async ({ page }) => {
    await selectGame(page, 'parking');
    await startGame(page);

    await expect(page.locator('#parkingSteeringWheel')).toBeVisible();
    await page.locator('#gameCanvas').scrollIntoViewIfNeeded();
    const box = await page.locator('#gameCanvas').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.86, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(350);

    await expect(page.locator('#parkingSteerMode')).toHaveText('鼠标');
    const wheelRotation = await page.locator('#parkingSteeringWheel').evaluate((el: HTMLElement) =>
      parseFloat(el.style.getPropertyValue('--wheel-rotation') || '0')
    );
    expect(wheelRotation).toBeGreaterThan(80);

    await page.mouse.up();
    await page.waitForTimeout(250);
    await expect(page.locator('#parkingSteerMode')).toHaveText('键盘');
  });

  test('parking demo completes without unlocking the next level', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('carrick-parking-progress'));
    await page.reload();

    await selectGame(page, 'parking');
    const secondLevel = page.locator('.level-cell[data-level="1"]');
    await expect(secondLevel).toHaveClass(/locked/);

    await expect(page.locator('#demoBtn')).toBeVisible();
    await page.locator('#demoBtn').click();
    await expect(page.locator('#startOverlay')).not.toHaveClass(/active/);
    await expect(page.locator('canvas')).toBeVisible();
    await expect
      .poll(() => page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.parkingState), {
        timeout: 12000,
      })
      .toBe('demoComplete');
    await expect(secondLevel).toHaveClass(/locked/);
  });

  test('parking level 11 demo completes without unlocking later levels', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('carrick-parking-progress', JSON.stringify({
      unlocked: 10,
      bestLevel: 10,
    })));
    await page.reload();

    await selectGame(page, 'parking');
    await page.locator('.level-cell[data-level="10"]').click();

    await expect(page.locator('#demoBtn')).toBeVisible();
    await page.locator('#demoBtn').click();
    await expect
      .poll(() => page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.parkingState), {
        timeout: 15000,
      })
      .toBe('demoComplete');

    const progress = await page.evaluate(() => localStorage.getItem('carrick-parking-progress'));
    expect(progress).toBe(JSON.stringify({ unlocked: 10, bestLevel: 10 }));
    await expect(page.locator('.level-cell[data-level="11"]')).toHaveClass(/locked/);
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
