import { VILLA_SNOOKER } from './villaActivities.js';

export const VILLA_SNOOKER_BALL_RADIUS = 0.02625;
const R = VILLA_SNOOKER_BALL_RADIUS;
const X = VILLA_SNOOKER.playingWidth / 2;
const Z = VILLA_SNOOKER.playingLength / 2;
export const VILLA_SNOOKER_POCKETS = [
  { x: -X, z: -Z }, { x: X, z: -Z }, { x: -0.9, z: 0 },
  { x: 0.9, z: 0 }, { x: -X, z: Z }, { x: X, z: Z },
] as const;
export type VillaSnookerColor = 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black';
export type VillaSnookerTarget = 'red' | 'color' | VillaSnookerColor;
export interface VillaSnookerBall {
  id: string;
  kind: 'white' | 'red' | VillaSnookerColor;
  value: number;
  x: number; z: number; vx: number; vz: number; potted: boolean;
  homeX: number; homeZ: number;
}
interface Shot {
  target: VillaSnookerTarget;
  first: string | null;
  pots: string[];
  elapsed: number;
}
export interface VillaSnookerState {
  balls: VillaSnookerBall[];
  /** Radians: 0 = north (-Z), PI/2 = east (+X). Positions are table-local metres. */
  aim: number;
  power: number;
  moving: boolean;
  score: number;
  shots: number;
  target: VillaSnookerTarget;
  phase: 'aiming' | 'rolling' | 'complete';
  foul: string | null;
  message: string;
  shot: Shot | null;
}
const COLORS: VillaSnookerColor[] = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];

/** New state is also the reset API: no shared mutable rack or random placement. */
export function createVillaSnooker(): VillaSnookerState {
  const balls: VillaSnookerBall[] = [];
  const add = (id: string, kind: VillaSnookerBall['kind'], value: number, x: number, z: number) => {
    balls.push({ id, kind, value, x, z, homeX: x, homeZ: z, vx: 0, vz: 0, potted: false });
  };
  const baulk = Z - 0.737;
  add('white', 'white', 0, -0.12, baulk + 0.16);
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
    add(`red-${balls.length}`, 'red', 1, (col - row / 2) * 0.0535, -0.975 - row * 0.04634);
  }
  const spots = [[0.292, baulk], [-0.292, baulk], [0, baulk], [0, 0], [0, -Z / 2], [0, -Z + 0.324]];
  COLORS.forEach((kind, i) => add(kind, kind, i + 2, spots[i][0], spots[i][1]));
  return { balls, aim: 0, power: 0.65, moving: false, score: 0, shots: 0, target: 'red', phase: 'aiming', foul: null, message: 'Pot a red', shot: null };
}

export function shootVillaSnooker(state: VillaSnookerState): boolean {
  if (state.moving || state.phase === 'complete' || !Number.isFinite(state.aim) || !Number.isFinite(state.power)) return false;
  const cue = state.balls.find(b => b.kind === 'white');
  if (!cue || cue.potted || state.balls.some(b => !b.potted && Math.hypot(b.vx, b.vz) > 0.008)) return false;
  state.power = Math.max(0, Math.min(1, state.power));
  state.aim %= Math.PI * 2;
  const speed = 0.35 + state.power * 4.65;
  cue.vx = Math.sin(state.aim) * speed;
  cue.vz = -Math.cos(state.aim) * speed;
  state.shot = { target: state.target, first: null, pots: [], elapsed: 0 };
  state.moving = true;
  state.phase = 'rolling';
  state.shots++;
  state.foul = null;
  state.message = 'Balls rolling';
  return true;
}

function onTarget(ball: VillaSnookerBall, target: VillaSnookerTarget): boolean {
  return target === 'color' ? ball.value >= 2 : ball.kind === target;
}

function respot(state: VillaSnookerState, ball: VillaSnookerBall): void {
  const clear = (x: number, z: number) => state.balls.every(b => b === ball || b.potted || Math.hypot(b.x - x, b.z - z) >= R * 2 + 0.001);
  const place = (x: number, z: number) => { ball.x = x; ball.z = z; ball.vx = ball.vz = 0; ball.potted = false; };
  if (clear(ball.homeX, ball.homeZ)) { place(ball.homeX, ball.homeZ); return; }
  // Occupied spots use highest free colour spot, then a deterministic cloth grid.
  if (ball.kind !== 'white') {
    for (const kind of [...COLORS].reverse()) {
      const spot = state.balls.find(b => b.kind === kind);
      if (spot && clear(spot.homeX, spot.homeZ)) { place(spot.homeX, spot.homeZ); return; }
    }
  }
  // White stays inside the baulk D; plenty of room for all 22 balls.
  const startZ = ball.kind === 'white' ? Z - 0.737 : -Z + R * 3;
  const endZ = ball.kind === 'white' ? startZ + 0.292 : Z - R * 3;
  for (let z = startZ; z <= endZ; z += R * 2.1) for (let x = -X + R * 3; x < X - R * 3; x += R * 2.1) {
    if (ball.kind === 'white' && Math.hypot(x, z - startZ) > 0.265) continue;
    if (clear(x, z)) { place(x, z); return; }
  }
}

