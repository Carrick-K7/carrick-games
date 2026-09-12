import type { Level, Obstacle, ParkingSpot, ParkingTechnique } from './parkingTypes.js';

type ParkingPose = { x: number; y: number; angle: number };

interface ParkingLevelDeps {
  gameW: number;
  gameH: number;
  wall: (x: number, y: number, w: number, h: number) => Obstacle;
  parkedCar: (x: number, y: number, vertical?: boolean) => Obstacle;
}

const VERTICAL_SPOT = { w: 52, h: 82 };
const PARALLEL_SPOT = { w: 86, h: 52 };
const ANGLED_SPOT = { w: 64, h: 68 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a: Obstacle, b: ParkingSpot, margin: number): boolean {
  return !(
    a.x + a.w < b.x - margin ||
    b.x + b.w + margin < a.x ||
    a.y + a.h < b.y - margin ||
    b.y + b.h + margin < a.y
  );
}

function addIfClear(obstacles: Obstacle[], obstacle: Obstacle, spot: ParkingSpot, margin = 10) {
  if (!rectsOverlap(obstacle, spot, margin)) {
    obstacles.push(obstacle);
  }
}

function boundaryWalls(deps: ParkingLevelDeps): Obstacle[] {
  return [
    deps.wall(10, 10, deps.gameW - 20, 12),
    deps.wall(10, deps.gameH - 22, deps.gameW - 20, 12),
    deps.wall(10, 10, 12, deps.gameH - 20),
    deps.wall(deps.gameW - 22, 10, 12, deps.gameH - 20),
  ];
}

function makeLevel(
  deps: ParkingLevelDeps,
  id: string,
  technique: ParkingTechnique,
  variant: number,
  playerStart: ParkingPose,
  spot: ParkingSpot,
  extras: Obstacle[],
  targetAngle?: number,
): Level {
  const level: Level = {
    id,
    technique,
    variant,
    playerStart,
    spot,
    obstacles: [...boundaryWalls(deps), ...extras],
  };
  if (targetAngle !== undefined) level.targetAngle = targetAngle;
  return level;
}

function parkedRow(deps: ParkingLevelDeps, y: number, xs: number[], spot: ParkingSpot): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const x of xs) {
    addIfClear(obstacles, deps.parkedCar(x, y), spot, 16);
  }
  return obstacles;
}

// ─── 1. Front-in Bay Top (Levels 1–10) ──────────────────────────────────────
// Straightforward forward-entry into top-row vertical bays.

