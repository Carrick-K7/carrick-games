import { describe, expect, it } from 'vitest';
import {
  advanceVillaSnooker, createVillaSnooker, shootVillaSnooker, getVillaSnookerTrajectory,
  VILLA_SNOOKER_BALL_RADIUS as R, VILLA_SNOOKER_POCKETS, VILLA_SNOOKER_POCKET_CAPTURE_RADIUS,
  type VillaSnookerState, type VillaSnookerTarget,
} from '../../src/games/villaSnooker.js';

function settle(s: VillaSnookerState): void {
  for (let i = 0; i < 1500 && s.moving; i++) advanceVillaSnooker(s, 1 / 60);
  expect(s.moving).toBe(false);
  expect(s.balls.every(b => b.vx === 0 && b.vz === 0)).toBe(true);
}
function isolated(...ids: string[]): VillaSnookerState {
  const s = createVillaSnooker();
  for (const b of s.balls) b.potted = !ids.includes(b.id);
  return s;
}
/** Exercise post-shot rules separately from the trajectory tests. */
function result(s: VillaSnookerState, target: VillaSnookerTarget, first: string | null, pots: string[]): void {
  s.target = target;
  s.shot = { target, first, pots, elapsed: 0 };
  s.moving = true; s.phase = 'rolling';
  for (const b of s.balls) { b.vx = b.vz = 0; if (pots.includes(b.id)) b.potted = true; }
  advanceVillaSnooker(s, 1 / 60);
}

describe('villa snooker rack and input', () => {
  it('has the real 22-ball rack, correct values and nonoverlapping local positions', () => {
    const s = createVillaSnooker();
    expect(s.balls).toHaveLength(22);
    expect(s.balls.filter(b => b.kind === 'red')).toHaveLength(15);
    expect(s.balls.filter(b => b.value >= 2).map(b => b.value)).toEqual([2, 3, 4, 5, 6, 7]);
    for (const a of s.balls) for (const b of s.balls) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2 * R);
    expect(s.target).toBe('red');
  });
  it('breaks a playable rack, transfers motion into reds and settles without jitter', () => {
    const s = createVillaSnooker();
    expect(shootVillaSnooker(s)).toBe(true);
    let redMoved = false;
    for (let i = 0; i < 180; i++) {
      advanceVillaSnooker(s, 1 / 60);
      redMoved ||= s.balls.some(b => b.kind === 'red' && Math.hypot(b.x - b.homeX, b.z - b.homeZ) > 0.025);
    }
    expect(redMoved).toBe(true);
    settle(s);
    const snapshot = structuredClone(s);
    for (let i = 0; i < 60; i++) advanceVillaSnooker(s, 1 / 60);
    expect(s).toEqual(snapshot);
    expect(s.shots).toBe(1);
  });
  it('uses 0 = -Z and PI/2 = +X and rejects shots while moving', () => {
    const s = createVillaSnooker(); s.aim = Math.PI / 2; s.power = 2;
    expect(shootVillaSnooker(s)).toBe(true);
    expect(s.power).toBe(1);
    expect(s.balls[0].vx).toBeCloseTo(5);
    expect(s.balls[0].vz).toBeCloseTo(0);
    expect(shootVillaSnooker(s)).toBe(false);
    expect(s.shots).toBe(1);
  });
  it('ignores invalid dt without changing state, caps pauses, and rejects nonfinite aim/power', () => {
    const s = createVillaSnooker(); shootVillaSnooker(s);
    const snapshot = structuredClone(s);
    for (const dt of [NaN, Infinity, -Infinity, 0, -1]) advanceVillaSnooker(s, dt);
    expect(s).toEqual(snapshot);
    const other = structuredClone(s);
    advanceVillaSnooker(s, 100); advanceVillaSnooker(other, 0.25);
    expect(s).toEqual(other);
    const bad = createVillaSnooker(); bad.aim = NaN;
    expect(shootVillaSnooker(bad)).toBe(false);
    bad.aim = 0; bad.power = Infinity;
    expect(shootVillaSnooker(bad)).toBe(false);
  });
  it('resets independently with no retained score, pots or motion', () => {
    const a = createVillaSnooker(); a.score = 88; a.balls[1].potted = true; shootVillaSnooker(a);
    const b = createVillaSnooker();
    expect(b).toEqual(createVillaSnooker());
    expect(b.balls[1].potted).toBe(false);
    expect(b.balls).not.toBe(a.balls);
  });
});