function finishShot(state: VillaSnookerState): void {
  state.moving = false;
  state.phase = 'aiming';
  const shot = state.shot;
  if (!shot) return;
  const pots = state.balls.filter(b => shot.pots.includes(b.id));
  const first = state.balls.find(b => b.id === shot.first);
  const scratch = pots.some(b => b.kind === 'white');
  const wrongPot = pots.some(b => b.kind !== 'white' && !onTarget(b, shot.target));
  const multipleColors = shot.target !== 'red' && pots.filter(b => b.value >= 2).length > 1;
  const foul = scratch ? 'Cue ball potted' : !first ? 'No object ball hit' : !onTarget(first, shot.target) ? 'Wrong first ball' : wrongPot || multipleColors ? 'Wrong ball potted' : null;
  const redsRemain = state.balls.some(b => b.kind === 'red' && !b.potted);
  const alternating = shot.target === 'red' || shot.target === 'color';
  if (foul) {
    const targetValue = COLORS.indexOf(shot.target as VillaSnookerColor);
    const penalty = Math.max(4, targetValue < 0 ? 0 : targetValue + 2, first?.value ?? 0, ...pots.map(b => b.value));
    state.score -= penalty;
    state.foul = foul;
    state.message = `Foul: ${foul} (-${penalty})`;
    if (alternating) state.target = redsRemain ? 'red' : 'yellow';
  } else {
    const points = pots.reduce((sum, b) => sum + b.value, 0);
    state.score += points;
    state.message = points ? `+${points} points` : 'No pot — try again';
    if (shot.target === 'red') state.target = points ? 'color' : redsRemain ? 'red' : 'yellow';
    else if (shot.target === 'color') state.target = redsRemain ? 'red' : 'yellow';
    else if (points) {
      const next = COLORS[COLORS.indexOf(shot.target) + 1];
      if (next) state.target = next;
      else { state.phase = 'complete'; state.message = 'Table cleared — reset for a new rack'; }
    }
  }
  for (const ball of pots) if (ball.kind === 'white' || (ball.value >= 2 && (alternating || foul))) respot(state, ball);
  state.shot = null;
}

/** Seconds; invalid/nonpositive dt is ignored and pauses are capped at .25s.
 * Equal-mass rolling spheres: no spin/jump, simplified pocket jaws, no opponent,
 * nomination/free-ball/miss rule. Fouls subtract 4–7 from practice score.
 */
export function advanceVillaSnooker(state: VillaSnookerState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.25);
  for (const ball of state.balls) {
    if (![ball.x, ball.z, ball.vx, ball.vz].every(Number.isFinite)) {
      ball.vx = ball.vz = 0; ball.potted = true; respot(state, ball);
    }
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed > 8) { ball.vx *= 8 / speed; ball.vz *= 8 / speed; }
  }
  while (remaining > 1e-9) {
    let fastest = 0;
    for (const b of state.balls) if (!b.potted) fastest = Math.max(fastest, Math.hypot(b.vx, b.vz));
    // Max travel < 1/4 diameter even for two approaching balls.
    const step = Math.min(remaining, 1 / 240, R * 0.4 / Math.max(fastest, 0.01));
    remaining -= step;
    for (const b of state.balls) {
      if (b.potted) continue;
      b.x += b.vx * step; b.z += b.vz * step;
      // Ball centre crossing the aperture's safe inner radius falls into the pocket.
      if (VILLA_SNOOKER_POCKETS.some(p => Math.hypot(b.x - p.x, b.z - p.z) < 0.064)) {
        b.potted = true; b.vx = b.vz = 0;
        if (state.shot && !state.shot.pots.includes(b.id)) state.shot.pots.push(b.id);
        continue;
      }
      if (Math.abs(b.x) > X - R) { b.x = Math.sign(b.x) * (X - R); if (b.vx * b.x > 0) b.vx *= -0.82; }
      if (Math.abs(b.z) > Z - R) { b.z = Math.sign(b.z) * (Z - R); if (b.vz * b.z > 0) b.vz *= -0.82; }
    }
    // Two deterministic solver passes propagate a break through the close rack.
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < state.balls.length; i++) {
      const a = state.balls[i];
      if (a.potted) continue;
      for (let j = i + 1; j < state.balls.length; j++) {
        const b = state.balls[j];
        if (b.potted) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= R * 2) continue;
        const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0;
        const overlap = (R * 2 - d) / 2 + 1e-7;
        a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
        const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (approach <= 0) continue;
        if (state.shot && !state.shot.first && (a.kind === 'white' || b.kind === 'white')) state.shot.first = (a.kind === 'white' ? b : a).id;
        const impulse = approach * 0.97;
        a.vx -= impulse * nx; a.vz -= impulse * nz; b.vx += impulse * nx; b.vz += impulse * nz;
      }
    }
    for (const b of state.balls) if (!b.potted) {
      const speed = Math.hypot(b.vx, b.vz);
      const next = Math.max(0, speed - 0.24 * step);
      if (next < 0.008) b.vx = b.vz = 0;
      else { b.vx *= next / speed; b.vz *= next / speed; }
    }
  }
  if (state.shot) state.shot.elapsed += Math.min(dt, 0.25);
  // Safety ceiling also guarantees no long numerical tails after a shot.
  if (state.shot && state.shot.elapsed > 24) for (const b of state.balls) b.vx = b.vz = 0;
  state.moving = state.balls.some(b => !b.potted && (b.vx !== 0 || b.vz !== 0));
  if (!state.moving && state.shot) finishShot(state);
}
