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

// ── Tank 500 real-world specifications ───────────────────────────────────
// Length 5 078 mm, width 1 934 mm, wheelbase 2 850 mm, turning radius 5.6 m,
// 0‑100 km/h in 8.5 s.  All game‑world quantities are derived from these.
const TANK500_LENGTH_MM = 5078;
const TANK500_WIDTH_MM = 1934;
const TANK500_WHEELBASE_MM = 2850;
const TANK500_TURNING_RADIUS_MM = 5600;
const TANK500_ZERO_TO_100_KMH_SECONDS = 8.5;
const KMH_100_MPS = 100 / 3.6; // 27.78 m/s

// ── Geometric scale (pixels → metres) ────────────────────────────────────
export const PARKING_CAR_LENGTH = 50;
export const PARKING_PIXELS_PER_METER = PARKING_CAR_LENGTH / (TANK500_LENGTH_MM / 1000);
export const PARKING_CAR_WIDTH = PARKING_CAR_LENGTH * (TANK500_WIDTH_MM / TANK500_LENGTH_MM);
export const PARKING_WHEEL_BASE = PARKING_CAR_LENGTH * (TANK500_WHEELBASE_MM / TANK500_LENGTH_MM);
export const PARKING_MIN_TURN_RADIUS = PARKING_CAR_LENGTH * (TANK500_TURNING_RADIUS_MM / TANK500_LENGTH_MM);
export const PARKING_MAX_STEER = Math.atan(PARKING_WHEEL_BASE / PARKING_MIN_TURN_RADIUS);

// ── Driving dynamics ─────────────────────────────────────────────────────
// Acceleration derived from Tank 500 0‑100 km/h (no arcade multiplier).
// Brake decel ≈ 0.8 g for a heavy‑SUV feel.
// Steering rates reflect a large vehicle (slower than a sports car).
const TANK500_ACCEL_MPS2 = KMH_100_MPS / TANK500_ZERO_TO_100_KMH_SECONDS;
export const PARKING_FORWARD_ACCEL = TANK500_ACCEL_MPS2 * PARKING_PIXELS_PER_METER;
export const PARKING_MAX_FORWARD_SPEED = 130;       // ≈ 48 km/h on display
const MAX_REVERSE_SPEED = 70;                       // ≈ 26 km/h on display
const REVERSE_ACCEL = PARKING_FORWARD_ACCEL * 0.7;
const BRAKE_DECEL = Math.round(PARKING_FORWARD_ACCEL * 3.0);
const COAST_DRAG = 3.5;
const TURNING_DRAG = 0.005;   // lateral friction proportional to |steerAngle| × |speed|
const STOP_SPEED = 1.2;
const STEER_RATE = 6.5;
const STEER_RETURN_RATE = 7.5;

// Display conversion: internal px/s → km/h
export const PARKING_PX_S_TO_KMH = 3.6 / PARKING_PIXELS_PER_METER;

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

  // Turning drag — lateral friction proportional to steer angle and speed
  if (Math.abs(speed) > STOP_SPEED && Math.abs(car.steerAngle) > 0.01) {
    speed *= Math.exp(-TURNING_DRAG * Math.abs(car.steerAngle) * Math.abs(speed) * dt);
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
