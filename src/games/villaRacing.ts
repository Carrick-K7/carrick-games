/** Pure, deterministic driving session. Distances are metres; time is seconds. */
export interface VillaRaceState {
  speed: number;
  distance: number;
  /** Continuous lateral position: -1 left verge, 0 centre, +1 right verge. */
  lane: number;
  laps: number;
  crashes: number;
  steer: number;
  elapsed: number;
  lapTime: number;
  bestLap: number | null;
  /** Completed 600m checkpoints, including those in previous laps. */
  checkpoint: number;
  crashTimer: number;
  obstacles: { distance: number; lane: number }[];
}

export const VILLA_RACE_LAP_LENGTH = 2400;
export const VILLA_RACE_MAX_SPEED = 60;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const curve = (distance: number) => Math.sin(distance * Math.PI * 2 / VILLA_RACE_LAP_LENGTH) * .7;

export function createVillaRace(): VillaRaceState {
  return {
    speed: 0, distance: 0, lane: 0, laps: 0, crashes: 0, steer: 0,
    elapsed: 0, lapTime: 0, bestLap: null, checkpoint: 0, crashTimer: 0,
    obstacles: Array.from({ length: 12 }, (_, i) => ({ distance: 170 + i * 190, lane: [-.62, .62, 0, .62, -.62][i % 5]! })),
  };
}

/** W=+1 throttle, S=-1 throttle (brake, not reverse), A/D=-1/+1 steer.
 * Space sets brake. Invalid dt is ignored; stalls are capped to .25s, substepped
 * for swept obstacle collisions. Callers own focus/seating and session reset.
 */
export function advanceVillaRace(state: VillaRaceState, input: { throttle: number; steer: number; brake: boolean }, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const throttle = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : 0;
  state.steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  const duration = Math.min(dt, .25), steps = Math.ceil(duration / (1 / 120)), step = duration / steps;
  for (let i = 0; i < steps; i++) {
    const before = state.distance;
    state.elapsed += step; state.lapTime += step;
    state.crashTimer = Math.max(0, state.crashTimer - step);
    const braking = input.brake || throttle < 0;
    const acceleration = braking ? -32 : Math.max(0, throttle) * 15 - 2 - state.speed * .018;
    state.speed = clamp(state.speed + acceleration * step, 0, VILLA_RACE_MAX_SPEED);
    state.lane += (state.steer * (0.3 + state.speed / 36) - curve(state.distance) * state.speed / 90) * step * Math.min(1, state.speed / 3);
    if (Math.abs(state.lane) > 1) state.speed = Math.max(0, state.speed - 17 * step);
    let hit = Math.abs(state.lane) > 1.28 && state.speed > 2;
    state.lane = clamp(state.lane, -1.3, 1.3);
    state.distance += state.speed * step;
    for (const obstacle of state.obstacles) {
      const next = Math.floor(before / VILLA_RACE_LAP_LENGTH) * VILLA_RACE_LAP_LENGTH + obstacle.distance;
      if (before < next && state.distance >= next && Math.abs(state.lane - obstacle.lane) < .23) hit = true;
    }
    if (hit && state.crashTimer === 0) {
      state.crashes++; state.speed *= .34; state.crashTimer = 1.1;
      state.lane = clamp(state.lane, -1.15, 1.15);
    }
    const laps = Math.floor(state.distance / VILLA_RACE_LAP_LENGTH);
    if (laps > state.laps) {
      state.bestLap = state.bestLap === null ? state.lapTime : Math.min(state.bestLap, state.lapTime);
      state.lapTime = 0;
    }
    state.laps = laps;
    state.checkpoint = Math.floor(state.distance / 600);
  }
}

