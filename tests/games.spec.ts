import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getCanvasPoint } from '../src/core/render';
import {
  GAME_GROUP_MAP,
  GAME_GROUPS,
  GAME_LIST_ORDER,
  GAMES,
} from '../src/games/catalog';
import {
  IWANNA_PLAYER_H,
  IWANNA_PLAYER_W,
  resolveIwannaHorizontalMove,
} from '../src/games/iwannaPhysics';
import {
  PARKING_ACCEL_RESPONSE_MULTIPLIER,
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
import { calculateSudokuScore } from '../src/games/sudokuScore';
import {
  BUY_ZONE,
  CT_SPAWNS,
  ICEBERG_MAP,
  MAP_COLS,
  MAP_ROWS,
  NADE_PICKUPS,
  T_SPAWNS,
  TILE,
  findMapPath,
  inBuyZone,
  isSolidTile,
  isWalkable,
} from '../src/games/counterstrikeMap';
import { WEAPONS } from '../src/games/counterstrikeRules';

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
  const item = page.locator(`.game-list-item[data-id="${gameId}"]`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  const meta = GAMES.find((g) => g.id === gameId);
  const zh = await page.locator('html').getAttribute('data-lang') === 'zh';
  if (meta) {
    await expect(page.locator('#gameTitle')).toHaveText(zh ? meta.nameZh : meta.name);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-width', String(meta.canvasSize.width));
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-height', String(meta.canvasSize.height));
  }
  await expect(item).toHaveClass(/active/);
  await expect(page.locator('#actionBtn')).toBeVisible();
  await expect(page.locator('#actionBtn')).toBeEnabled();
}

async function startGame(page: Page) {
  const btn = page.locator('#actionBtn');
  await btn.click();
  // Wait briefly for game loop to start
  await page.waitForTimeout(300);
}

function filterFavicon(errors: string[]) {
  return errors.filter(e => !e.toLowerCase().includes('favicon'));
}

function gameModuleName(url: string): string | null {
  const pathname = new URL(url).pathname.replace(/^\//, '');
  const source = Object.entries(readViteManifest()).find(([, entry]) => entry.file === pathname)?.[0];
  return source?.startsWith('src/games/') ? `${basename(source, '.ts')}.js` : null;
}

interface ViteManifestEntry {
  file: string;
  src?: string;
}

let viteManifest: Record<string, ViteManifestEntry> | null = null;

function readViteManifest(): Record<string, ViteManifestEntry> {
  viteManifest ??= JSON.parse(
    readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ) as Record<string, ViteManifestEntry>;
  return viteManifest;
}

function builtModuleUrl(source: string): string {
  const entry = readViteManifest()[source];
  if (!entry) throw new Error(`Missing Vite manifest entry for ${source}`);
  return `/${entry.file}`;
}

function normalizeRadians(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

async function canvasColorCount(page: Page, gridSize = 20): Promise<number> {
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

  { id: 'asteroids', keys: ['ArrowLeft', 'ArrowUp', 'Space'], delayMs: 2000 },
  { id: 'doodlejump', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'galaga', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'stacker', keys: ['Space'], delayMs: 1500 },

  { id: 'iwanna', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'counterstrike', keys: ['w', 'a', 's', 'd', 'r', 'b', 'q', '1', '2', '3', '4', 'g', ' '], delayMs: 2500 },
  { id: 'aimlab', keys: [], delayMs: 1500 },
  { id: 'parking', keys: ['ArrowUp', 'ArrowLeft', 'ArrowRight'], delayMs: 2000 },
  { id: 'bubbleshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: '2048', keys: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], delayMs: 1500 },
];

const CLICK_GAMES: GameProfile[] = [
  { id: 'luckycase', clicks: 1, delayMs: 1000 },
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
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(ids.length);

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    expect(readme).toContain('Carrick Games currently ships 26 playable games');
    const readmeNames = [...readme.matchAll(/^\| ([^|]+?) \| [^|]+? \| (?:Casual|Action|Puzzle|Board & Card) \|$/gm)]
      .map((match) => match[1]);
    expect(readmeNames).toHaveLength(ids.length);
    expect(new Set(readmeNames)).toEqual(new Set(GAMES.map((game) => game.name)));

    const gamesDir = join(process.cwd(), 'src/games');
    const gameClassFiles = readdirSync(gamesDir).filter((file) => {
      if (!file.endsWith('.ts') || file === 'catalog.ts') return false;
      const source = readFileSync(join(gamesDir, file), 'utf8');
      return /export class \w+ extends BaseGame/.test(source);
    });

    expect(gameClassFiles).toHaveLength(ids.length);
  });

  test('catalog uses four App Store-style primary groups', () => {
    expect(GAME_GROUPS).toEqual([
      { id: 'casual', name: 'Casual', nameZh: '休闲' },
      { id: 'action', name: 'Action', nameZh: '动作' },
      { id: 'puzzle', name: 'Puzzle', nameZh: '益智' },
      { id: 'tabletop', name: 'Board & Card', nameZh: '棋牌' },
    ]);

    const ids = GAMES.map((game) => game.id);
    expect(new Set(Object.keys(GAME_GROUP_MAP))).toEqual(new Set(ids));
    expect(new Set(GAME_LIST_ORDER)).toEqual(new Set(ids));
    for (const id of ids) {
      expect(GAME_GROUPS.some((group) => group.id === GAME_GROUP_MAP[id])).toBe(true);
    }
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

  test('games use shared terminal, input, locale, and score infrastructure', () => {
    const gamesDir = join(process.cwd(), 'src/games');
    const terminalGameFiles = [
      'aimlab.ts',
      'asteroids.ts',
      'breakout.ts',
      'bubbleshooter.ts',
      'checkers.ts',
      'chess.ts',
      'connectfour.ts',
      'doodlejump.ts',
      'flappybird.ts',
      'galaga.ts',
      'game2048.ts',
      'counterstrike.ts',
      'iwanna.ts',
      'minesweeper.ts',
      'parking.ts',
      'pong.ts',
      'simon.ts',
      'snake.ts',
      'solitaire.ts',
      'spaceshooter.ts',
      'stacker.ts',
      'sudoku.ts',
      'tetris.ts',
      'texashold.ts',
      'wordle.ts',
    ];

    const gameClassFiles = readdirSync(gamesDir).filter((file) => {
      if (!file.endsWith('.ts') || file === 'catalog.ts') return false;
      return /export class \w+ extends BaseGame/.test(readFileSync(join(gamesDir, file), 'utf8'));
    });

    const bypasses: string[] = [];
    for (const file of gameClassFiles) {
      const source = readFileSync(join(gamesDir, file), 'utf8');
      if (/window\.reportScore/.test(source)) bypasses.push(`${file}: direct score callback`);
      if (/document\.documentElement.*data-lang/.test(source)) bypasses.push(`${file}: direct locale lookup`);
      if (/getBoundingClientRect\(/.test(source)) bypasses.push(`${file}: manual pointer mapping`);
    }

    expect(bypasses).toEqual([]);
    for (const file of terminalGameFiles) {
      const source = readFileSync(join(gamesDir, file), 'utf8');
      expect(source, `${file} should use the shared result overlay`).toContain('this.drawResultOverlay(');
      expect(source, `${file} should use the shared restart action`).toContain('this.isRestartInput(');
      expect(source, `${file} should reset one-shot score reporting on restart`).toContain('this.resetScoreReport(');
    }
  });

  test('Vite owns production module loading and emits hashed assets', () => {
    const index = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const builtIndex = readFileSync(join(process.cwd(), 'dist/index.html'), 'utf8');

    expect(index).not.toContain('modulepreload');
    expect(index).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(builtIndex).toMatch(/<script type="module" crossorigin src="\/assets\/[^\"]+-[A-Za-z0-9_-]+\.js"><\/script>/);
    expect(builtIndex).toMatch(/<link rel="stylesheet" crossorigin href="\/assets\/[^\"]+-[A-Za-z0-9_-]+\.css">/);
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

    expect(straight.y).toBeGreaterThan(431);
    expect(straight.y).toBeLessThan(439);
    expect(straight.speed).toBeGreaterThan(45);
    expect(straight.speed).toBeLessThan(49);

    let cruising = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 180; i++) {
      cruising = updateParkingCar(cruising, { up: true, down: false, left: false, right: false }, 1 / 60);
    }

    expect(cruising.y).toBeGreaterThan(250);
    expect(cruising.y).toBeLessThan(270);
    expect(cruising.speed).toBeGreaterThan(128);
    expect(cruising.speed).toBeLessThanOrEqual(130);

    let car = createParkingCar(200, 460, -Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      car = updateParkingCar(car, { up: true, down: false, left: false, right: true }, 1 / 60);
    }

    expect(car.x).toBeGreaterThan(200.1);
    expect(car.x).toBeLessThan(201);
    expect(car.y).toBeGreaterThan(449);
    expect(car.y).toBeLessThan(457);
    expect(car.angle).toBeGreaterThan(-1.52);
    expect(car.angle).toBeLessThan(-1.42);

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
    expect(PARKING_FORWARD_ACCEL).toBeCloseTo(
      (100000 / 3600 / 8.5) * PARKING_PIXELS_PER_METER * PARKING_ACCEL_RESPONSE_MULTIPLIER,
      5
    );
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

  test('fy_iceworld is a closed, connected four-room arena', () => {
    expect(ICEBERG_MAP).toHaveLength(MAP_ROWS);
    for (const row of ICEBERG_MAP) {
      expect(row).toHaveLength(MAP_COLS);
    }

    // solid outer border
    for (let c = 0; c < MAP_COLS; c++) {
      expect(isSolidTile(c, 0)).toBe(true);
      expect(isSolidTile(c, MAP_ROWS - 1)).toBe(true);
    }
    for (let r = 0; r < MAP_ROWS; r++) {
      expect(isSolidTile(0, r)).toBe(true);
      expect(isSolidTile(MAP_COLS - 1, r)).toBe(true);
    }

    // the center 2x2 cross is open and is the buyzone
    for (let c = BUY_ZONE.col; c < BUY_ZONE.col + BUY_ZONE.cols; c++) {
      for (let r = BUY_ZONE.row; r < BUY_ZONE.row + BUY_ZONE.rows; r++) {
        expect(isWalkable(c, r)).toBe(true);
      }
    }
    const center = { x: (BUY_ZONE.col + 0.5) * TILE, y: (BUY_ZONE.row + 0.5) * TILE };
    expect(inBuyZone(center.x, center.y)).toBe(true);

    // CT spawns sit on the blue (left) half, T spawns on the red (right) half,
    // and every spawn has a valid weapon underneath it.
    expect(CT_SPAWNS.length).toBeGreaterThanOrEqual(6);
    expect(T_SPAWNS.length).toBeGreaterThanOrEqual(6);
    for (const point of CT_SPAWNS) {
      expect(point.x).toBeLessThan(MAP_COLS * TILE * 0.5);
      expect(isWalkable(Math.floor(point.x / TILE), Math.floor(point.y / TILE))).toBe(true);
      expect(WEAPONS[point.weapon]).toBeTruthy();
    }
    for (const point of T_SPAWNS) {
      expect(point.x).toBeGreaterThan(MAP_COLS * TILE * 0.5);
      expect(isWalkable(Math.floor(point.x / TILE), Math.floor(point.y / TILE))).toBe(true);
      expect(WEAPONS[point.weapon]).toBeTruthy();
    }
    for (const pickup of NADE_PICKUPS) {
      expect(isWalkable(Math.floor(pickup.x / TILE), Math.floor(pickup.y / TILE))).toBe(true);
    }

    // the map is fully connected: every CT spawn reaches every T spawn
    for (const ct of CT_SPAWNS) {
      for (const t of T_SPAWNS) {
        expect(findMapPath(ct.x, ct.y, t.x, t.y)).not.toBeNull();
      }
    }
  });

  test('chess legal moves preserve king safety and castling rules', async ({ page }) => {
    await page.goto('/#/chess');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const result = await page.evaluate(async (moduleUrl) => {
      const { ChessGame } = await import(moduleUrl);
      const game = new ChessGame() as any;
      const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));
      const noCastling = { w: { K: false, Q: false }, b: { K: false, Q: false } };

      const checkingBoard = emptyBoard();
      checkingBoard[7][4] = { type: 'K', color: 'w' };
      checkingBoard[0][4] = { type: 'K', color: 'b' };
      checkingBoard[2][0] = { type: 'R', color: 'w' };
      game.moveHistory = [];
      const checkingMoveAllowed = game.getLegalMoves(checkingBoard, 2, 0, noCastling)
        .some((move: { r: number; c: number }) => move.r === 2 && move.c === 4);

      const pinnedBoard = emptyBoard();
      pinnedBoard[7][4] = { type: 'K', color: 'w' };
      pinnedBoard[0][0] = { type: 'K', color: 'b' };
      pinnedBoard[0][4] = { type: 'R', color: 'b' };
      pinnedBoard[6][4] = { type: 'R', color: 'w' };
      const selfCheckMoveAllowed = game.getLegalMoves(pinnedBoard, 6, 4, noCastling)
        .some((move: { r: number; c: number }) => move.r === 6 && move.c === 3);

      const castleBoard = emptyBoard();
      castleBoard[7][4] = { type: 'K', color: 'w' };
      castleBoard[7][7] = { type: 'R', color: 'w' };
      castleBoard[0][0] = { type: 'K', color: 'b' };
      castleBoard[0][5] = { type: 'R', color: 'b' };
      const throughCheckCastleAllowed = game.getLegalMoves(
        castleBoard,
        7,
        4,
        { w: { K: true, Q: false }, b: { K: false, Q: false } }
      ).some((move: { flags?: string }) => move.flags === 'castleK');

      game.destroy();
      return { checkingMoveAllowed, selfCheckMoveAllowed, throughCheckCastleAllowed };
    }, builtModuleUrl('src/games/chess.ts'));

    expect(result).toEqual({
      checkingMoveAllowed: true,
      selfCheckMoveAllowed: false,
      throughCheckCastleAllowed: false,
    });
  });

  test('checkers enforces mandatory captures and multi-jumps', async ({ page }) => {
    await page.goto('/#/checkers');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const result = await page.evaluate(async (moduleUrl) => {
      const { CheckersGame } = await import(moduleUrl);
      const game = new CheckersGame() as any;
      game.board = Array.from({ length: 8 }, () => Array(8).fill(0));
      game.board[1][5] = 1;
      game.board[2][4] = 2;
      game.board[4][2] = 2;
      game.board[7][7] = 1;
      game.currentPlayer = 1;

      const allMoves = game.getAllMoves(1);
      const ordinaryMoveIncluded = allMoves.some((move: { captures: unknown[] }) => move.captures.length === 0);
      game.executeMove(allMoves.find((move: { fromC: number }) => move.fromC === 1));

      const outcome = {
        ordinaryMoveIncluded,
        currentPlayer: game.currentPlayer,
        selected: game.selected,
        continuationTargets: game.validMoves.map((move: { toC: number; toR: number }) => [move.toC, move.toR]),
      };
      game.destroy();
      return outcome;
    }, builtModuleUrl('src/games/checkers.ts'));

    expect(result.ordinaryMoveIncluded).toBe(false);
    expect(result.currentPlayer).toBe(1);
    expect(result.selected).toEqual({ c: 3, r: 3 });
    expect(result.continuationTargets).toContainEqual([5, 1]);
  });

  test('minesweeper protects the first reveal and keeps a continuous timer', async ({ page }) => {
    await page.goto('/#/minesweeper');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const result = await page.evaluate(async (moduleUrl) => {
      const { MinesweeperGame } = await import(moduleUrl);
      const game = new MinesweeperGame() as any;
      game.init();
      game.beginAt(4, 4);
      game.update(1);
      game.beginAt(0, 0);
      game.update(1);
      const safeArea = game.grid.slice(3, 6).flatMap((row: number[]) => row.slice(3, 6));
      const outcome = {
        firstCell: game.grid[4][4],
        safeAreaHasMine: safeArea.includes(-1),
        timer: game.timer,
      };
      game.destroy();
      return outcome;
    }, builtModuleUrl('src/games/minesweeper.ts'));

    expect(result.firstCell).toBeGreaterThanOrEqual(0);
    expect(result.safeAreaHasMine).toBe(false);
    expect(result.timer).toBeCloseTo(2, 5);
  });

  test('2048 can continue after reaching the winning tile', async ({ page }) => {
    await page.goto('/#/2048');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const hasWon = await page.evaluate(async (moduleUrl) => {
      const { Game2048 } = await import(moduleUrl);
      const game = new Game2048() as any;
      game.init();
      game.gameState = 'playing';
      game.hasWon = true;
      game.handleInput(new KeyboardEvent('keydown', { key: ' ' }));
      const result = game.hasWon;
      game.destroy();
      return result;
    }, builtModuleUrl('src/games/game2048.ts'));

    expect(hasWon).toBe(false);
  });

  test('Lucky Case recovers from an empty balance and supports an explicit reset', async ({ page }) => {
    await page.goto('/#/luckycase');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const result = await page.evaluate(async (moduleUrl) => {
      localStorage.setItem('luckycase', JSON.stringify({
        coins: 0,
        collection: [],
        totalOpens: 20,
        totalValue: 0,
      }));
      const { LuckyCaseGame } = await import(moduleUrl);
      const game = new LuckyCaseGame() as any;
      game.init();
      const recoveredCoins = game.save.coins;

      localStorage.setItem('luckycase', JSON.stringify({
        coins: 123,
        collection: [{ id: 'test', count: 1 }],
        totalOpens: 2,
        totalValue: 10,
      }));
      game.handleInput(new KeyboardEvent('keydown', { key: 'R', shiftKey: true }));
      const outcome = {
        recoveredCoins,
        resetCoins: game.save.coins,
        storageWasCleared: localStorage.getItem('luckycase') === null,
      };
      game.destroy();
      return outcome;
    }, builtModuleUrl('src/games/luckycase.ts'));

    expect(result).toEqual({
      recoveredCoins: 250,
      resetCoins: 5000,
      storageWasCleared: true,
    });
  });

  test('solitaire can select and move a face-up tableau sequence', async ({ page }) => {
    await page.goto('/#/solitaire');
    await expect(page.locator('#actionBtn')).toBeEnabled();

    const result = await page.evaluate(async (moduleUrl) => {
      const { SolitaireGame } = await import(moduleUrl);
      const game = new SolitaireGame() as any;
      game.init();
      game.phase = 'playing';
      game.tableau[0] = [
        { suit: 0, rank: 11, faceUp: true },
        { suit: 2, rank: 10, faceUp: true },
      ];
      game.tableau[1] = [{ suit: 2, rank: 12, faceUp: true }];
      game.handleClick({ type: 'tab', col: 0, index: 0 });
      game.handleClick({ type: 'tab', col: 1, index: 0 });
      const outcome = {
        foundations: game.foundations.length,
        sourceCount: game.tableau[0].length,
        destinationRanks: game.tableau[1].map((card: { rank: number }) => card.rank),
      };
      game.destroy();
      return outcome;
    }, builtModuleUrl('src/games/solitaire.ts'));

    expect(result).toEqual({
      foundations: 4,
      sourceCount: 0,
      destinationRanks: [12, 11, 10],
    });
  });

});

test('failed dynamic game loads show a retry path', async ({ page }) => {
  const parkingModule = builtModuleUrl('src/games/parking.ts');
  await page.route(`**${parkingModule}`, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#loadError')).toBeVisible();
  await expect(page.locator('#retryLoadBtn')).toBeVisible();
  await page.unroute(`**${parkingModule}`);
  await page.locator('#retryLoadBtn').click();
  await expect(page.locator('#actionBtn')).toBeEnabled();
  await expect(page.locator('#loadError')).toBeHidden();
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
    await expect(page.locator('.game-list-group-label')).toHaveText(['休闲', '动作', '益智', '棋牌']);
    await expect(page.locator('#librarySummary')).toHaveText('26 款游戏 · 4 个分类');

    const firstNameFontSize = await gameItems.first().locator('.game-list-name').evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    );
    expect(firstNameFontSize).toBeGreaterThanOrEqual(14);
  });

  test('prepare, first start, and restart initialize exactly once each', async ({ page }) => {
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
    await page.locator('#actionBtn').click();
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
    await page.locator('#actionBtn').click();
    await expect(canvas).toHaveAttribute('data-game-prepare-count', '2');
  });

  test('switching away cancels pending chess AI work', async ({ page }) => {
    const { pageErrors } = await collectErrors(page);
    await selectGame(page, 'chess');
    await startGame(page);
    const canvas = page.locator('#gameCanvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.78);
      await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.58);
    }
    await selectGame(page, 'snake');
    await page.waitForTimeout(700);
    expect(pageErrors).toEqual([]);
    await expect(page.locator('#gameTitle')).toHaveText('贪吃蛇');
  });

  test('category filters expose counts and narrow the visible library', async ({ page }) => {
    const filters = page.locator('.category-chip');
    await expect(filters).toHaveCount(5);
    await expect(filters.locator('.category-chip-count')).toHaveText(['26', '8', '6', '7', '5']);

    await page.locator('.category-chip[data-group="action"]').click();
    await expect(page.locator('.category-chip[data-group="action"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.game-list-group-label')).toHaveText(['动作']);
    await expect(page.locator('.game-list-item')).toHaveCount(6);
    await expect(page.locator('.game-list-item[data-id="iwanna"]')).toBeVisible();
    await expect(page.locator('.game-list-item[data-id="snake"]')).toHaveCount(0);

    await page.locator('.category-chip[data-group="all"]').click();
    await expect(page.locator('.game-list-item')).toHaveCount(26);
    await expect(page.locator('#selectedGameLabel')).toHaveText('休闲 / 停车');
  });

  test('desktop collapsed library stays usable and ignores the legacy cached state', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.evaluate(() => {
      localStorage.setItem('cg-sidebar-collapsed', '1');
      localStorage.removeItem('cg-sidebar-collapsed-desktop-v2');
    });
    await page.reload();

    await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#librarySummary')).toBeVisible();

    await page.evaluate(() => localStorage.setItem('cg-sidebar-collapsed-desktop-v2', '1'));
    await page.reload();

    await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#sidebarToggleBtn')).toBeVisible();
    await expect(page.locator('.game-list-name').first()).toBeHidden();
    await expect(page.locator('.game-list-icon').first()).toBeVisible();

    await page.locator('#sidebarToggleBtn').click();
    await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#librarySummary')).toBeVisible();
    await expect(page.locator('.game-list-name').first()).toBeVisible();
  });

  test('game canvas exposes an accessible name and live score', async ({ page }) => {
    await selectGame(page, 'snake');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('aria-label', '贪吃蛇游戏画布');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('tabindex', '0');
    await startGame(page);
    await expect(page.locator('#liveScore')).toHaveText('0');
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

    expect([...new Set(gameModules)]).toEqual(['parking.js']);
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
    test.setTimeout(90_000);
    for (const id of ALL_GAME_IDS) {
      await selectGame(page, id);
      await startGame(page);
      const renderStyle = await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.dataset.renderStyle);
      expect(renderStyle).toBe('minimal-hd');
      expect(await canvasColorCount(page)).toBeGreaterThanOrEqual(1);
    }
  });

  test('all games accept real touch events without page errors', async ({ page }) => {
    test.setTimeout(90_000);
    const { pageErrors } = await collectErrors(page);

    for (const id of ALL_GAME_IDS) {
      await selectGame(page, id);
      await startGame(page);
      await page.locator('#gameCanvas').evaluate((canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const touch = new Touch({
          identifier: 1,
          target: canvas,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          radiusX: 2,
          radiusY: 2,
        });
        canvas.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        }));
        canvas.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch],
        }));
      });
    }

    expect(pageErrors).toEqual([]);
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

  test('all 26 games are registered in the list', async ({ page }) => {
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
      const collapsed = await page.locator('body').evaluate((el) => el.classList.contains('sidebar-collapsed'));
      if (collapsed) {
        await page.locator('#sidebarToggle').click();
        await page.waitForTimeout(180);
      }
      const item = page.locator(`.game-list-item[data-id="${id}"]`);
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await expect(page.locator('#gameTitle')).toHaveText(idToNameZh[id]);
      await expect(page.locator('#actionBtn')).toHaveText('开始游戏');
      await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
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

    const bestRow = page.locator('#statsPanel .gic-record').filter({ hasText: '最高关卡' });
    await expect(bestRow.locator('.gic-value')).toHaveText('7');
    const migratedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-records') || '{}').parking);
    expect(migratedRecord).toBe(7);

    await page.evaluate(() => {
      localStorage.removeItem('carrick-parking-progress');
      localStorage.setItem('cg-records', JSON.stringify({ parking: 999 }));
    });
    await page.reload();
    await selectGame(page, 'parking');

    await expect(bestRow.locator('.gic-value')).toHaveText('0');
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