describe('villa snooker physical trajectories', () => {
  it('rebounds from all four cushions with energy loss', () => {
    for (const axis of ['x', 'z'] as const) for (const sign of [-1, 1]) {
      const s = isolated('white'), b = s.balls[0];
      b.x = 0.3; b.z = 0.4;
      b[axis] = sign * (axis === 'x' ? 0.85 : 1.75);
      const v = axis === 'x' ? 'vx' : 'vz'; b[v] = sign * 2;
      advanceVillaSnooker(s, 0.03);
      expect(b[v] * sign).toBeLessThan(0);
      expect(Math.abs(b[v])).toBeLessThan(2);
      expect(b.potted).toBe(false);
    }
  });
  it('transfers near-equal mass velocity without tunneling on a fast shot', () => {
    const s = isolated('white', 'red-1'), a = s.balls[0], b = s.balls[1];
    a.x = -0.25; a.z = 0.5; a.vx = 8; b.x = 0.1; b.z = 0.5;
    advanceVillaSnooker(s, 0.06);
    expect(b.vx).toBeGreaterThan(7);
    expect(a.vx).toBeLessThan(0.3);
    expect(a.x).toBeLessThan(b.x);
  });
  it('prevents approaching fast balls from passing through each other', () => {
    const s = isolated('white', 'red-1'), a = s.balls[0], b = s.balls[1];
    a.x = -0.3; b.x = 0.3; a.z = b.z = 0.5; a.vx = 8; b.vx = -8;
    advanceVillaSnooker(s, 0.06);
    expect(a.vx).toBeLessThan(0); expect(b.vx).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(b.x);
  });
  it('pots a moving ball in each actual furnished aperture', () => {
    for (const p of VILLA_SNOOKER_POCKETS) {
      const s = isolated('red-1'), b = s.balls[1];
      const dx = p.x, dz = p.z, length = Math.hypot(dx, dz);
      b.x = p.x - dx / length * 0.15; b.z = p.z - dz / length * 0.15;
      b.vx = dx / length * 3; b.vz = dz / length * 3;
      advanceVillaSnooker(s, 0.08);
      expect(b.potted).toBe(true);
      expect(b.vx).toBe(0); expect(b.vz).toBe(0);
    }
  });
  it('physically pots a legal red, scores one and switches to colour', () => {
    const s = isolated('white', 'red-1', 'red-2'), cue = s.balls[0], red = s.balls[1];
    cue.x = 0.6; cue.z = 0; red.x = 0.76; red.z = 0;
    s.balls[2].x = -0.5; s.balls[2].z = -0.5;
    s.aim = Math.PI / 2; s.power = 0.1;
    shootVillaSnooker(s); settle(s);
    expect(red.potted).toBe(true); expect(cue.potted).toBe(false);
    expect(s.score).toBe(1); expect(s.target).toBe('color'); expect(s.foul).toBeNull();
  });
  it('scratch is not respotted until all balls settle', () => {
    const s = isolated('white', 'red-1'), cue = s.balls[0];
    cue.x = 0.78; cue.z = 0; s.aim = Math.PI / 2; s.power = 0.1;
    s.balls[1].x = 0; s.balls[1].z = -0.5;
    shootVillaSnooker(s); s.balls[1].vx = 0.5;
    advanceVillaSnooker(s, 0.1);
    expect(cue.potted).toBe(true); expect(s.moving).toBe(true);
    settle(s);
    expect(cue.potted).toBe(false); expect(s.foul).toBe('Cue ball potted'); expect(s.score).toBe(-4);
    expect(Math.hypot(cue.x, cue.z - (3.569 / 2 - 0.737))).toBeLessThan(0.292);
  });
  it('separates coincident balls deterministically and sanitizes corrupted motion', () => {
    const s = isolated('white', 'red-1');
    s.balls[0].x = s.balls[1].x = 0; s.balls[0].z = s.balls[1].z = 0.5;
    advanceVillaSnooker(s, 0.01);
    expect(Math.hypot(s.balls[0].x - s.balls[1].x, s.balls[0].z - s.balls[1].z)).toBeGreaterThanOrEqual(2 * R);
    s.balls[0].vx = NaN; s.balls[1].z = Infinity;
    advanceVillaSnooker(s, 0.01);
    expect(s.balls.every(b => [b.x, b.z, b.vx, b.vz].every(Number.isFinite))).toBe(true);
  });
});

