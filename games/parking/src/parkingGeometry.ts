import {
  PARKING_CAR_LENGTH,
  PARKING_CAR_WIDTH,
} from './parkingPhysics.js';
import type { Level, Obstacle, ParkingSpot } from './parkingTypes.js';

const CAR_W = PARKING_CAR_WIDTH;
const CAR_H = PARKING_CAR_LENGTH;
const PARKING_SPOT_FOOTPRINT_MARGIN = 2;

type ParkingCarPose = { x: number; y: number; angle: number };
type ParkingParkedPose = ParkingCarPose & { speed?: number };

export function parkingCarCorners(car: ParkingCarPose): { x: number; y: number }[] {
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

export function parkingCarIsWithinSpot(
  spot: ParkingSpot,
  car: ParkingCarPose,
  margin = PARKING_SPOT_FOOTPRINT_MARGIN
): boolean {
  return parkingCarCorners(car).every((corner) =>
    corner.x >= spot.x + margin &&
    corner.x <= spot.x + spot.w - margin &&
    corner.y >= spot.y + margin &&
    corner.y <= spot.y + spot.h - margin
  );
}

export function parkingCarIsParked(level: Level, car: ParkingParkedPose): boolean {
  const angleNorm = ((car.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  let angleOk: boolean;
  if (typeof level.targetAngle === 'number' && Number.isFinite(level.targetAngle)) {
    const target = ((level.targetAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let diff = Math.abs(angleNorm - target);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    angleOk = diff < 0.45;
  } else {
    const isHorizontalSpot = level.spot.w > level.spot.h;
    angleOk = isHorizontalSpot
      ? (angleNorm < 0.4 || angleNorm > Math.PI * 2 - 0.4 || Math.abs(angleNorm - Math.PI) < 0.4)
      : (Math.abs(angleNorm - Math.PI / 2) < 0.35 || Math.abs(angleNorm - Math.PI * 3 / 2) < 0.35);
  }

  return parkingCarIsWithinSpot(level.spot, car) && angleOk && Math.abs(car.speed ?? 0) < 35;
}
