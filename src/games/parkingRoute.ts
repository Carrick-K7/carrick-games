import {
  PARKING_GAME_HEIGHT,
  PARKING_GAME_WIDTH,
} from './parkingConstants.js';
import { parkingCarCollides, parkingCarIsParked } from './parkingGeometry.js';
import {
  PARKING_MAX_STEER,
  PARKING_MIN_TURN_RADIUS,
  PARKING_WHEEL_BASE,
} from './parkingPhysics.js';
import type {
  Level,
  ParkingDemoPose,
  ParkingDemoRoute,
  ParkingDemoWaypoint,
} from './parkingTypes.js';

const ROUTE_GRID = 10;
const ROUTE_CLEARANCES = [18, 14, 10, 6];
const FINAL_APPROACH_DISTANCE = 72;
const DEMO_SAMPLE_STEP = 6;
const DEMO_CORNER_MARGIN = 4;
const DEMO_TURN_RADIUS = PARKING_MIN_TURN_RADIUS + 2;

function parkingSpotCenter(level: Level): ParkingDemoWaypoint {
  return {
    x: level.spot.x + level.spot.w / 2,
    y: level.spot.y + level.spot.h / 2,
  };
}

function routeLength(waypoints: ParkingDemoWaypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
  }
  return total;
}

function parkingSpotAngles(level: Level): number[] {
  if (typeof level.targetAngle === 'number' && Number.isFinite(level.targetAngle)) {
    return [level.targetAngle];
  }
  return level.spot.w > level.spot.h ? [0, Math.PI] : [-Math.PI / 2, Math.PI / 2];
}

function parkingFinalApproaches(level: Level): { approach: ParkingDemoWaypoint; finalAngle: number }[] {
  const goal = parkingSpotCenter(level);
  return parkingSpotAngles(level).map((finalAngle) => ({
    finalAngle,
    approach: {
      x: goal.x - Math.cos(finalAngle) * FINAL_APPROACH_DISTANCE,
      y: goal.y - Math.sin(finalAngle) * FINAL_APPROACH_DISTANCE,
    },
  }));
}

function isPointBlocked(level: Level, point: ParkingDemoWaypoint, clearance: number): boolean {
  if (
    point.x < clearance ||
    point.x > PARKING_GAME_WIDTH - clearance ||
    point.y < clearance ||
    point.y > PARKING_GAME_HEIGHT - clearance
  ) {
    return true;
  }

  return level.obstacles.some((obs) =>
    point.x >= obs.x - clearance &&
    point.x <= obs.x + obs.w + clearance &&
    point.y >= obs.y - clearance &&
    point.y <= obs.y + obs.h + clearance
  );
}

function isSegmentBlocked(
  level: Level,
  from: ParkingDemoWaypoint,
  to: ParkingDemoWaypoint,
  clearance: number
): boolean {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / (ROUTE_GRID / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    if (isPointBlocked(level, point, clearance)) return true;
  }
  return false;
}

function gridKey(x: number, y: number): string {
  return `${x},${y}`;
}

function gridPoint(x: number, y: number): ParkingDemoWaypoint {
  return { x: x * ROUTE_GRID, y: y * ROUTE_GRID };
}

function nearestOpenGrid(level: Level, point: ParkingDemoWaypoint, clearance: number): string | null {
  const maxX = Math.floor(PARKING_GAME_WIDTH / ROUTE_GRID);
  const maxY = Math.floor(PARKING_GAME_HEIGHT / ROUTE_GRID);
  const sx = Math.max(0, Math.min(maxX, Math.round(point.x / ROUTE_GRID)));
  const sy = Math.max(0, Math.min(maxY, Math.round(point.y / ROUTE_GRID)));
  const maxRadius = Math.max(maxX, maxY);

  for (let radius = 0; radius <= maxRadius; radius++) {
    const candidates: { key: string; dist: number }[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const gx = sx + dx;
        const gy = sy + dy;
        if (gx < 0 || gx > maxX || gy < 0 || gy > maxY) continue;
        const p = gridPoint(gx, gy);
        if (!isPointBlocked(level, p, clearance)) {
          candidates.push({ key: gridKey(gx, gy), dist: Math.hypot(p.x - point.x, p.y - point.y) });
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0].key;
    }
  }

  return null;
}

