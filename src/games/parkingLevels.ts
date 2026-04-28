import type { Level, Obstacle, ParkingSpot, ParkingTechnique } from './parking.js';

type ParkingPose = { x: number; y: number; angle: number };

interface ParkingLevelDeps {
  gameW: number;
  gameH: number;
  wall: (x: number, y: number, w: number, h: number) => Obstacle;
  parkedCar: (x: number, y: number, vertical?: boolean) => Obstacle;
}

const VERTICAL_SPOT = { w: 52, h: 82 };
const PARALLEL_SPOT = { w: 86, h: 52 };

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
  extras: Obstacle[]
): Level {
  return {
    id,
    technique,
    variant,
    playerStart,
    spot,
    obstacles: [...boundaryWalls(deps), ...extras],
  };
}

function parkedRow(deps: ParkingLevelDeps, y: number, xs: number[], spot: ParkingSpot): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const x of xs) {
    addIfClear(obstacles, deps.parkedCar(x, y), spot, 16);
  }
  return obstacles;
}

function frontBayTop(deps: ParkingLevelDeps, i: number): Level {
  const spotXs = [36, 78, 120, 162, 204, 246, 288, 58, 144, 230];
  const startXs = [200, 92, 314, 146, 256, 112, 288, 174, 228, 332];
  const spot = { x: spotXs[i], y: 46 + (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y + 2, [36, 84, 132, 180, 228, 276, 324], spot);

  if (i % 3 === 0) {
    addIfClear(extras, deps.wall(44, 270, 82, 8), spot);
    addIfClear(extras, deps.wall(278, 318, 58, 8), spot);
  } else if (i % 3 === 1) {
    addIfClear(extras, deps.parkedCar(58, 262), spot);
    addIfClear(extras, deps.parkedCar(314, 318), spot);
  } else {
    addIfClear(extras, deps.wall(118, 246, 8, 72), spot);
    addIfClear(extras, deps.wall(336, 184, 8, 76), spot);
  }

  return makeLevel(deps, `front-bay-top-${i + 1}`, 'front-bay', i + 1, {
    x: startXs[i],
    y: 462,
    angle: -Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

function frontBayBottom(deps: ParkingLevelDeps, i: number): Level {
  const spotXs = [52, 96, 140, 184, 228, 272, 316, 74, 162, 250];
  const startXs = [204, 318, 86, 260, 126, 300, 164, 236, 104, 344];
  const spot = { x: spotXs[i], y: deps.gameH - 126 - (i % 2) * 8, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y - 2, [36, 84, 132, 180, 228, 276, 324], spot);

  if (i % 3 === 0) {
    addIfClear(extras, deps.wall(58, 194, 74, 8), spot);
    addIfClear(extras, deps.wall(260, 254, 82, 8), spot);
  } else if (i % 3 === 1) {
    addIfClear(extras, deps.parkedCar(58, 188), spot);
    addIfClear(extras, deps.parkedCar(306, 254), spot);
  } else {
    addIfClear(extras, deps.wall(126, 198, 8, 84), spot);
    addIfClear(extras, deps.wall(336, 274, 8, 76), spot);
  }

  return makeLevel(deps, `front-bay-bottom-${i + 1}`, 'front-bay', i + 11, {
    x: startXs[i],
    y: 58,
    angle: Math.PI / 2 + (i % 3 - 1) * 0.04,
  }, spot, extras);
}

function parallelLeft(deps: ParkingLevelDeps, i: number): Level {
  const ys = [70, 112, 154, 196, 238, 280, 322, 364, 406, 252];
  const spot = { x: 24 + (i % 2) * 6, y: ys[i], ...PARALLEL_SPOT };
  const extras: Obstacle[] = [];
  addIfClear(extras, deps.parkedCar(spot.x, Math.max(34, spot.y - 44), false), spot, 8);
  addIfClear(extras, deps.parkedCar(spot.x, Math.min(deps.gameH - 58, spot.y + spot.h + 22), false), spot, 8);
  addIfClear(extras, deps.wall(252 + (i % 3) * 18, 126 + (i % 4) * 62, 8, 74), spot);

  return makeLevel(deps, `parallel-left-${i + 1}`, 'parallel-park', i + 21, {
    x: 342,
    y: clamp(spot.y + spot.h / 2 + ((i % 3) - 1) * 30, 58, deps.gameH - 58),
    angle: Math.PI,
  }, spot, extras);
}

function parallelRight(deps: ParkingLevelDeps, i: number): Level {
  const ys = [76, 118, 160, 202, 244, 286, 328, 370, 412, 258];
  const spot = { x: deps.gameW - 24 - PARALLEL_SPOT.w - (i % 2) * 6, y: ys[i], ...PARALLEL_SPOT };
  const extras: Obstacle[] = [];
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.max(34, spot.y - 44), false), spot, 8);
  addIfClear(extras, deps.parkedCar(spot.x + 42, Math.min(deps.gameH - 58, spot.y + spot.h + 22), false), spot, 8);
  addIfClear(extras, deps.wall(118 - (i % 3) * 16, 118 + (i % 4) * 66, 8, 80), spot);

  return makeLevel(deps, `parallel-right-${i + 1}`, 'parallel-park', i + 31, {
    x: 58,
    y: clamp(spot.y + spot.h / 2 + ((i % 3) - 1) * 30, 58, deps.gameH - 58),
    angle: 0,
  }, spot, extras);
}

function centerBay(deps: ParkingLevelDeps, i: number): Level {
  const xs = [78, 120, 162, 204, 246, 98, 140, 182, 224, 266];
  const ys = [192, 226, 260, 212, 246, 184, 272, 202, 236, 266];
  const spot = { x: xs[i], y: ys[i], ...VERTICAL_SPOT };
  const extras: Obstacle[] = [];
  addIfClear(extras, deps.parkedCar(spot.x - 42, spot.y + 4), spot);
  addIfClear(extras, deps.parkedCar(spot.x + spot.w + 18, spot.y + 4), spot);
  addIfClear(extras, deps.wall(38, 132 + (i % 3) * 24, 92, 8), spot);
  addIfClear(extras, deps.wall(270, 350 - (i % 3) * 28, 84, 8), spot);

  const fromBottom = i % 2 === 0;
  return makeLevel(deps, `center-bay-${i + 1}`, 'bay-realign', i + 41, {
    x: [72, 328, 118, 282, 198][i % 5],
    y: fromBottom ? 462 : 58,
    angle: fromBottom ? -Math.PI / 2 : Math.PI / 2,
  }, spot, extras);
}

function offsetGateTop(deps: ParkingLevelDeps, i: number): Level {
  const spotXs = [42, 82, 122, 162, 202, 242, 282, 62, 148, 234];
  const spot = { x: spotXs[i], y: 46 + (i % 2) * 6, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y + 2, [36, 84, 132, 180, 228, 276, 324], spot);
  const offset = (i % 4) * 14;
  addIfClear(extras, deps.wall(78 + offset, 192, 8, 58), spot);
  addIfClear(extras, deps.wall(300 - offset, 306, 8, 58), spot);

  return makeLevel(deps, `offset-gate-top-${i + 1}`, 'offset-gate', i + 51, {
    x: [204, 330, 70, 252, 118][i % 5],
    y: 462,
    angle: -Math.PI / 2,
  }, spot, extras);
}

function offsetGateBottom(deps: ParkingLevelDeps, i: number): Level {
  const spotXs = [54, 96, 138, 180, 222, 264, 306, 72, 156, 240];
  const spot = { x: spotXs[i], y: deps.gameH - 128 - (i % 2) * 6, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y - 2, [36, 84, 132, 180, 228, 276, 324], spot);
  const offset = (i % 4) * 14;
  addIfClear(extras, deps.wall(42, 286, 8, 58), spot);
  addIfClear(extras, deps.wall(326 - offset, 154, 8, 58), spot);

  return makeLevel(deps, `offset-gate-bottom-${i + 1}`, 'offset-gate', i + 61, {
    x: [198, 64, 334, 142, 278][i % 5],
    y: 58,
    angle: Math.PI / 2,
  }, spot, extras);
}

function alleyDock(deps: ParkingLevelDeps, i: number): Level {
  const xs = [48, 88, 128, 168, 208, 248, 94, 142, 190, 238];
  const spot = { x: xs[i], y: deps.gameH - 128 - (i % 2) * 8, ...VERTICAL_SPOT };
  const extras: Obstacle[] = [];
  addIfClear(extras, deps.wall(spot.x - 24, spot.y - 88, 8, 76), spot, 4);
  addIfClear(extras, deps.wall(spot.x + spot.w + 16, spot.y - 88, 8, 76), spot, 4);
  addIfClear(extras, deps.parkedCar(34, 170 + (i % 3) * 46), spot);
  addIfClear(extras, deps.parkedCar(330, 152 + (i % 4) * 42), spot);

  return makeLevel(deps, `alley-dock-${i + 1}`, 'alley-dock', i + 71, {
    x: [196, 88, 312, 142, 256][i % 5],
    y: 58,
    angle: Math.PI / 2,
  }, spot, extras);
}

function slalomAisle(deps: ParkingLevelDeps, i: number): Level {
  const top = i % 2 === 0;
  const spotX = [64, 112, 160, 208, 256][i % 5];
  const spot = { x: spotX, y: top ? 46 : deps.gameH - 128, ...VERTICAL_SPOT };
  const extras = parkedRow(deps, spot.y + (top ? 2 : -2), [36, 84, 132, 180, 228, 276, 324], spot);
  const shift = (i % 5) * 8;
  addIfClear(extras, deps.parkedCar(140 + shift / 2, 214), spot);
  addIfClear(extras, deps.parkedCar(300 - shift / 2, 264), spot);

  return makeLevel(deps, `slalom-aisle-${i + 1}`, 'slalom-aisle', i + 81, {
    x: [204, 326, 72, 266, 132][i % 5],
    y: top ? 462 : 58,
    angle: top ? -Math.PI / 2 : Math.PI / 2,
  }, spot, extras);
}

function precisionCurb(deps: ParkingLevelDeps, i: number): Level {
  const left = i % 2 === 0;
  const ys = [112, 132, 180, 228, 276, 324, 372, 220, 156, 300];
  const spot = {
    x: left ? 26 : deps.gameW - 26 - PARALLEL_SPOT.w,
    y: ys[i],
    ...PARALLEL_SPOT,
  };
  const extras: Obstacle[] = [];
  addIfClear(extras, deps.parkedCar(spot.x + (left ? 0 : 42), Math.max(34, spot.y - 48), false), spot, 8);
  addIfClear(extras, deps.parkedCar(spot.x + (left ? 0 : 42), Math.min(deps.gameH - 58, spot.y + spot.h + 24), false), spot, 8);
  addIfClear(extras, deps.wall(168, 114 + (i % 4) * 64, 64, 8), spot);
  addIfClear(extras, deps.wall(184 + (i % 3) * 18, 218, 8, 78), spot);

  return makeLevel(deps, `precision-curb-${i + 1}`, 'precision-curb', i + 91, {
    x: left ? 342 : 58,
    y: clamp(spot.y + spot.h / 2 + ((i % 3) - 1) * 24, 58, deps.gameH - 58),
    angle: left ? Math.PI : 0,
  }, spot, extras);
}

export function buildParkingLevels(deps: ParkingLevelDeps): Level[] {
  const builders = [
    frontBayTop,
    frontBayBottom,
    parallelLeft,
    parallelRight,
    centerBay,
    offsetGateTop,
    offsetGateBottom,
    alleyDock,
    slalomAisle,
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
