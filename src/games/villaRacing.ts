/** Pure, deterministic gravel rally. Distances are metres; time is seconds. */
export interface VillaRaceState {
  speed: number;
  distance: number;
  /** Continuous lateral position: -1 left shoulder, 0 centre, +1 right shoulder. */
  lane: number;
  /** Completed stage runs; retained names keep the villa snapshot API stable. */
  laps: number;
  crashes: number;
  /** Smoothed actual steering, shared by physics, screen and physical rig. */
  steer: number;
  elapsed: number;
  lapTime: number;
  bestLap: number | null;
  /** Completed 600m splits, including previous stage runs. */
  checkpoint: number;
  crashTimer: number;
  /** Fixed roadside rocks, in stage distance / normalized road-width coordinates. */
  obstacles: { distance: number; lane: number }[];
}

export const VILLA_RACE_LAP_LENGTH = 2400;
export const VILLA_RACE_MAX_SPEED = 60;
/** Shared visible rotation magnitude; positive is clockwise on the 2D screen. */
export const VILLA_RACE_WHEEL_TURN = .85;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const phase = (distance: number) => distance * Math.PI * 2 / VILLA_RACE_LAP_LENGTH;
/** Signed curvature (right positive), also integrated by the road renderer. */
export const villaRallyCurvature = (distance: number) => .0048 * Math.sin(phase(distance) * 3) + .0032 * Math.sin(phase(distance) * 7);
export const villaRallyElevation = (distance: number) => 7 * Math.sin(phase(distance) * 2) + 3 * Math.sin(phase(distance) * 5);
const grade = (distance: number) => (villaRallyElevation(distance + 1) - villaRallyElevation(distance - 1)) / 2;

export function createVillaRace(): VillaRaceState {
  return {
    speed: 0, distance: 0, lane: 0, laps: 0, crashes: 0, steer: 0,
    elapsed: 0, lapTime: 0, bestLap: null, checkpoint: 0, crashTimer: 0,
    obstacles: Array.from({ length: 16 }, (_, i) => ({ distance: 140 + i * 143, lane: (i % 2 ? -1 : 1) * (1.12 + (i % 3) * .045) })),
  };
}

/** W=+1 throttle, S=-1 service brake (never reverse), A/D=-1/+1 steer.
 * input.brake is Space HANDbrake: rear grip release, tighter rotation, deceleration.
 * Invalid dt is ignored; stalls cap at .25s, substepped for swept rock collisions.
 * Callers own focus/seating and reset. No scores, persistence or random numbers.
 */