function findGridRoute(
  level: Level,
  start: ParkingDemoWaypoint,
  goal: ParkingDemoWaypoint,
  clearance: number
): ParkingDemoWaypoint[] | null {
  const maxX = Math.floor(PARKING_GAME_WIDTH / ROUTE_GRID);
  const maxY = Math.floor(PARKING_GAME_HEIGHT / ROUTE_GRID);
  const startKey = nearestOpenGrid(level, start, clearance);
  const goalKey = nearestOpenGrid(level, goal, clearance);
  if (!startKey || !goalKey) return null;

  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const goalPoint = (() => {
    const [gx, gy] = goalKey.split(',').map(Number);
    return gridPoint(gx, gy);
  })();
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  while (open.size > 0) {
    let current = '';
    let currentScore = Infinity;
    for (const key of open) {
      const [gx, gy] = key.split(',').map(Number);
      const p = gridPoint(gx, gy);
      const score = (gScore.get(key) ?? Infinity) + Math.hypot(goalPoint.x - p.x, goalPoint.y - p.y);
      if (score < currentScore) {
        current = key;
        currentScore = score;
      }
    }

    if (current === goalKey) {
      const nodes: ParkingDemoWaypoint[] = [];
      let key = current;
      while (key) {
        const [gx, gy] = key.split(',').map(Number);
        nodes.push(gridPoint(gx, gy));
        const prev = cameFrom.get(key);
        if (!prev) break;
        key = prev;
      }
      return nodes.reverse();
    }

    open.delete(current);
    const [cx, cy] = current.split(',').map(Number);
    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > maxX || ny < 0 || ny > maxY) continue;
      const nextPoint = gridPoint(nx, ny);
      if (isPointBlocked(level, nextPoint, clearance)) continue;
      const currentPoint = gridPoint(cx, cy);
      if (isSegmentBlocked(level, currentPoint, nextPoint, clearance)) continue;

      const nextKey = gridKey(nx, ny);
      const moveCost = Math.hypot(dx, dy) * ROUTE_GRID;
      const tentative = (gScore.get(current) ?? Infinity) + moveCost;
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current);
        gScore.set(nextKey, tentative);
        open.add(nextKey);
      }
    }
  }

  return null;
}

function simplifyRoute(level: Level, route: ParkingDemoWaypoint[], clearance: number): ParkingDemoWaypoint[] {
  if (route.length <= 2) return route;
  const simplified: ParkingDemoWaypoint[] = [route[0]];
  let anchor = 0;
  while (anchor < route.length - 1) {
    let next = route.length - 1;
    while (next > anchor + 1 && isSegmentBlocked(level, route[anchor], route[next], clearance)) {
      next--;
    }
    simplified.push(route[next]);
    anchor = next;
  }
  return simplified;
}

function compactRoute(route: ParkingDemoWaypoint[]): ParkingDemoWaypoint[] {
  const compact: ParkingDemoWaypoint[] = [];
  for (const point of route) {
    const prev = compact[compact.length - 1];
    if (!prev || Math.hypot(prev.x - point.x, prev.y - point.y) > 1) {
      compact.push(point);
    }
  }
  return compact;
}