function frontBayTop(deps: ParkingLevelDeps, i: number): Level {
  const spotX = [36, 78, 120, 162, 204, 246, 288, 58, 144, 230][i];
  const startX = [200, 92, 314, 146, 256, 112, 288, 174, 228, 332][i];
  const spot = { x: spotX, y: 46 + (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y + 2, [36, 84, 132, 180, 228, 276, 324], spot);

  // Mid‑field obstacles in later levels
  if (i >= 3) {
    const offsets = [
      () => { addIfClear(extras, deps.wall(44, 270, 82, 8), spot); addIfClear(extras, deps.wall(278, 318, 58, 8), spot); },
      () => { addIfClear(extras, deps.parkedCar(58, 262), spot); addIfClear(extras, deps.parkedCar(314, 318), spot); },
      () => { addIfClear(extras, deps.wall(118, 246, 8, 72), spot); addIfClear(extras, deps.wall(336, 184, 8, 76), spot); },
    ];
    offsets[i % 3]();
    if (i >= 7) {
      addIfClear(extras, deps.parkedCar(180, 320 + (i % 3) * 14), spot);
    }
  }

  return makeLevel(deps, `front-bay-top-${i + 1}`, 'front-bay-top', i + 1, {
    x: startX, y: 462, angle: -Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

// ─── 2. Front-in Bay Bottom (Levels 11–20) ──────────────────────────────────

function frontBayBottom(deps: ParkingLevelDeps, i: number): Level {
  const spotX = [52, 96, 140, 184, 228, 272, 316, 74, 162, 250][i];
  const startX = [204, 318, 86, 260, 126, 300, 164, 236, 104, 344][i];
  const spot = { x: spotX, y: deps.gameH - 128 - (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y - 2, [36, 84, 132, 180, 228, 276, 324], spot);

  if (i >= 3) {
    const offsets = [
      () => { addIfClear(extras, deps.wall(58, 194, 74, 8), spot); addIfClear(extras, deps.wall(260, 254, 82, 8), spot); },
      () => { addIfClear(extras, deps.parkedCar(58, 188), spot); addIfClear(extras, deps.parkedCar(306, 254), spot); },
      () => { addIfClear(extras, deps.wall(126, 198, 8, 84), spot); addIfClear(extras, deps.wall(336, 274, 8, 76), spot); },
    ];
    offsets[i % 3]();
    if (i >= 7) {
      addIfClear(extras, deps.parkedCar(190, 210 + (i % 3) * 16), spot);
    }
  }

  return makeLevel(deps, `front-bay-bottom-${i + 1}`, 'front-bay-bottom', i + 11, {
    x: startX, y: 58, angle: Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

// ─── 3. Reverse Bay Top (Levels 21–30) ─────────────────────────────────────
// Same structure as front-bay-top but with obstacles shifted to create a
// narrower approach. Player starts below heading up.

function reverseBayTop(deps: ParkingLevelDeps, i: number): Level {
  const spotX = [62, 106, 150, 194, 238, 282, 326, 84, 168, 252][i];
  const startX = [204, 92, 314, 146, 256, 112, 288, 174, 228, 332][(i + 3) % 10];
  const spot = { x: spotX, y: 46 + (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y + 2, [36, 84, 132, 180, 228, 276, 324], spot);

  // Narrowing side obstacles — parked cars instead of walls for cleaner routing
  if (i >= 3) {
    const leftX = Math.max(24, spot.x - 30 - (i % 3) * 8);
    const rightX = Math.min(deps.gameW - 54, spot.x + spot.w + (i % 3) * 6);
    addIfClear(extras, deps.parkedCar(leftX, 220 + (i % 4) * 28), spot);
    addIfClear(extras, deps.parkedCar(rightX, 270 + (i % 3) * 24), spot);
  }
  if (i >= 7) {
    addIfClear(extras, deps.parkedCar(200 + (i % 3) * 30, 340), spot);
  }

  return makeLevel(deps, `reverse-bay-top-${i + 1}`, 'reverse-bay-top', i + 21, {
    x: startX,
    y: 462,
    angle: -Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

// ─── 4. Reverse Bay Bottom (Levels 31–40) ──────────────────────────────────

function reverseBayBottom(deps: ParkingLevelDeps, i: number): Level {
  const spotX = [52, 96, 140, 184, 228, 272, 316, 74, 162, 250][i];
  const startX = [204, 318, 86, 260, 126, 300, 164, 236, 104, 344][(i + 3) % 10];
  const spot = { x: spotX, y: deps.gameH - 128 - (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y - 2, [36, 84, 132, 180, 228, 276, 324], spot);

  if (i >= 3) {
    const leftX = Math.max(24, spot.x - 30 - (i % 3) * 8);
    const rightX = Math.min(deps.gameW - 54, spot.x + spot.w + (i % 3) * 6);
    addIfClear(extras, deps.parkedCar(leftX, deps.gameH - 280 + (i % 4) * 28), spot);
    addIfClear(extras, deps.parkedCar(rightX, deps.gameH - 320 + (i % 3) * 24), spot);
  }
  if (i >= 7) {
    addIfClear(extras, deps.parkedCar(190 + (i % 3) * 30, deps.gameH - 360), spot);
  }

  return makeLevel(deps, `reverse-bay-bottom-${i + 1}`, 'reverse-bay-bottom', i + 31, {
    x: startX,
    y: 58,
    angle: Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

// ─── 5. Parallel Right (Levels 41–50) ──────────────────────────────────────
// Standard forward parallel parking along the right wall.

function parallelRight(deps: ParkingLevelDeps, i: number): Level {
  const yPos: number[] = [];
  for (let n = 0; n < 10; n++) {
    yPos.push(70 + n * 42 + (n % 3) * 6);
  }
  const spotY = yPos[i];
  const spot = { x: deps.gameW - 26 - PARALLEL_SPOT.w - (i % 2) * 6, y: spotY, ...PARALLEL_SPOT };
  const extras: Obstacle[] = [];

  // Cars fore and aft
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.max(34, spot.y - 44), false), spot, 8);
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.min(deps.gameH - 58, spot.y + spot.h + 22), false), spot, 8);

  // Mid‑field diversions
  if (i >= 4) {
    addIfClear(extras, deps.wall(120 + (i % 3) * 40, 140 + (i % 4) * 42, 8, 56), spot);
  }
  if (i >= 7) {
    addIfClear(extras, deps.parkedCar(80 + (i % 3) * 50, 300 + (i % 2) * 30), spot);
  }

  return makeLevel(deps, `parallel-right-${i + 1}`, 'parallel-right', i + 41, {
    x: 58 + (i % 3) * 10,
    y: clamp(spot.y + spot.h / 2 + ((i % 3) - 1) * 28, 58, deps.gameH - 58),
    angle: -(i % 3) * 0.06,
  }, spot, extras);
}

// ─── 6. Reverse Parallel Right (Levels 51–60) ───────────────────────────────
// Classic driving‑test parallel: pull alongside, then reverse into a right‑side
// spot. Player starts left of the spot, facing right.

function reverseParallelRight(deps: ParkingLevelDeps, i: number): Level {
  const ys: number[] = [];
  for (let n = 0; n < 10; n++) {
    ys.push(80 + n * 40 + (n % 2) * 8);
  }
  const spotY = ys[i];
  const spot = { x: deps.gameW - 26 - PARALLEL_SPOT.w - (i % 2) * 4, y: spotY, ...PARALLEL_SPOT };
  const extras: Obstacle[] = [];

  // Tight fore‑and‑aft parked cars
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.max(34, spot.y - 46), false), spot, 6);
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.min(deps.gameH - 58, spot.y + spot.h + 24), false), spot, 6);

  // Light mid‑field diversion — positioned to not block the approach corridor
  addIfClear(extras, deps.parkedCar(140 + (i % 4) * 30, 180 + (i % 6) * 28), spot);

  return makeLevel(deps, `reverse-parallel-right-${i + 1}`, 'reverse-parallel-right', i + 51, {
    x: 50 + (i % 4) * 14,
    y: clamp(spot.y + spot.h / 2 + ((i % 2 === 0 ? -12 : 12)), 60, deps.gameH - 60),
    angle: (i % 3 - 1) * 0.05,
  }, spot, extras);
}

// ─── 7. Angled Bay (Levels 61–70) ──────────────────────────────────────────
// 45‑degree angled spots along the right wall (classic shopping‑mall lot).
// targetAngle = π/4 means the car points down‑right when parked.

function angledBay(deps: ParkingLevelDeps, i: number): Level {
  const ys: number[] = [];
  for (let n = 0; n < 10; n++) {
    ys.push(50 + n * 42 + (n % 3) * 4);
  }
  const spotY = ys[i];
  const spot = { x: deps.gameW - 32 - ANGLED_SPOT.w, y: spotY + (i % 2) * 5, ...ANGLED_SPOT };
  const extras: Obstacle[] = [];

  // Adjacent angled spots approximated with axis‑aligned parked‑car rects
  const gap = 54;
  for (const oy of [spotY - gap, spotY + gap]) {
    if (oy > 30 && oy < deps.gameH - 30) {
      addIfClear(extras, deps.parkedCar(spot.x + 4, oy, false), spot, 10);
    }
  }

  // Light mid‑field obstacle — far enough from approach to not interfere
  addIfClear(extras, deps.wall(80, spot.y + spot.h / 2 + 60 + (i % 2) * 20, 60 + (i % 3) * 12, 6), spot);

  return makeLevel(deps, `angled-bay-${i + 1}`, 'angled-bay', i + 61, {
    x: 50 + (i % 4) * 10,
    y: spot.y + spot.h / 2 + (i % 3 - 1) * 16,
    angle: -(i % 3) * 0.05,
  }, spot, extras, Math.PI / 4);
}

// ─── 8. Tight Garage (Levels 71–80) ────────────────────────────────────────
// Spot flanked by narrow obstacles — simulates a tight enclosure while keeping
// the approach corridor wide enough for the demo‑route pathfinder.

function tightGarage(deps: ParkingLevelDeps, i: number): Level {
  const spotXs = [48, 108, 176, 244, 312, 58, 126, 194, 262, 330];
  const spotYs = [46, 46, 46, 46, 46, 386, 386, 386, 386, 386];
  const openTop = i < 5;

  const spotX = clamp(spotXs[i], 30, deps.gameW - VERTICAL_SPOT.w - 30);
  const spotY = spotYs[i];
  const spot = { x: spotX, y: spotY, ...VERTICAL_SPOT };
  const extras: Obstacle[] = [];

  // Two side pillars (parked cars, not full walls)
  addIfClear(extras, deps.parkedCar(spot.x - 28, spot.y + 4), spot, 10);
  addIfClear(extras, deps.parkedCar(spot.x + spot.w + 4, spot.y + 4), spot, 10);

  // Rear / front wall
  if (openTop) {
    addIfClear(extras, deps.wall(spot.x - 14, spot.y + spot.h + 8, spot.w + 28, 10), spot);
  } else {
    addIfClear(extras, deps.wall(spot.x - 14, spot.y - 18, spot.w + 28, 10), spot);
  }

  // Extra obstacle — far enough from spot to always be added
  if (i >= 3) {
    addIfClear(extras, deps.parkedCar(spot.x + spot.w / 2 + 30 + (i % 3) * 16,
      openTop ? spot.y + spot.h + 40 : spot.y - 58), spot);
  }

  const sx = clamp(spot.x + spot.w / 2 + (openTop ? 0 : 10), 60, deps.gameW - 60);
  const sy = clamp(openTop ? spot.y + spot.h + 60 : spot.y - 60, 60, deps.gameH - 60);
  const sa = openTop ? -Math.PI / 2 : Math.PI / 2;

  return makeLevel(deps, `tight-garage-${i + 1}`, 'tight-garage', i + 71, {
    x: sx,
    y: sy,
    angle: sa + (i % 5 - 2) * 0.05,
  }, spot, extras);
}

// ─── 9. Alley Weave (Levels 81–90) ─────────────────────────────────────────
// Two horizontal bars placed on alternating sides so the approach corridor
// is always clear. Start points left of centre start on the left, right start
// on the right.

function alleyWeave(deps: ParkingLevelDeps, i: number): Level {
  const spotX = [288, 58, 168, 248, 128, 248, 58, 288, 168, 118][i];
  const spot = { x: spotX, y: 46 + (i % 2) * 6, ...VERTICAL_SPOT };
  const extras: Obstacle[] = [];

  const rowCars = parkedRow(deps, spot.y + 2, [36, 84, 132, 180, 228, 276, 324], spot);
  for (const c of rowCars) extras.push(c);

  // Walls on the side opposite to the spot for a clear approach corridor
  const barY1 = 190 + (i % 4) * 14;
  const barY2 = 340 - (i % 3) * 12;

  if (spotX < 200) {
    addIfClear(extras, deps.wall(250, barY1, 135, 8), spot);
    addIfClear(extras, deps.wall(220, barY2, 160, 8), spot);
  } else {
    addIfClear(extras, deps.wall(30, barY1, 110, 8), spot);
    addIfClear(extras, deps.wall(40, barY2, 140, 8), spot);
  }

  if (i >= 5) {
    addIfClear(extras, deps.parkedCar(190, 270 + (i % 2) * 16), spot);
  }

  const startXs = [320, 58, 300, 58, 310, 60, 320, 58, 310, 60];
  const startAngles = [
    -Math.PI * 0.50, -Math.PI * 0.44, -Math.PI * 0.48, -Math.PI * 0.45,
    -Math.PI * 0.50, -Math.PI * 0.44, -Math.PI * 0.50, -Math.PI * 0.44,
    -Math.PI * 0.48, -Math.PI * 0.45,
  ];

  return makeLevel(deps, `alley-weave-${i + 1}`, 'alley-weave', i + 81, {
    x: startXs[i],
    y: 462,
    angle: startAngles[i],
  }, spot, extras);
}

// ─── 10. Precision Curb (Levels 91–100) ─────────────────────────────────────
// Tight parallel parking on the left and right curbside with minimal fore‑and‑
// aft clearance. Tests fine control.

function precisionCurb(deps: ParkingLevelDeps, i: number): Level {
  const left = i % 2 === 0;
  const ys: number[] = [];
  for (let n = 0; n < 5; n++) {
    ys.push(80 + n * 80 + (n % 2) * 12);
    ys.push(110 + n * 80 + (n % 2) * 14);
  }
  const spotY = ys[i];
  const spot = {
    x: left ? 26 + (i % 3) * 4 : deps.gameW - 26 - PARALLEL_SPOT.w - (i % 3) * 4,
    y: spotY,
    ...PARALLEL_SPOT,
  };
  const extras: Obstacle[] = [];

  // Very tight fore‑and‑aft parked cars (minimal margin)
  const frontY = Math.max(34, spot.y - 46 - (i % 4));
  const rearY = Math.min(deps.gameH - 58, spot.y + spot.h + 22 + (i % 3));
  addIfClear(extras, deps.parkedCar(spot.x + (left ? 0 : 42), frontY, false), spot, 6);
  addIfClear(extras, deps.parkedCar(spot.x + (left ? 0 : 42), rearY, false), spot, 6);

  // Additional obstacles that narrow the approach
  if (i >= 3) {
    addIfClear(extras, deps.wall(160, 120 + (i % 4) * 60, 80, 8), spot);
  }
  if (i >= 6) {
    addIfClear(extras, deps.wall(140 + (i % 3) * 30, 280 + (i % 2) * 40, 8, 60), spot);
  }

  return makeLevel(deps, `precision-curb-${i + 1}`, 'precision-curb', i + 91, {
    x: left ? 344 : 56,
    y: clamp(spot.y + spot.h / 2 + ((i % 3) - 1) * 20, 58, deps.gameH - 58),
    angle: left ? Math.PI + (i % 3 - 1) * 0.06 : (i % 3 - 1) * 0.06,
  }, spot, extras);
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function buildParkingLevels(deps: ParkingLevelDeps): Level[] {
  const builders = [
    frontBayTop,
    frontBayBottom,
    reverseBayTop,
    reverseBayBottom,
    parallelRight,
    reverseParallelRight,
    angledBay,
    tightGarage,
    alleyWeave,
    precisionCurb,
  ];

  return builders.flatMap((builder) => {
    const levels: Level[] = [];
    for (let i = 0; i < 10; i++) {
      levels.push(builder(deps, i));
    }
    return levels;
  });
}
