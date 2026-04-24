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

const MAX_STEER = 0.38;
const STEER_RATE = 3.7;
const STEER_RETURN_RATE = 5.2;
const WHEEL_BASE = 72;
export const PARKING_MAX_FORWARD_SPEED = 250;
const MAX_REVERSE_SPEED = 110;
const FORWARD_ACCEL = 560;
const REVERSE_ACCEL = 300;
const BRAKE_DECEL = 720;
const ACTIVE_DRAG = 0.18;
const COAST_DRAG = 1.35;
const STOP_SPEED = 1.5;

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

  speed = Math.max(-MAX_REVERSE_SPEED, Math.min(PARKING_MAX_FORWARD_SPEED, speed));
  const drag = input.up || input.down ? ACTIVE_DRAG : COAST_DRAG;
  speed *= Math.exp(-drag * dt);
  if (Math.abs(speed) < STOP_SPEED && !input.up && !input.down) speed = 0;

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