export function normalizeParkingAngle(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function distance(a: ParkingDemoWaypoint, b: ParkingDemoWaypoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pushRoutePoint(points: ParkingDemoWaypoint[], point: ParkingDemoWaypoint) {
  const prev = points[points.length - 1];
  if (!prev || distance(prev, point) > 0.5) {
    points.push(point);
  }
}

function appendLineSamples(
  points: ParkingDemoWaypoint[],
  from: ParkingDemoWaypoint,
  to: ParkingDemoWaypoint
) {
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / DEMO_SAMPLE_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pushRoutePoint(points, {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
  }
}

function appendQuadraticSamples(
  points: ParkingDemoWaypoint[],
  from: ParkingDemoWaypoint,
  control: ParkingDemoWaypoint,
  to: ParkingDemoWaypoint
) {
  const approxLength = distance(from, control) + distance(control, to);
  const steps = Math.max(4, Math.ceil(approxLength / DEMO_SAMPLE_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    pushRoutePoint(points, {
      x: inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
      y: inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y,
    });
  }
}

function smoothRoutePoints(route: ParkingDemoWaypoint[]): ParkingDemoWaypoint[] | null {
  if (route.length < 2) return null;
  const samples: ParkingDemoWaypoint[] = [route[0]];
  let cursor = route[0];

  for (let i = 1; i < route.length - 1; i++) {
    const prev = route[i - 1];
    const corner = route[i];
    const next = route[i + 1];
    const incomingLength = distance(prev, corner);
    const outgoingLength = distance(corner, next);
    if (incomingLength < 1 || outgoingLength < 1) continue;

    const inDir = {
      x: (corner.x - prev.x) / incomingLength,
      y: (corner.y - prev.y) / incomingLength,
    };
    const outDir = {
      x: (next.x - corner.x) / outgoingLength,
      y: (next.y - corner.y) / outgoingLength,
    };
    const dot = Math.max(-1, Math.min(1, inDir.x * outDir.x + inDir.y * outDir.y));
    const turnAngle = Math.acos(dot);
    if (turnAngle < 0.04) continue;

    const tanHalf = Math.tan(turnAngle / 2);
    if (!Number.isFinite(tanHalf) || tanHalf <= 0.001) return null;

    const minimumTrim = PARKING_MIN_TURN_RADIUS * tanHalf;
    const availableTrim = Math.min(
      incomingLength - DEMO_CORNER_MARGIN,
      outgoingLength - DEMO_CORNER_MARGIN
    );
    if (availableTrim < minimumTrim) return null;

    const trim = Math.min(DEMO_TURN_RADIUS * tanHalf, availableTrim);
    const enter = {
      x: corner.x - inDir.x * trim,
      y: corner.y - inDir.y * trim,
    };
    const exit = {
      x: corner.x + outDir.x * trim,
      y: corner.y + outDir.y * trim,
    };

    appendLineSamples(samples, cursor, enter);
    appendQuadraticSamples(samples, enter, corner, exit);
    cursor = exit;
  }

  appendLineSamples(samples, cursor, route[route.length - 1]);
  return samples;
}

function routePosesFromSamples(
  samples: ParkingDemoWaypoint[],
  startAngle: number,
  finalAngle: number
): ParkingDemoPose[] {
  const desiredAngles = samples.map((point, index) => {
    if (index === samples.length - 1) return finalAngle;
    const next = samples[Math.min(index + 1, samples.length - 1)];
    const prev = samples[Math.max(index - 1, 0)];
    return Math.atan2(next.y - prev.y, next.x - prev.x);
  });

  const angles = [...desiredAngles];
  angles[0] = startAngle;
  for (let i = 1; i < angles.length; i++) {
    const segmentLength = distance(samples[i - 1], samples[i]);
    const maxDelta = Math.max(0.03, (segmentLength / PARKING_MIN_TURN_RADIUS) * 1.05);
    const delta = normalizeParkingAngle(desiredAngles[i] - angles[i - 1]);
    angles[i] = angles[i - 1] + Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);
  }

  angles[angles.length - 1] = finalAngle;
  for (let i = angles.length - 2; i >= 0; i--) {
    const segmentLength = distance(samples[i], samples[i + 1]);
    const maxDelta = Math.max(0.03, (segmentLength / PARKING_MIN_TURN_RADIUS) * 1.05);
    const deltaToNext = normalizeParkingAngle(angles[i] - angles[i + 1]);
    if (Math.abs(deltaToNext) > maxDelta) {
      angles[i] = angles[i + 1] + Math.sign(deltaToNext) * maxDelta;
    }
  }

  return samples.map((point, index) => ({
    x: point.x,
    y: point.y,
    angle: angles[index],
  }));
}

function posesHaveDrivableCurvature(poses: ParkingDemoPose[]): boolean {
  for (let i = 1; i < poses.length; i++) {
    const prev = poses[i - 1];
    const pose = poses[i];
    const segmentLength = Math.hypot(pose.x - prev.x, pose.y - prev.y);
    const headingDelta = Math.abs(normalizeParkingAngle(pose.angle - prev.angle));
    if (segmentLength > 0.5 && headingDelta / segmentLength > 1.15 / PARKING_MIN_TURN_RADIUS) {
      return false;
    }
  }
  return true;
}

function createSmoothParkingRoute(
  level: Level,
  waypoints: ParkingDemoWaypoint[],
  finalAngle: number,
  clearance: number
): ParkingDemoRoute | null {
  const samples = smoothRoutePoints(waypoints);
  if (!samples || samples.length < 2) return null;

  const poses = routePosesFromSamples(samples, level.playerStart.angle, finalAngle);
  const startHeadingError = Math.abs(normalizeParkingAngle(poses[0].angle - level.playerStart.angle));
  if (startHeadingError > 0.65) return null;
  if (!posesHaveDrivableCurvature(poses)) return null;
  if (poses.some((pose) => parkingCarCollides(level, pose))) return null;

  const finalPose = poses[poses.length - 1];
  if (!parkingCarIsParked(level, { ...finalPose, speed: 0 })) return null;

  return {
    waypoints,
    poses,
    finalAngle,
    arrivalAngle: finalAngle,
    length: routeLength(samples),
    clearance,
  };
}

function routeScore(route: ParkingDemoRoute): number {
  let headingChange = 0;
  for (let i = 1; i < route.poses.length; i++) {
    headingChange += Math.abs(normalizeParkingAngle(route.poses[i].angle - route.poses[i - 1].angle));
  }
  return route.length + headingChange * 24 - route.clearance * 1.5;
}

const demoRouteCache = new WeakMap<Level, ParkingDemoRoute | null>();

export function parkingRouteIsClear(level: Level, route: ParkingDemoRoute): boolean {
  if (route.waypoints.length < 2) return false;
  if (route.poses.length > 0) {
    return route.poses.every((pose) => !parkingCarCollides(level, pose));
  }
  for (let i = 1; i < route.waypoints.length; i++) {
    if (isSegmentBlocked(level, route.waypoints[i - 1], route.waypoints[i], route.clearance)) {
      return false;
    }
  }
  return true;
}

export function createParkingDemoRoute(level: Level): ParkingDemoRoute | null {
  if (demoRouteCache.has(level)) {
    return demoRouteCache.get(level) ?? null;
  }

  const start = { x: level.playerStart.x, y: level.playerStart.y };
  const goal = parkingSpotCenter(level);
  let bestRoute: ParkingDemoRoute | null = null;
  let bestScore = Infinity;

  for (const clearance of ROUTE_CLEARANCES) {
    for (const { approach, finalAngle } of parkingFinalApproaches(level)) {
      if (isPointBlocked(level, approach, clearance)) continue;
      if (isSegmentBlocked(level, approach, goal, clearance)) continue;

      const gridRoute = findGridRoute(level, start, approach, clearance);
      if (!gridRoute) continue;

      const rawRoute = compactRoute([start, ...gridRoute, approach]);
      const routeToApproach = simplifyRoute(level, rawRoute, clearance);
      const waypoints = compactRoute([...routeToApproach, goal]);
      if (waypoints.length < 2) continue;
      const route = createSmoothParkingRoute(level, waypoints, finalAngle, clearance);
      if (!route || !parkingRouteIsClear(level, route)) continue;
      const score = routeScore(route);
      if (score < bestScore) {
        bestRoute = route;
        bestScore = score;
      }
    }
  }

  demoRouteCache.set(level, bestRoute);
  return bestRoute;
}
