import { BaseGame } from '../core/game.js';
import {
  PARKING_CAR_LENGTH,
  PARKING_CAR_WIDTH,
  PARKING_MIN_TURN_RADIUS,
  PARKING_MAX_FORWARD_SPEED,
  PARKING_MAX_STEER,
  PARKING_WHEEL_BASE,
  createParkingCar,
  updateParkingCar,
  type ParkingCarState,
} from './parkingPhysics.js';
import { buildParkingLevels } from './parkingLevels.js';

const GAME_W = 400;
const GAME_H = 520;
const CAR_W = PARKING_CAR_WIDTH;
const CAR_H = PARKING_CAR_LENGTH;

const STORAGE_KEY = 'carrick-parking-progress';

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParkingSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ParkingTechnique =
  | 'front-bay'
  | 'parallel-park'
  | 'bay-realign'
  | 'offset-gate'
  | 'alley-dock'
  | 'slalom-aisle'
  | 'precision-curb';

export interface Level {
  id: string;
  technique: ParkingTechnique;
  variant: number;
  playerStart: { x: number; y: number; angle: number };
  obstacles: Obstacle[];
  spot: ParkingSpot;
}

export interface ParkingDemoWaypoint {
  x: number;
  y: number;
}

export interface ParkingDemoPose {
  x: number;
  y: number;
  angle: number;
}

export interface ParkingDemoRoute {
  waypoints: ParkingDemoWaypoint[];
  poses: ParkingDemoPose[];
  finalAngle: number;
  arrivalAngle: number;
  length: number;
  clearance: number;
}

function wall(x: number, y: number, w: number, h: number): Obstacle {
  return { x, y, w, h };
}

function parkedCar(x: number, y: number, vertical = true): Obstacle {
  return vertical ? { x, y, w: 26, h: 44 } : { x, y, w: 44, h: 26 };
}

type ParkingCarPose = { x: number; y: number; angle: number };
type ParkingParkedPose = ParkingCarPose & { speed?: number };

function parkingCarCorners(car: ParkingCarPose): { x: number; y: number }[] {
  const renderAngle = car.angle + Math.PI / 2;
  const cos = Math.cos(renderAngle);
  const sin = Math.sin(renderAngle);
  const hw = CAR_W / 2;
  const hh = CAR_H / 2;
  const pts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return pts.map((p) => ({
    x: car.x + cos * p.x - sin * p.y,
    y: car.y + sin * p.x + cos * p.y,
  }));
}