/** In-world 16:9 screen, not an overlay. Drawing never advances the session. */
export function drawVillaRace(ctx: CanvasRenderingContext2D, w: number, h: number, state: VillaRaceState): void {
  ctx.save(); ctx.scale(w / 960, h / 540);
  const poly = (color: string, points: number[][]) => {
    ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!)); ctx.closePath(); ctx.fill();
  };
  const sky = ctx.createLinearGradient(0, 0, 0, 280); sky.addColorStop(0, '#4389b1'); sky.addColorStop(1, '#d6ece0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 540);
  poly('#73908c', [[0, 248], [135, 128], [290, 225], [450, 148], [690, 247], [848, 157], [960, 250]]);
  ctx.fillStyle = '#78a374'; ctx.fillRect(0, 250, 960, 290);
  // Project world depth with a reciprocal camera; lateral road curvature and
  // camera position use the same normalized road width as collision physics.
  const project = (z: number, lane = 0) => {
    const p = 1 / (1 + z / 48), bend = curve(state.distance + z * .5) * z * z * .003;
    return { x: 480 + (bend + (lane - state.lane) * 390) * p, y: 250 + 290 * p, half: 390 * p, p };
  };
  for (let i = 89; i >= 0; i--) {
    const z = i * 8, far = project(z + 8), near = project(z);
    const stripe = Math.floor((state.distance + z) / 12) % 2;
    poly(stripe ? '#639461' : '#6b9a65', [[0, far.y], [960, far.y], [960, near.y], [0, near.y]]);
    poly(stripe ? '#e4e5d4' : '#bd665c', [[far.x - far.half * 1.045, far.y], [far.x + far.half * 1.045, far.y], [near.x + near.half * 1.045, near.y], [near.x - near.half * 1.045, near.y]]);
    poly(stripe ? '#475259' : '#4b565d', [[far.x - far.half, far.y], [far.x + far.half, far.y], [near.x + near.half, near.y], [near.x - near.half, near.y]]);
    if (stripe) for (const lane of [-1 / 3, 1 / 3]) {
      poly('#eee9d3', [[far.x + far.half * (lane - .009), far.y], [far.x + far.half * (lane + .009), far.y], [near.x + near.half * (lane + .009), near.y], [near.x + near.half * (lane - .009), near.y]]);
    }
    if (Math.floor((state.distance + z) / 600) !== Math.floor((state.distance + z + 8) / 600)) {
      for (let cell = 0; cell < 12; cell++) poly(cell % 2 ? '#18252e' : '#fff3d1', [[far.x + far.half * (-1 + cell / 6), far.y], [far.x + far.half * (-1 + (cell + 1) / 6), far.y], [near.x + near.half * (-1 + (cell + 1) / 6), near.y], [near.x + near.half * (-1 + cell / 6), near.y]]);
    }
  }
  const scenery = Array.from({ length: 15 }, (_, i) => (i * 48 - state.distance % 48 + 720) % 720).sort((a, b) => b - a);
  for (const z of scenery) for (const side of [-1, 1]) {
    const p = project(z, side * 1.4), size = 85 * p.p;
    ctx.fillStyle = '#6a5543'; ctx.fillRect(p.x - size * .06, p.y - size, size * .12, size);
    poly('#315d49', [[p.x, p.y - size * 2.3], [p.x - size * .6, p.y - size * .4], [p.x + size * .6, p.y - size * .4]]);
  }
  const obstacles = state.obstacles.map(obstacle => ({ ...obstacle, z: (obstacle.distance - state.distance % VILLA_RACE_LAP_LENGTH + VILLA_RACE_LAP_LENGTH) % VILLA_RACE_LAP_LENGTH })).filter(o => o.z < 720).sort((a, b) => b.z - a.z);
  for (const obstacle of obstacles) {
    const p = project(obstacle.z, obstacle.lane), size = 72 * p.p;
    ctx.fillStyle = '#26313a'; ctx.fillRect(p.x - size * .52, p.y - size * .08, size * 1.04, size * .12);
    poly('#ef9451', [[p.x, p.y - size], [p.x - size * .42, p.y], [p.x + size * .42, p.y]]);
    poly('#fff1d4', [[p.x - size * .13, p.y - size * .7], [p.x + size * .13, p.y - size * .7], [p.x + size * .23, p.y - size * .45], [p.x - size * .23, p.y - size * .45]]);
  }
  // Low bonnet preserves the road view and makes actual steering visible.
  poly('#192a34', [[0, 492], [170, 472], [790, 472], [960, 492], [960, 540], [0, 540]]);
  ctx.save(); ctx.translate(480, 550); ctx.rotate(state.steer * .45);
  ctx.strokeStyle = '#74858b'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, 65, 0, Math.PI * 2); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 64); ctx.stroke(); ctx.restore();
  ctx.fillStyle = 'rgba(15,30,39,.88)'; ctx.fillRect(0, 0, 960, 77);
  ctx.fillStyle = '#f0f6ed'; ctx.font = '500 24px Arial'; ctx.fillText('Coastal circuit', 24, 31);
  ctx.font = '18px Arial'; ctx.fillText(`Lap ${state.laps + 1}  ·  ${Math.floor(state.distance % VILLA_RACE_LAP_LENGTH)} / 2400 m`, 24, 59);
  ctx.fillText(`Checkpoints ${state.checkpoint}   ·   Bumps ${state.crashes}`, 525, 30);
  ctx.fillText(`Time ${state.lapTime.toFixed(1)}s${state.bestLap === null ? '' : `   Best ${state.bestLap.toFixed(1)}s`}`, 525, 58);
  ctx.fillStyle = '#96eddb'; ctx.font = '500 34px monospace'; ctx.fillText(`${Math.round(state.speed * 3.6)}`, 35, 519);
  ctx.font = '16px Arial'; ctx.fillText('km/h', 110, 517);
  ctx.fillStyle = '#eef2df'; ctx.fillText('W accelerate · S / Space brake · A D steer', 580, 517);
  ctx.fillStyle = '#96eddb'; ctx.fillRect(0, 75, 960 * (state.distance % VILLA_RACE_LAP_LENGTH) / VILLA_RACE_LAP_LENGTH, 3);
  if (state.crashTimer > 0) {
    ctx.strokeStyle = `rgba(248,139,98,${Math.min(.8, state.crashTimer)})`; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 946, 526);
    ctx.fillStyle = '#fff0cf'; ctx.font = '500 24px Arial'; ctx.fillText('Bump! Steer clear of cones and verges', 260, 115);
  } else if (state.speed < .5 && state.distance < 1) {
    ctx.fillStyle = 'rgba(15,30,39,.85)'; ctx.fillRect(260, 154, 440, 60);
    ctx.fillStyle = '#f0f6ed'; ctx.font = '500 24px Arial'; ctx.fillText('Press W to drive · avoid the cones', 284, 192);
  }
  ctx.restore();
}
