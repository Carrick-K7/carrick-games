import { test, expect } from '@playwright/test';
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
} from '../src/parkingPhysics';
import {
  PARKING_LEVELS,
  createParkingDemoRoute,
  parkingCarCollides,
  parkingCarIsParked,
  parkingRouteIsClear,
} from '../src/parking';
import { collectErrors, selectGame, startGame, openOverflow } from '../../../tests/support/gameplay';

function normalizeRadians(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

if (!process.env.GAME_ID || process.env.GAME_ID === 'parking') {
  test.describe('Game rules', () => {
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
  });

  test.describe('Carrick Games - Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/parking');
      await page.waitForTimeout(300);
    });

    test('parking first start enters a drivable state for arrow keys', async ({ page }) => {
      await selectGame(page, 'parking');
      await startGame(page);
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowUp');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-parking-state', 'playing');
    });

    test('parking keeps telemetry in the canvas instead of shell dashboards', async ({ page }) => {
      await selectGame(page, 'parking');
      await startGame(page);
      await expect(page.locator('#ds-speed-val')).toHaveCount(0);
      await expect(page.locator('.ds-time')).toHaveCount(0);
      await expect(page.locator('.level-picker > summary')).toBeHidden();
      await openOverflow(page);
      await expect(page.locator('.level-picker > summary')).toBeVisible();
    });

    test('parking best record is completed level count and migrates stale score records', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('cg-records', JSON.stringify({ parking: 999 }));
        localStorage.setItem('carrick-parking-progress', JSON.stringify({ unlocked: 6, bestLevel: 7 }));
      });
      await page.reload();

      await selectGame(page, 'parking');

      const bestValue = page.locator('#statsPanel .level-picker-meta');
      await expect(bestValue).toHaveText('最佳 7');
      const migratedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-records') || '{}').parking);
      expect(migratedRecord).toBe(7);

      await page.evaluate(() => {
        localStorage.removeItem('carrick-parking-progress');
        localStorage.setItem('cg-records', JSON.stringify({ parking: 999 }));
      });
      await page.reload();
      await selectGame(page, 'parking');

      await expect(bestValue).toHaveText('最佳 0');
      const discardedStaleRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-records') || '{}').parking);
      expect(discardedStaleRecord).toBe(0);
    });

    test('parking mouse steering works without a permanent shell instrument', async ({ page }) => {
      const { pageErrors } = await collectErrors(page);
      await selectGame(page, 'parking');
      await startGame(page);
      await expect(page.locator('#parkingSteeringWheel')).toHaveCount(0);
      const box = await page.locator('#gameCanvas').boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      await page.mouse.move(box.x + box.width * 0.86, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.waitForTimeout(350);
      await page.mouse.up();
      expect(pageErrors).toEqual([]);
    });

    test('parking demo completes without unlocking the next level', async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('carrick-parking-progress'));
      await page.reload();

      await selectGame(page, 'parking');
      const secondLevel = page.locator('.level-cell[data-level="1"]');
      await expect(secondLevel).toHaveClass(/locked/);

      await openOverflow(page);
      await expect(page.locator('#demoBtn')).toBeVisible();
      await page.locator('#demoBtn').click();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
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
      await openOverflow(page);
      await page.locator('.level-picker > summary').click();
      await page.locator('.level-cell[data-level="10"]').click();

      await openOverflow(page);
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
}