describe('villa snooker practice rules', () => {
  it('alternates red/colour and respots a scored colour', () => {
    const s = createVillaSnooker();
    result(s, 'red', 'red-1', ['red-1']); expect(s.score).toBe(1); expect(s.target).toBe('color');
    result(s, 'color', 'black', ['black']); expect(s.score).toBe(8); expect(s.target).toBe('red');
    expect(s.balls.find(b => b.id === 'black')?.potted).toBe(false);
  });
  it('scores multiple reds but makes two colours a foul', () => {
    const s = createVillaSnooker(); result(s, 'red', 'red-1', ['red-1', 'red-2']); expect(s.score).toBe(2);
    result(s, 'color', 'yellow', ['yellow', 'green']); expect(s.foul).toBe('Wrong ball potted'); expect(s.score).toBe(-2);
  });
  it('penalizes no contact and wrong first ball, including 7-point black fouls', () => {
    const s = createVillaSnooker(); result(s, 'red', null, []); expect(s.score).toBe(-4); expect(s.foul).toBe('No object ball hit');
    result(s, 'red', 'black', []); expect(s.score).toBe(-11); expect(s.foul).toBe('Wrong first ball');
  });
  it('does not score a red if a wrong colour also falls and respots that colour', () => {
    const s = createVillaSnooker(); result(s, 'red', 'red-1', ['red-1', 'pink']);
    expect(s.score).toBe(-6); expect(s.balls[1].potted).toBe(true);
    expect(s.balls.find(b => b.id === 'pink')?.potted).toBe(false);
  });
  it('finds an unoccupied colour respot when its home is blocked', () => {
    const s = createVillaSnooker(), blue = s.balls.find(b => b.id === 'blue')!;
    s.balls[1].x = blue.homeX; s.balls[1].z = blue.homeZ;
    result(s, 'color', 'blue', ['blue']);
    expect(blue.potted).toBe(false);
    expect(s.balls.every(b => b === blue || b.potted || Math.hypot(b.x - blue.x, b.z - blue.z) >= R * 2)).toBe(true);
  });
  it('allows a last-red colour then clears yellow through black in order', () => {
    const s = createVillaSnooker(); for (const b of s.balls) if (b.kind === 'red' && b.id !== 'red-1') b.potted = true;
    result(s, 'red', 'red-1', ['red-1']); expect(s.target).toBe('color');
    result(s, 'color', 'black', ['black']); expect(s.target).toBe('yellow');
    for (const name of ['yellow', 'green', 'brown', 'blue', 'pink', 'black'] as const) {
      expect(s.target).toBe(name); result(s, name, name, [name]);
      expect(s.balls.find(b => b.id === name)?.potted).toBe(true);
    }
    expect(s.score).toBe(35); expect(s.phase).toBe('complete'); expect(shootVillaSnooker(s)).toBe(false);
  });
  it('keeps the clearance target and respots fouled colours', () => {
    const s = createVillaSnooker(); for (const b of s.balls) if (b.kind === 'red') b.potted = true;
    result(s, 'yellow', 'pink', ['pink']); expect(s.target).toBe('yellow');
    expect(s.balls.find(b => b.id === 'pink')?.potted).toBe(false); expect(s.score).toBe(-6);
  });
});