export function advanceVillaRace(state: VillaRaceState, input: { throttle: number; steer: number; brake: boolean }, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const throttle = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : 0;
  const targetSteer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  const duration = Math.min(dt, .25), steps = Math.ceil(duration * 120), step = duration / steps;
  for (let i = 0; i < steps; i++) {
    const before = state.distance;
    state.elapsed += step; state.lapTime += step;
    state.crashTimer = Math.max(0, state.crashTimer - step);
    state.steer += (targetSteer - state.steer) * (1 - Math.exp(-10 * step));
    const braking = throttle < 0;
    const acceleration = braking ? -34 : input.brake ? -22 : Math.max(0, throttle) * 15 - 2 - state.speed * .018 - grade(before) * 9.81;
    state.speed = clamp(state.speed + acceleration * step, 0, VILLA_RACE_MAX_SPEED);
    // Gravel understeers at speed. Handbrake releases the rear axle to rotate;
    // excessive speed still carries the car towards the outside of the bend.
    const grip = input.brake ? 1.55 : 1 / (1 + Math.max(0, state.speed - 25) * .018);
    const turning = state.steer * (.3 + state.speed / 36) * grip;
    const outward = villaRallyCurvature(before) * state.speed * state.speed / 22;
    state.lane += (turning - outward) * step * Math.min(1, state.speed / 3);
    if (Math.abs(state.lane) > 1) state.speed = Math.max(0, state.speed - 17 * step);
    let hit = Math.abs(state.lane) > 1.28 && state.speed > 2;
    state.lane = clamp(state.lane, -1.3, 1.3);
    state.distance += state.speed * step;
    for (const obstacle of state.obstacles) {
      let next = Math.floor(before / VILLA_RACE_LAP_LENGTH) * VILLA_RACE_LAP_LENGTH + obstacle.distance;
      if (next <= before) next += VILLA_RACE_LAP_LENGTH;
      if (before < next && state.distance >= next && Math.abs(state.lane - obstacle.lane) < .18) hit = true;
    }
    if (hit && state.crashTimer === 0) {
      state.crashes++; state.speed *= .34; state.crashTimer = 1.1;
      state.lane = clamp(state.lane, -1.15, 1.15);
    }
    const laps = Math.floor(state.distance / VILLA_RACE_LAP_LENGTH);
    if (laps > state.laps) {
      // Interpolate the finish crossing so the next run keeps its fractional time.
      const remainder = state.speed > 0 ? (state.distance - laps * VILLA_RACE_LAP_LENGTH) / state.speed : 0;
      const completed = state.lapTime - remainder;
      state.bestLap = state.bestLap === null ? completed : Math.min(state.bestLap, completed);
      state.lapTime = remainder;
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
  const sky = ctx.createLinearGradient(0, 0, 0, 330); sky.addColorStop(0, '#6c9cae'); sky.addColorStop(1, '#dae1c9');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 540);
  poly('#7c9492', [[0, 302], [0, 212], [115, 157], [235, 230], [407, 114], [610, 231], [750, 144], [960, 243], [960, 302]]);
  poly('#d4dace', [[354, 153], [407, 114], [475, 164], [420, 151], [403, 138], [382, 161]]);
  poly('#4f7166', [[0, 319], [0, 272], [140, 227], [280, 282], [490, 224], [695, 291], [840, 205], [960, 245], [960, 319]]);
  ctx.fillStyle = '#536c49'; ctx.fillRect(0, 303, 960, 237);
  // Integrate the same signed curvature used by the tyres. Unlike a per-strip
  // sine offset, this produces one continuous road with a stable near tangent.
  const segments = 100, spacing = 6;
  const road: { x: number; y: number; half: number; p: number; z: number }[] = [];
  let heading = 0, lateral = 0;
  const ground = villaRallyElevation(state.distance), slope = grade(state.distance);
  for (let i = 0; i <= segments; i++) {
    // World-anchored samples let gravel and trees approach continuously rather
    // than popping between fixed camera-depth rows every few metres.
    const z = i === 0 ? 0 : i * spacing - state.distance % spacing, p = 48 / (48 + z);
    if (i) {
      const span = z - road[i - 1]!.z;
      heading += villaRallyCurvature(state.distance + z - span / 2) * span;
      lateral += Math.sin(heading) * span;
    }
    road.push({ x: 480 + (lateral * 97.5 - state.lane * 390) * p,
      y: 250 + 290 * p - (villaRallyElevation(state.distance + z) - ground - slope * z * .35) * 97.5 * p,
      half: 390 * p, p, z });
  }
  // Clip distant geometry at intervening crests. Near strips are rendered last;
  // trees/rocks share the strip depth instead of floating over the whole road.
  const clips: number[] = []; let crest = 540;
  for (let i = 0; i <= segments; i++) { clips[i] = crest; crest = Math.min(crest, road[i]!.y); }
  for (let i = segments - 1; i >= 0; i--) {
    const near = road[i]!, far = road[i + 1]!, world = state.distance + near.z;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 78, 960, Math.max(0, clips[i]! - 78)); ctx.clip();
    const strip = (color: string, left: number, right: number) => poly(color, [[far.x + far.half * left, far.y], [far.x + far.half * right, far.y], [near.x + near.half * right, near.y], [near.x + near.half * left, near.y]]);
    if (near.y > far.y) {
      poly(Math.floor(world / 36) % 2 ? '#536c49' : '#586f4a', [[0, far.y], [960, far.y], [960, near.y], [0, near.y]]);
      strip('#8d7958', -1.24, 1.24);
      strip(Math.floor(world / 18) % 2 ? '#b7a080' : '#b39a78', -1, 1);
      // Irregular dirt shoulders and subdued tyre-worn gravel, no asphalt/lane paint.
      for (const track of [-.48, .48]) strip('#ad9473', track - .13, track + .13);
      for (let j = 0; j < 5; j++) {
        const seed = Math.floor(world / spacing) * 17 + j * 31;
        const lane = Math.sin(seed * 1.73) * .96;
        ctx.fillStyle = j % 2 ? '#cbb799' : '#927f66';
        ctx.fillRect(near.x + near.half * lane, near.y - near.p * 2, Math.max(1, near.p * 3), Math.max(.6, near.p));
      }
    }
    const slice = Math.floor(world / spacing);
    if (slice % 3 === 0) for (const side of [-1, 1]) {
      const x = near.x + near.half * side * (1.5 + .5 * (1 + Math.sin(slice * 7 + side)));
      const size = (105 + 30 * Math.sin(slice * 3)) * near.p;
      ctx.fillStyle = '#63533e'; ctx.fillRect(x - size * .045, near.y - size, size * .09, size);
      for (let crown = 0; crown < 3; crown++) {
        const y = near.y - size * (.35 + crown * .42), width = size * (.57 - crown * .1);
        poly(crown % 2 ? '#345640' : '#294c3d', [[x, y - size], [x - width, y], [x + width, y]]);
      }
    }
    for (const rock of state.obstacles) {
      const z = (rock.distance - state.distance % VILLA_RACE_LAP_LENGTH + VILLA_RACE_LAP_LENGTH) % VILLA_RACE_LAP_LENGTH;
      if (z < near.z || z >= far.z) continue;
      const x = near.x + near.half * rock.lane, size = 44 * near.p;
      poly('#6c7166', [[x - size, near.y], [x - size * .8, near.y - size * .6], [x - size * .2, near.y - size], [x + size * .65, near.y - size * .8], [x + size, near.y]]);
      poly('#969689', [[x - size * .8, near.y - size * .6], [x - size * .2, near.y - size], [x + size * .65, near.y - size * .8], [x + size * .2, near.y - size * .4]]);
    }
    // Small forest-stage split boards sit outside the driving line.
    if (Math.floor(world / 600) !== Math.floor((world + spacing) / 600)) for (const side of [-1, 1]) {
      const x = near.x + near.half * side * 1.28, size = 55 * near.p;
      ctx.fillStyle = '#594d39'; ctx.fillRect(x - 2 * near.p, near.y - size, 4 * near.p, size);
      ctx.fillStyle = '#ece1b9'; ctx.fillRect(x - size * .45, near.y - size * 1.4, size * .9, size * .55);
      ctx.fillStyle = '#445344'; ctx.font = `${Math.max(1, 18 * near.p)}px Arial`; ctx.fillText('SPLIT', x - size * .38, near.y - size);
    }
    ctx.restore();
  }
  const bend = villaRallyCurvature(state.distance + 85);
  const note = Math.abs(bend) < .0015 ? 'Opens / straight' : `${bend > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(bend) > .005 ? '2 · tightens' : '4 · flowing'}`;
  poly('#263b3b', [[0, 500], [170, 478], [790, 478], [960, 500], [960, 540], [0, 540]]);
  poly('#d3cbb0', [[240, 495], [265, 482], [695, 482], [720, 495]]);
  ctx.save(); ctx.translate(480, 550); ctx.rotate(state.steer * VILLA_RACE_WHEEL_TURN);
  ctx.strokeStyle = '#7f908d'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, 65, 0, Math.PI * 2);
  for (const a of [0, Math.PI, Math.PI / 2]) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60); } ctx.stroke();
  ctx.fillStyle = '#e7c95d'; ctx.fillRect(-5, -71, 10, 14); ctx.restore();
  ctx.fillStyle = 'rgba(20,37,34,.9)'; ctx.fillRect(0, 0, 960, 77);
  ctx.fillStyle = '#f1f1df'; ctx.font = '500 24px Arial'; ctx.fillText('Pine Ridge · Gravel rally', 24, 31);
  ctx.font = '18px Arial'; ctx.fillText(`Stage run ${state.laps + 1} · ${Math.floor(state.distance % VILLA_RACE_LAP_LENGTH)} / 2400 m`, 24, 59);
  ctx.fillText(`Split ${state.checkpoint % 4} / 4 · ${note}`, 525, 30);
  ctx.fillText(`Time ${state.lapTime.toFixed(1)}s${state.bestLap === null ? '' : ` · Best ${state.bestLap.toFixed(1)}s`}`, 525, 58);
  ctx.fillStyle = '#e7c95d'; ctx.font = '500 34px monospace'; ctx.fillText(`${Math.round(state.speed * 3.6)}`, 24, 524);
  ctx.font = '16px Arial'; ctx.fillText('km/h', 100, 521);
  ctx.fillStyle = '#eef2df'; ctx.font = '14px Arial'; ctx.fillText('W throttle · S brake · Space handbrake · A/D steer', 606, 523);
  ctx.fillStyle = '#e7c95d'; ctx.fillRect(0, 75, 960 * (state.distance % VILLA_RACE_LAP_LENGTH) / VILLA_RACE_LAP_LENGTH, 3);
  if (state.crashTimer > 0) {
    ctx.strokeStyle = `rgba(226,166,105,${Math.min(.8, state.crashTimer)})`; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 948, 528);
    ctx.fillStyle = '#fff0cf'; ctx.font = '20px Arial'; ctx.fillText('Rough shoulder · ease off and rejoin the gravel', 266, 110);
  } else if (state.speed < .5 && state.distance < 1) {
    ctx.fillStyle = 'rgba(20,37,34,.85)'; ctx.fillRect(248, 146, 464, 68);
    ctx.fillStyle = '#f1f1df'; ctx.font = '22px Arial'; ctx.fillText('Press W · follow the forest stage', 282, 174);
    ctx.font = '16px Arial'; ctx.fillText('Brake before bends · handbrake for tight turns', 282, 199);
  }
  ctx.restore();
}