function rectCorners(rect: Obstacle): { x: number; y: number }[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

function projectPolygon(
  points: { x: number; y: number }[],
  axis: { x: number; y: number }
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function polygonsOverlapOnAxes(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
  axes: { x: number; y: number }[]
): boolean {
  for (const axis of axes) {
    const pa = projectPolygon(a, axis);
    const pb = projectPolygon(b, axis);
    if (pa.max < pb.min || pb.max < pa.min) return false;
  }
  return true;
}

function carOverlapsRect(car: ParkingCarPose, rect: Obstacle): boolean {
  const carPts = parkingCarCorners(car);
  const rectPts = rectCorners(rect);
  const renderAngle = car.angle + Math.PI / 2;
  const cos = Math.cos(renderAngle);
  const sin = Math.sin(renderAngle);
  return polygonsOverlapOnAxes(carPts, rectPts, [
    { x: cos, y: sin },
    { x: -sin, y: cos },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]);
}

export function parkingCarCollides(level: Level, car: ParkingCarPose): boolean {
  return level.obstacles.some((obs) => carOverlapsRect(car, obs));
}

export function parkingCarIsParked(level: Level, car: ParkingParkedPose): boolean {
  const s = level.spot;
  const inSpotX = car.x > s.x + 6 && car.x < s.x + s.w - 6;
  const inSpotY = car.y > s.y + 8 && car.y < s.y + s.h - 8;
  const angleNorm = ((car.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const isHorizontalSpot = s.w > s.h;
  const angleOk = isHorizontalSpot
    ? (angleNorm < 0.4 || angleNorm > Math.PI * 2 - 0.4 || Math.abs(angleNorm - Math.PI) < 0.4)
    : (Math.abs(angleNorm - Math.PI / 2) < 0.35 || Math.abs(angleNorm - Math.PI * 3 / 2) < 0.35);
  return inSpotX && inSpotY && angleOk && Math.abs(car.speed ?? 0) < 35;
}

export const PARKING_LEVELS: Level[] = buildParkingLevels({
  gameW: GAME_W,
  gameH: GAME_H,
  wall,
  parkedCar,
});

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
    point.x > GAME_W - clearance ||
    point.y < clearance ||
    point.y > GAME_H - clearance
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
  const maxX = Math.floor(GAME_W / ROUTE_GRID);
  const maxY = Math.floor(GAME_H / ROUTE_GRID);
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
  const maxX = Math.floor(GAME_W / ROUTE_GRID);
  const maxY = Math.floor(GAME_H / ROUTE_GRID);
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

function normalizeAngle(angle: number): number {
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
    const delta = normalizeAngle(desiredAngles[i] - angles[i - 1]);
    angles[i] = angles[i - 1] + Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);
  }

  angles[angles.length - 1] = finalAngle;
  for (let i = angles.length - 2; i >= 0; i--) {
    const segmentLength = distance(samples[i], samples[i + 1]);
    const maxDelta = Math.max(0.03, (segmentLength / PARKING_MIN_TURN_RADIUS) * 1.05);
    const deltaToNext = normalizeAngle(angles[i] - angles[i + 1]);
    if (Math.abs(deltaToNext) > maxDelta) {
      angles[i] = angles[i + 1] + Math.sign(deltaToNext) * maxDelta;
    }
  }

  return samples.map((point, index) => {
    return {
      x: point.x,
      y: point.y,
      angle: angles[index],
    };
  });
}

function posesHaveDrivableCurvature(poses: ParkingDemoPose[]): boolean {
  for (let i = 1; i < poses.length; i++) {
    const prev = poses[i - 1];
    const pose = poses[i];
    const segmentLength = Math.hypot(pose.x - prev.x, pose.y - prev.y);
    const headingDelta = Math.abs(normalizeAngle(pose.angle - prev.angle));
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
  const startHeadingError = Math.abs(normalizeAngle(poses[0].angle - level.playerStart.angle));
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
    headingChange += Math.abs(normalizeAngle(route.poses[i].angle - route.poses[i - 1].angle));
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

export class ParkingGame extends BaseGame {
  private car: ParkingCarState = createParkingCar(0, 0, 0);
  private levelIndex = 0;
  private level!: Level;
  private parkedTime = 0;
  private gameState: 'menu' | 'playing' | 'parked' | 'crash' | 'complete' | 'demo' | 'demoComplete' = 'menu';
  private keys = { up: false, down: false, left: false, right: false };
  private touchDir: 'up' | 'down' | 'left' | 'right' | null = null;
  private mouseSteer: number | null = null;
  private mouseSteering = false;
  private demoRoute: ParkingDemoRoute | null = null;
  private demoTime = 0;

  private readonly PARK_TIME = 1.0;
  private readonly DEMO_SPEED = 92;
  private unlockedLevel = 0;
  private bestLevel = 0;
  private selectedLevel = 0;

  // Exposed for side panel
  readonly totalLevels = PARKING_LEVELS.length;
  get levelIndexEx(): number { return this.levelIndex; }
  get bestLevelEx(): number { return this.bestLevel; }
  get unlockedLevelEx(): number { return this.unlockedLevel; }
  get selectedLevelEx(): number { return this.selectedLevel; }
  get gameStateEx(): string { return this.gameState; }
  get speed(): number { return Math.abs(this.car.speed); }
  get maxSpeed(): number { return PARKING_MAX_FORWARD_SPEED; }
  get steerAngle(): number { return this.car.steerAngle; }
  get maxSteerAngle(): number { return PARKING_MAX_STEER; }
  get mouseSteeringActiveEx(): boolean { return this.mouseSteering; }
  get gear(): string {
    const s = this.car.speed;
    return s > 2 ? 'D' : s < -2 ? 'R' : 'N';
  }

  constructor() {
    super('gameCanvas', GAME_W, GAME_H);
  }

  init() {
    this.loadProgress();
    this.selectedLevel = Math.max(0, Math.min(this.selectedLevel, this.unlockedLevel, PARKING_LEVELS.length - 1));
    this.loadLevel(this.selectedLevel);
    this.gameState = 'menu';
  }

  start() {
    super.start();
    this.loadLevel(this.selectedLevel);
  }

  startDemo() {
    super.start();
    const route = createParkingDemoRoute(this.level);
    if (!route) {
      this.loadLevel(this.selectedLevel);
      return;
    }
    this.demoRoute = route;
    this.demoTime = 0;
    this.parkedTime = 0;
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.mouseSteer = null;
    this.mouseSteering = false;
    this.car = createParkingCar(route.poses[0].x, route.poses[0].y, route.poses[0].angle);
    this.gameState = 'demo';
  }

  /** Called from side panel to select a level in menu */
  selectLevel(index: number) {
    if (index < 0 || index >= PARKING_LEVELS.length) return;
    if (index > this.unlockedLevel) return;
    this.selectedLevel = index;
    this.loadLevel(index);
  }

  /** Called from side panel to select a level and enter menu mode */
  goToMenu() {
    this.gameState = 'menu';
    this.selectedLevel = Math.min(this.unlockedLevel, PARKING_LEVELS.length - 1);
    this.mouseSteer = null;
    this.mouseSteering = false;
  }

  private loadProgress() {
    const recordFallback = this.readParkingRecord();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const bestLevel = Number.isFinite(p.bestLevel) ? p.bestLevel : recordFallback;
        this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, bestLevel || 0));
        const unlocked = Number.isFinite(p.unlocked) ? p.unlocked : Math.max(0, this.bestLevel - 1);
        this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, unlocked || 0));
      } else {
        this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, recordFallback || 0));
        this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.max(0, this.bestLevel - 1)));
      }
    } catch {
      this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, recordFallback || 0));
      this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.max(0, this.bestLevel - 1)));
    }
    this.syncParkingRecord();
  }

  private readParkingRecord(): number {
    try {
      const raw = localStorage.getItem('cg-records');
      if (!raw) return 0;
      const records = JSON.parse(raw);
      const value = records?.parking;
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      if (value < 0 || value > PARKING_LEVELS.length) return 0;
      return Math.floor(value);
    } catch {
      return 0;
    }
  }

  private syncParkingRecord() {
    try {
      const raw = localStorage.getItem('cg-records');
      const parsed = raw ? JSON.parse(raw) : {};
      const records = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      records.parking = this.bestLevel;
      localStorage.setItem('cg-records', JSON.stringify(records));
    } catch {
      // Records are a convenience feature; storage failures should not break play.
    }
  }

  private saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        unlocked: this.unlockedLevel,
        bestLevel: this.bestLevel,
      }));
      this.syncParkingRecord();
    } catch {
      // ignore
    }
  }

  private loadLevel(idx: number) {
    this.levelIndex = idx;
    this.level = PARKING_LEVELS[idx];
    const start = this.level.playerStart;
    this.car = createParkingCar(start.x, start.y, start.angle);
    this.parkedTime = 0;
    this.demoRoute = null;
    this.demoTime = 0;
    this.gameState = 'playing';
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.mouseSteer = null;
    this.mouseSteering = false;
    this.resetScoreReport();
  }

  private checkCollisions(): boolean {
    return parkingCarCollides(this.level, this.car);
  }

  private checkParked(): boolean {
    return parkingCarIsParked(this.level, this.car);
  }

  private updateMouseSteerFromEvent(e: MouseEvent) {
    const point = this.canvasPoint(e.clientX, e.clientY);
    const raw = (point.x - GAME_W / 2) / (GAME_W * 0.34);
    const deadZone = 0.045;
    this.mouseSteer = Math.abs(raw) < deadZone ? 0 : Math.max(-1, Math.min(1, raw));
  }

  private updateDriving(dt: number) {
    const up = this.keys.up || this.touchDir === 'up';
    const down = this.keys.down || this.touchDir === 'down';
    const left = this.keys.left || this.touchDir === 'left';
    const right = this.keys.right || this.touchDir === 'right';
    const steer = this.mouseSteer ?? undefined;

    const oldCar = { ...this.car };
    this.car = updateParkingCar(this.car, { up, down, left, right, steer }, dt);

    if (this.checkCollisions()) {
      this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
      this.gameState = 'crash';
      this.submitScoreOnce(this.bestLevel);
      return;
    }

    if (this.checkParked() && Math.abs(this.car.speed) < 35) {
      this.gameState = 'parked';
      this.parkedTime = 0;
      this.car.speed = 0;
      this.car.vx = 0;
      this.car.vy = 0;
    }
  }

  private sampleDemoRoute(distance: number): { x: number; y: number; angle: number; steerAngle: number } {
    if (!this.demoRoute) {
      return { x: this.car.x, y: this.car.y, angle: this.car.angle, steerAngle: this.car.steerAngle };
    }

    const route = this.demoRoute.poses;
    let remaining = Math.max(0, Math.min(distance, this.demoRoute.length));
    for (let i = 1; i < route.length; i++) {
      const from = route[i - 1];
      const to = route[i];
      const segment = Math.hypot(to.x - from.x, to.y - from.y);
      if (remaining <= segment || i === route.length - 1) {
        const t = segment === 0 ? 1 : Math.max(0, Math.min(1, remaining / segment));
        const angle = from.angle + normalizeAngle(to.angle - from.angle) * t;
        const angleDelta = normalizeAngle(to.angle - from.angle);
        const steerAngle = segment > 0.5
          ? Math.max(-PARKING_MAX_STEER, Math.min(PARKING_MAX_STEER, Math.atan((angleDelta / segment) * PARKING_WHEEL_BASE)))
          : 0;
        return {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          angle,
          steerAngle,
        };
      }
      remaining -= segment;
    }

    const last = route[route.length - 1];
    return { x: last.x, y: last.y, angle: last.angle, steerAngle: 0 };
  }

  private updateDemo(dt: number) {
    if (!this.demoRoute) {
      this.gameState = 'menu';
      return;
    }

    this.demoTime += dt;
    const driveTime = this.demoRoute.length / this.DEMO_SPEED;
    if (this.demoTime < driveTime) {
      const pose = this.sampleDemoRoute(this.demoTime * this.DEMO_SPEED);
      this.car = {
        ...this.car,
        x: pose.x,
        y: pose.y,
        angle: pose.angle,
        speed: this.DEMO_SPEED,
        vx: Math.cos(pose.angle) * this.DEMO_SPEED,
        vy: Math.sin(pose.angle) * this.DEMO_SPEED,
        steerAngle: pose.steerAngle,
      };
      return;
    }

    const target = this.demoRoute.poses[this.demoRoute.poses.length - 1];
    this.car = {
      ...this.car,
      x: target.x,
      y: target.y,
      angle: target.angle,
      speed: 0,
      vx: 0,
      vy: 0,
      steerAngle: 0,
    };
    this.gameState = 'demoComplete';
  }

  update(dt: number) {
    if (this.gameState === 'demo') {
      this.updateDemo(dt);
      return;
    }

    if (this.gameState === 'crash' || this.gameState === 'complete' || this.gameState === 'demoComplete' || this.gameState === 'menu') {
      return;
    }

    if (this.gameState === 'parked') {
      const up = this.keys.up || this.touchDir === 'up';
      const down = this.keys.down || this.touchDir === 'down';
      const left = this.keys.left || this.touchDir === 'left';
      const right = this.keys.right || this.touchDir === 'right';
      const steer = this.mouseSteer ?? undefined;

      const oldCar = { ...this.car };
      this.car = updateParkingCar(this.car, { up, down, left, right, steer }, dt);

      if (this.checkCollisions()) {
        this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
        this.gameState = 'crash';
        this.submitScoreOnce(this.bestLevel);
        return;
      }

      if (!this.checkParked() || Math.abs(this.car.speed) >= 35) {
        this.gameState = 'playing';
        this.parkedTime = 0;
        return;
      }

      this.parkedTime += dt;
      if (this.parkedTime >= this.PARK_TIME) {
        this.gameState = 'complete';
        if (this.levelIndex + 1 > this.bestLevel) {
          this.bestLevel = this.levelIndex + 1;
        }
        if (this.levelIndex + 1 > this.unlockedLevel && this.levelIndex + 1 < PARKING_LEVELS.length) {
          this.unlockedLevel = this.levelIndex + 1;
        }
        this.saveProgress();
        this.submitScoreOnce(this.bestLevel);
        this.parkedTime = 0;
      }
      return;
    }

    this.updateDriving(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.canvas.dataset.parkingState = this.gameState;
    const isDark = this.isDarkTheme();
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const asphalt = isDark ? '#13161f' : '#e8e9ec';
    const text = isDark ? '#f8fafc' : '#0f172a';

    // Background - asphalt
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Asphalt texture - subtle speckles
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 137.5) % GAME_W);
      const sy = ((i * 73.3) % GAME_H);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // Parking lot lane lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let y = 60; y < GAME_H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(GAME_W - 12, y);
      ctx.stroke();
    }

    // Parking spot
    const sp = this.level.spot;
    // Spot fill with subtle primary tint
    ctx.fillStyle = isDark ? 'rgba(57,197,187,0.08)' : 'rgba(13,148,136,0.06)';
    ctx.fillRect(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4);

    // Spot border - dashed with rounded caps
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(sp.x + 1, sp.y + 1, sp.w - 2, sp.h - 2);
    ctx.setLineDash([]);

    // Target center dot
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Demo route
    if ((this.gameState === 'demo' || this.gameState === 'demoComplete') && this.demoRoute) {
      ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.42)' : 'rgba(13,148,136,0.35)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      this.demoRoute.poses.forEach((pose, index) => {
        if (index === 0) ctx.moveTo(pose.x, pose.y);
        else ctx.lineTo(pose.x, pose.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Obstacles
    for (const obs of this.level.obstacles) {
      const isCarLike = (obs.w < obs.h && obs.w > 20 && obs.h > 30) || (obs.w > obs.h && obs.h > 20 && obs.w > 30);
      if (isCarLike) {
        this.drawParkedCar(ctx, obs.x, obs.y, obs.w, obs.h, isDark);
      } else {
        // Wall / barrier
        ctx.fillStyle = isDark ? '#1f2937' : '#d1d5db';
        ctx.strokeStyle = isDark ? '#374151' : '#9ca3af';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 2);
        ctx.fill();
        ctx.stroke();

        // Wall detail lines
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.3);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.3);
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.6);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.6);
        ctx.stroke();
      }
    }

    // Player car
    ctx.save();
    ctx.translate(this.car.x, this.car.y);
    ctx.rotate(this.car.angle + Math.PI / 2);
    this.drawPlayerCar(ctx, isDark);
    ctx.restore();

    // Parked progress bar
    if (this.gameState === 'parked') {
      const prog = Math.min(1, this.parkedTime / this.PARK_TIME);
      const barY = sp.y + sp.h + 8;
      const barH = 5;
      // Track
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.roundRect(sp.x, barY, sp.w, barH, barH / 2);
      ctx.fill();
      // Fill
      ctx.fillStyle = primary;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(sp.x, barY, Math.max(barH, sp.w * prog), barH, barH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // Overlays
    if (this.gameState === 'crash') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '撞车！' : 'CRASH!',
        zh ? '空格/点击 重试  ·  M 菜单' : 'SPACE/TAP RETRY  ·  M MENU',
        '#ef4444'
      );
    }

    if (this.gameState === 'complete') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '停车成功！' : 'PARKED!',
        `${zh ? '关卡' : 'LEVEL'} ${this.levelIndex + 1}`,
        primary,
        zh ? '空格: 下一关  ·  R: 重玩  ·  M: 菜单' : 'SPACE: NEXT  ·  R: REPLAY  ·  M: MENU'
      );
    }

    if (this.gameState === 'demoComplete') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '示例完成' : 'DEMO COMPLETE',
        `${zh ? '关卡' : 'LEVEL'} ${this.levelIndex + 1}`,
        primary,
        zh ? '空格: 正式开始  ·  R: 重看  ·  M: 菜单' : 'SPACE: PLAY  ·  R: REPLAY DEMO  ·  M: MENU'
      );
    }
  }

  private drawParkedCar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isDark: boolean
  ) {
    const vertical = h > w;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (!vertical) ctx.rotate(Math.PI / 2);

    const bw = vertical ? w : h;
    const bh = vertical ? h : w;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Body
    ctx.fillStyle = isDark ? '#4b5563' : '#9ca3af';
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Roof / cabin
    ctx.fillStyle = isDark ? '#374151' : '#6b7280';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, -bh / 2 + 8, bw - 4, bh - 16, 2);
    ctx.fill();

    // Windshield / rear window
    ctx.fillStyle = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(209,213,219,0.45)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 3, -bh / 2 + 9, bw - 6, 5, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 3, bh / 2 - 13, bw - 6, 5, 1);
    ctx.fill();

    // Headlights
    ctx.fillStyle = 'rgba(253,224,71,0.7)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, -bh / 2 - 0.5, 4, 1.5, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bw / 2 - 6, -bh / 2 - 0.5, 4, 1.5, 0.5);
    ctx.fill();

    // Taillights
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, bh / 2 - 1, 4, 1.5, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bw / 2 - 6, bh / 2 - 1, 4, 1.5, 0.5);
    ctx.fill();

    ctx.restore();
  }

  private drawPlayerCar(ctx: CanvasRenderingContext2D, isDark: boolean) {
    const w = CAR_W;
    const h = CAR_H;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Body gradient for depth
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, -h / 2);
    if (isDark) {
      grad.addColorStop(0, '#e2e8f0');
      grad.addColorStop(0.5, '#f8fafc');
      grad.addColorStop(1, '#e2e8f0');
    } else {
      grad.addColorStop(0, '#0f766e');
      grad.addColorStop(0.5, '#14b8a6');
      grad.addColorStop(1, '#0f766e');
    }

    // Main body
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 4);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Cabin / roof
    ctx.fillStyle = isDark ? '#0ea5e9' : '#0d9488';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 3, -h / 2 + 10, w - 6, h - 20, 3);
    ctx.fill();

    // Windshield (front)
    ctx.fillStyle = isDark ? 'rgba(186,230,253,0.55)' : 'rgba(204,251,241,0.55)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 4, -h / 2 + 11, w - 8, 5, 2);
    ctx.fill();

    // Rear window
    ctx.fillStyle = isDark ? 'rgba(186,230,253,0.45)' : 'rgba(204,251,241,0.45)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 4, h / 2 - 15, w - 8, 5, 2);
    ctx.fill();

    // Side mirrors
    ctx.fillStyle = isDark ? '#cbd5e1' : '#115e59';
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 2, -h / 2 + 12, 2.5, 4, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 0.5, -h / 2 + 12, 2.5, 4, 1);
    ctx.fill();

    // Headlights with glow
    ctx.fillStyle = isDark ? 'rgba(254,240,138,0.95)' : 'rgba(253,224,71,0.95)';
    ctx.shadowColor = 'rgba(253,224,71,0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, -h / 2 - 1, 5, 2, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 7, -h / 2 - 1, 5, 2, 1);
    ctx.fill();

    // Taillights with glow
    ctx.fillStyle = 'rgba(239,68,68,0.95)';
    ctx.shadowColor = 'rgba(239,68,68,0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, h / 2 - 1, 5, 2, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 7, h / 2 - 1, 5, 2, 1);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Side stripe detail
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, -h / 2 + 26, 2, h - 34, 1);
    ctx.fill();

    // Wheels
    const drawWheel = (wx: number, wy: number, steer: boolean) => {
      ctx.save();
      ctx.translate(wx, wy);
      if (steer) ctx.rotate(this.car.steerAngle);
      // Tire
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-2.5, -5.5, 5, 11, 2);
      ctx.fill();
      // Rim
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(-1.5, -3.5, 3, 7, 1);
      ctx.fill();
      ctx.restore();
    };
    const frontWheelY = -PARKING_WHEEL_BASE / 2;
    const rearWheelY = PARKING_WHEEL_BASE / 2;
    drawWheel(-w / 2 - 2.5, frontWheelY, true);
    drawWheel(w / 2 + 2.5, frontWheelY, true);
    drawWheel(-w / 2 - 2.5, rearWheelY, false);
    drawWheel(w / 2 + 2.5, rearWheelY, false);
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    isDark: boolean,
    title: string,
    subtitle: string,
    accent: string,
    hint?: string
  ) {
    // Backdrop
    ctx.fillStyle = isDark ? 'rgba(11,15,25,0.82)' : 'rgba(248,250,252,0.88)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Card panel
    const cardW = 280;
    const cardH = hint ? 130 : 100;
    const cardX = (GAME_W - cardW) / 2;
    const cardY = (GAME_H - cardH) / 2;

    ctx.fillStyle = isDark ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.fill();

    ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.25)' : 'rgba(13,148,136,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    // Title
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, GAME_W / 2, cardY + 36);

    // Subtitle
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '15px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(subtitle, GAME_W / 2, cardY + 68);

    // Hint
    if (hint) {
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(hint, GAME_W / 2, cardY + 96);
    }
  }



  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === ' ' || e.key === 'm' || e.key === 'M' || e.key === 'r' || e.key === 'R' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }

      if (e.type === 'keydown' && !e.repeat) {
        if (this.gameState === 'crash') {
          if (e.key === ' ') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
        if (this.gameState === 'complete') {
          if (e.key === ' ') {
            if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
            else this.loadLevel(this.levelIndex);
            return;
          }
          if (e.key === 'r' || e.key === 'R') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
        if (this.gameState === 'demoComplete') {
          if (e.key === ' ') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'r' || e.key === 'R') { this.startDemo(); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
      }

      if (e.type === 'keydown') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = true;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = true;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
      } else {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = false;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = false;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart' || e.type === 'touchmove') {
        const t = e.touches[0];
        if (!t) return;
        const { x: cx, y: cy } = this.canvasPoint(t.clientX, t.clientY);

        if (cx < GAME_W) {
          if (cy < GAME_H * 0.35) this.touchDir = 'up';
          else if (cy > GAME_H * 0.65) this.touchDir = 'down';
          else if (cx < GAME_W * 0.4) this.touchDir = 'left';
          else if (cx > GAME_W * 0.6) this.touchDir = 'right';
          else this.touchDir = null;
        } else {
          this.touchDir = null;
        }

        if (e.type === 'touchstart') {
          if (this.gameState === 'crash') {
            this.loadLevel(this.levelIndex);
          }
          if (this.gameState === 'complete') {
            if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
          }
          if (this.gameState === 'demoComplete') {
            this.loadLevel(this.levelIndex);
          }
        }
      }
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        this.touchDir = null;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mouseup') {
        this.mouseSteering = false;
        this.mouseSteer = null;
        return;
      }

      if (e.type === 'mousemove') {
        if (this.mouseSteering) {
          e.preventDefault();
          this.updateMouseSteerFromEvent(e);
        }
        return;
      }

      if (e.type === 'mousedown') {
        if (this.gameState === 'crash') {
          this.loadLevel(this.levelIndex);
          return;
        }
        if (this.gameState === 'complete') {
          if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
          return;
        }
        if (this.gameState === 'demoComplete') {
          this.loadLevel(this.levelIndex);
          return;
        }
        if (this.gameState === 'playing' || this.gameState === 'parked') {
          e.preventDefault();
          this.mouseSteering = true;
          this.updateMouseSteerFromEvent(e);
        }
      }
    }
  }
}