describe('Villa deterministic snooker assistance', () => {
  it('uses the shot angle and stops at the first straight object-ball contact', () => {
    const s = isolated('white', 'red-1');
    s.balls[0].x = s.balls[1].x = 0; s.balls[0].z = 0.5; s.balls[1].z = -0.3;
    const before = structuredClone(s), guide = getVillaSnookerTrajectory(s)!;
    expect(s.aimAssist).toBe(true); expect(s).toEqual(before);
    expect(guide.collision).toEqual({ kind: 'ball', ballId: 'red-1' });
    expect(guide.cue.to.x).toBeCloseTo(0); expect(guide.cue.to.z).toBeCloseTo(-0.3 + R * 2);
    expect(guide.ghost).toEqual(guide.cue.to); expect(guide.bank).toBeNull();
    expect(guide.object!.to.x).toBe(0); expect(guide.object!.to.z).toBeCloseTo(-1);
    expect(getVillaSnookerTrajectory(s)).toEqual(guide);
    shootVillaSnooker(s); expect(s.balls[0].vx).toBeCloseTo(0); expect(s.balls[0].vz).toBeLessThan(0);
    expect(getVillaSnookerTrajectory(s)).toBeNull();
  });
  it('projects an oblique cut along the line of ball centres, not the original aim', () => {
    const s = isolated('white', 'red-1'); s.aim = Math.PI / 2;
    s.balls[0].x = -0.4; s.balls[0].z = 0.4; s.balls[1].x = 0.1; s.balls[1].z = 0.4 + R;
    const guide = getVillaSnookerTrajectory(s)!;
    expect(guide.collision.kind).toBe('ball');
    expect(guide.cue.to.x).toBeCloseTo(0.1 - Math.sqrt(3) * R); expect(guide.cue.to.z).toBeCloseTo(0.4);
    expect(Math.hypot(guide.ghost!.x - s.balls[1].x, guide.ghost!.z - s.balls[1].z)).toBeCloseTo(R * 2);
    const path = guide.object!, dx = path.to.x - path.from.x, dz = path.to.z - path.from.z;
    expect(dx).toBeGreaterThan(0); expect(dz / dx).toBeCloseTo(1 / Math.sqrt(3));
  });
  it('chooses the nearest live ball independent of array order and clips the object projection too', () => {
    const s = isolated('white', 'red-1', 'red-2', 'red-3'); s.aim = Math.PI / 2;
    const [cue, near, next, potted] = s.balls;
    cue.x = -0.6; near.x = -0.1; next.x = 0.1; potted.x = -0.3;
    for (const b of [cue, near, next, potted]) b.z = 0.4;
    potted.potted = true;
    const guide = getVillaSnookerTrajectory(s)!;
    expect(guide.collision).toEqual({ kind: 'ball', ballId: near.id });
    expect(guide.object!.to.x).toBeCloseTo(next.x - R * 2);
    s.balls.reverse(); expect(getVillaSnookerTrajectory(s)).toEqual(guide);
    near.potted = true; expect(getVillaSnookerTrajectory(s)!.collision).toEqual({ kind: 'ball', ballId: next.id });
  });
  it('clips all four rail paths at ball-centre limits and adds only a short inward bank', () => {
    for (const aim of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const s = isolated('white'); s.aim = aim; s.balls[0].x = 0.25; s.balls[0].z = 0.35;
      const guide = getVillaSnookerTrajectory(s)!;
      expect(guide.collision.kind).toBe('cushion'); expect(guide.ghost).toBeNull(); expect(guide.object).toBeNull();
      const axis = Math.abs(Math.sin(aim)) > 0.5 ? 'x' : 'z';
      expect(Math.abs(guide.cue.to[axis])).toBeCloseTo((axis === 'x' ? 1.778 : 3.569) / 2 - R);
      expect(guide.bank!.from).toEqual(guide.cue.to);
      expect(Math.hypot(guide.bank!.to.x - guide.bank!.from.x, guide.bank!.to.z - guide.bank!.from.z)).toBeLessThanOrEqual(0.55 + 1e-9);
    }
  });
  it('ends an oblique bank at its first ball rather than drawing through it', () => {
    const s = isolated('white', 'red-1'); s.aim = Math.PI / 4;
    s.balls[0].x = 0.5; s.balls[0].z = 0.5;
    const railX = 1.778 / 2 - R, railZ = 0.5 - (railX - 0.5), offset = 0.22 / Math.sqrt(2);
    s.balls[1].x = railX - offset; s.balls[1].z = railZ - offset;
    const guide = getVillaSnookerTrajectory(s)!;
    expect(guide.collision.kind).toBe('cushion');
    expect(Math.hypot(guide.bank!.to.x - guide.bank!.from.x, guide.bank!.to.z - guide.bank!.from.z)).toBeCloseTo(0.22 - R * 2);
    expect(Math.hypot(guide.bank!.to.x - s.balls[1].x, guide.bank!.to.z - s.balls[1].z)).toBeCloseTo(R * 2);
  });
  it('swallows an angled pot at the mouth instead of rebounding off the jaw', () => {
    const X = 1.778 / 2, Z = 3.569 / 2;
    const cases: Array<[number, number, number, number, number]> = [
      [0.9, -0.5, -X, -Z, 2.5], [0.5, -Z + R, -X, -Z + R, 1.6], [-0.2, -1.6, -X, -Z, 3.0], [0.2, -Z + R * 0.6, -X, -Z, 2.2],
    ];
    for (const [sx, sz, tx, tz, speed] of cases) {
      const s = isolated('white', 'red-1');
      const red = s.balls.find(b => b.id === 'red-1')!;
      red.x = sx; red.z = sz;
      const dx = tx - sx, dz = tz - sz, length = Math.hypot(dx, dz);
      red.vx = dx / length * speed; red.vz = dz / length * speed;
      s.shot = { target: 'red', first: null, pots: [], elapsed: 0 };
      let potted = false;
      for (let i = 0; i < 4000 && !potted; i++) {
        advanceVillaSnooker(s, 1 / 120);
        potted = red.potted;
        if (!potted && red.vx === 0 && red.vz === 0) break;
      }
      expect(potted, `angled pot from ${sx},${sz}`).toBe(true);
    }
  });
  it('uses every actual pocket capture boundary without inventing cushion bounces at mouths', () => {
    for (const [i, p] of VILLA_SNOOKER_POCKETS.entries()) {
      const s = isolated('white'); s.balls[0].x = s.balls[0].z = 0; s.aim = Math.atan2(p.x, -p.z);
      const guide = getVillaSnookerTrajectory(s)!;
      expect(guide.collision).toEqual({ kind: 'pocket', pocketIndex: i }); expect(guide.bank).toBeNull();
      expect(Math.hypot(guide.cue.to.x - p.x, guide.cue.to.z - p.z)).toBeCloseTo(VILLA_SNOOKER_POCKET_CAPTURE_RADIUS);
    }
  });
  it('hides when disabled, inactive, rolling, complete, invalid, missing or sunk cue and resets default-on', () => {
    const s = createVillaSnooker(); expect(getVillaSnookerTrajectory(s, false)).toBeNull();
    s.aimAssist = false; expect(getVillaSnookerTrajectory(s)).toBeNull(); s.aimAssist = true;
    s.moving = true; expect(getVillaSnookerTrajectory(s)).toBeNull(); s.moving = false;
    for (const phase of ['rolling', 'complete'] as const) { s.phase = phase; expect(getVillaSnookerTrajectory(s)).toBeNull(); } s.phase = 'aiming';
    s.aim = NaN; expect(getVillaSnookerTrajectory(s)).toBeNull(); s.aim = 0;
    s.balls[0].potted = true; expect(getVillaSnookerTrajectory(s)).toBeNull(); s.balls[0].potted = false;
    s.balls[0].vx = 0.1; expect(getVillaSnookerTrajectory(s)).toBeNull(); s.balls[0].vx = 0;
    s.balls.shift(); expect(getVillaSnookerTrajectory(s)).toBeNull();
    const reset = createVillaSnooker(); expect(reset.aimAssist).toBe(true); expect(getVillaSnookerTrajectory(reset)).not.toBeNull();
    const snapshot = structuredClone(reset), guide = getVillaSnookerTrajectory(reset);
    for (const dt of [0, NaN, Infinity, -1]) advanceVillaSnooker(reset, dt);
    expect(reset).toEqual(snapshot); expect(getVillaSnookerTrajectory(reset)).toEqual(guide);
  });
  it('restores guides after an actual scratch settles and respots, without scoring changes', () => {
    const s = isolated('white'); s.balls[0].x = 0.78; s.balls[0].z = 0; s.aim = Math.PI / 2; s.power = 0.1;
    shootVillaSnooker(s); advanceVillaSnooker(s, 0.25); settle(s);
    expect(s.foul).toBe('Cue ball potted'); expect(s.score).toBe(-4); expect(getVillaSnookerTrajectory(s)).not.toBeNull();
  });
  it('does not draw through an already-overlapping collider behind the cue direction', () => {
    const s = isolated('white', 'red-1'); s.aim = Math.PI / 2;
    s.balls[0].x = 0; s.balls[1].x = -0.01; s.balls[0].z = s.balls[1].z = 0.4;
    const guide = getVillaSnookerTrajectory(s)!;
    expect(guide.collision).toEqual({ kind: 'ball', ballId: 'red-1' });
    expect(guide.cue.to).toEqual(guide.cue.from); expect(guide.object).toBeNull();
  });
  it('keeps every preview endpoint finite and bounded through a deterministic full aim sweep', () => {
    for (let i = 0; i < 400; i++) {
      const s = createVillaSnooker(); s.aim = i * Math.PI * 2 / 400;
      const guide = getVillaSnookerTrajectory(s)!;
      for (const segment of [guide.cue, guide.object, guide.bank]) if (segment) for (const p of [segment.from, segment.to]) {
        expect(Number.isFinite(p.x + p.z)).toBe(true);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1.778 / 2 - R + 1e-9);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(3.569 / 2 - R + 1e-9);
      }
    }
  });
});
