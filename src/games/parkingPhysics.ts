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
}

const MAX_STEER = 0.20;
const STEER_RATE = 3.7;
const STEER_RETURN_RATE = 5.2;
const WHEEL_BASE = 100;
export const PARKING_MAX_FORWARD_SPEED = 200;
const MAX_REVERSE_SPEED = 90;
const FORWARD_ACCEL = 320;
const REVERSE_ACCEL = 180;
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
    speed += FORWARD_ACCEL * dt;
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

  const steerTarget = input.left === input.right ? 0 : input.left ? -MAX_STEER : MAX_STEER;
  const steerRate = steerTarget === 0 ? STEER_RETURN_RATE : STEER_RATE;
  const steerDelta = steerTarget - car.steerAngle;
  const steerStep = Math.sign(steerDelta) * Math.min(Math.abs(steerDelta), steerRate * dt);
  const steerAngle = car.steerAngle + steerStep;

  let angle = car.angle;
  if (Math.abs(speed) > STOP_SPEED && Math.abs(steerAngle) > 0.001) {
    angle += (speed / WHEEL_BASE) * Math.tan(steerAngle) * dt;
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
