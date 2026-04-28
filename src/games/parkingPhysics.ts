export interface ParkingCarState {
  x: number;
  y: number;
  angle: number;
  speed: number;
  vx: number;
  vy: number;
  steerAngle: number;
}

export interface ParkingDriveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  steer?: number;
}

const TANK500_LENGTH_MM = 5078;
const TANK500_WIDTH_MM = 1934;
const TANK500_WHEELBASE_MM = 2850;
const TANK500_TURNING_RADIUS_MM = 5600;
const TANK500_ZERO_TO_100_KMH_SECONDS = 8.5;
const KMH_100_IN_METERS_PER_SECOND = 100000 / 3600;

export const PARKING_CAR_LENGTH = 50;
export const PARKING_PIXELS_PER_METER = PARKING_CAR_LENGTH / (TANK500_LENGTH_MM / 1000);
export const PARKING_CAR_WIDTH = PARKING_CAR_LENGTH * (TANK500_WIDTH_MM / TANK500_LENGTH_MM);
export const PARKING_WHEEL_BASE = PARKING_CAR_LENGTH * (TANK500_WHEELBASE_MM / TANK500_LENGTH_MM);
export const PARKING_MIN_TURN_RADIUS = PARKING_CAR_LENGTH * (TANK500_TURNING_RADIUS_MM / TANK500_LENGTH_MM);
export const PARKING_MAX_STEER = Math.atan(PARKING_WHEEL_BASE / PARKING_MIN_TURN_RADIUS);
export const PARKING_FORWARD_ACCEL =
  (KMH_100_IN_METERS_PER_SECOND / TANK500_ZERO_TO_100_KMH_SECONDS) * PARKING_PIXELS_PER_METER;
const STEER_RATE = 8.0;
const STEER_RETURN_RATE = 9.0;
export const PARKING_MAX_FORWARD_SPEED = 200;
const MAX_REVERSE_SPEED = 90;
const REVERSE_ACCEL = PARKING_FORWARD_ACCEL * 0.65;
const BRAKE_DECEL = 720;
const COAST_DRAG = 4.5;
const STOP_SPEED = 2.0;

export function createParkingCar(x: number, y: number, angle: number): ParkingCarState {
  return {
    x,
    y,
    angle,
    speed: 0,
    vx: 0,
    vy: 0,
    steerAngle: 0,
  };
}

export function updateParkingCar(
  car: ParkingCarState,
  input: ParkingDriveInput,
  dt: number
): ParkingCarState {
  let speed = car.speed;

  if (input.up) {
    speed += PARKING_FORWARD_ACCEL * dt;
  }

  if (input.down) {
    if (speed > 8) {
      speed -= BRAKE_DECEL * dt;
    } else {
      speed -= REVERSE_ACCEL * dt;
    }
  }

  // Slight inertia: coast to a stop quickly instead of instantly
  if (!input.up && !input.down) {
    speed *= Math.exp(-COAST_DRAG * dt);
    if (Math.abs(speed) < STOP_SPEED) speed = 0;
  }

  speed = Math.max(-MAX_REVERSE_SPEED, Math.min(PARKING_MAX_FORWARD_SPEED, speed));

  const steerInput = typeof input.steer === 'number' && Number.isFinite(input.steer)
    ? Math.max(-1, Math.min(1, input.steer))
    : input.left === input.right
      ? 0
      : input.left
        ? -1
        : 1;
  const steerTarget = steerInput * PARKING_MAX_STEER;
  const steerRate = steerTarget === 0 ? STEER_RETURN_RATE : STEER_RATE;
  const steerDelta = steerTarget - car.steerAngle;
  const steerStep = Math.sign(steerDelta) * Math.min(Math.abs(steerDelta), steerRate * dt);
  const steerAngle = car.steerAngle + steerStep;

  let angle = car.angle;
  if (Math.abs(speed) > STOP_SPEED && Math.abs(steerAngle) > 0.001) {
    angle += (speed / PARKING_WHEEL_BASE) * Math.tan(steerAngle) * dt;
  }

  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  return {
    x: car.x + vx * dt,
    y: car.y + vy * dt,
    angle,
    speed,
    vx,
    vy,
    steerAngle,
  };
}
