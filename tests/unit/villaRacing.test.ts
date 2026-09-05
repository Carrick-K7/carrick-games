import { describe, expect, it } from 'vitest';
import { advanceVillaRace, createVillaRace, drawVillaRace, VILLA_RACE_LAP_LENGTH, VILLA_RACE_MAX_SPEED } from '../../src/games/villaRacing.js';

const idle = { throttle: 0, steer: 0, brake: false };
const tick = (state: ReturnType<typeof createVillaRace>, input = idle, seconds = 1) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaRace(state, input, 1 / 120);
};

describe('Villa playable racing session', () => {
  it('starts parked and resets to independent deterministic state', () => {
    const first = createVillaRace(), second = createVillaRace();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ speed: 0, distance: 0, lane: 0, laps: 0, crashes: 0, checkpoint: 0 });
    tick(first, { ...idle, throttle: 1 }); first.obstacles[0]!.lane = 1;
    expect(second).toEqual(createVillaRace());
    expect(first).not.toEqual(second);
  });
  it('accelerates, travels and respects the speed cap', () => {
    const state = createVillaRace(); tick(state, { ...idle, throttle: 1 }, 2);
    expect(state.speed).toBeGreaterThan(20); expect(state.distance).toBeGreaterThan(20);
    state.speed = VILLA_RACE_MAX_SPEED;
    advanceVillaRace(state, { ...idle, throttle: 1 }, .1);
    expect(state.speed).toBeLessThanOrEqual(VILLA_RACE_MAX_SPEED);
  });
  it('coasts and brakes with S or Space, never reversing', () => {
    const coast = createVillaRace(), space = createVillaRace(), s = createVillaRace();
    coast.speed = space.speed = s.speed = 30;
    tick(coast); tick(space, { ...idle, throttle: 1, brake: true }); tick(s, { ...idle, throttle: -1 });
    expect(coast.speed).toBeLessThan(30); expect(coast.speed).toBeGreaterThan(20);
    expect(space.speed).toBe(0); expect(s.speed).toBe(0);
    const distance = s.distance; tick(s, { ...idle, throttle: -1 }); expect(s.distance).toBe(distance);
  });
  it('steers left and right only while moving and records actual input', () => {
    const left = createVillaRace(), right = createVillaRace(), stopped = createVillaRace();
    left.speed = right.speed = 20;
    tick(left, { ...idle, steer: -1 }, .25); tick(right, { ...idle, steer: 1 }, .25);
    tick(stopped, { ...idle, steer: 1 });
    expect(left.lane).toBeLessThan(0); expect(right.lane).toBeGreaterThan(0);
    expect(left.steer).toBe(-1); expect(right.steer).toBe(1); expect(stopped.lane).toBe(0);
  });
  it('curves require steering correction and off-road travel slows the car', () => {
    const road = createVillaRace(), verge = createVillaRace();
    road.distance = verge.distance = VILLA_RACE_LAP_LENGTH / 4;
    road.speed = verge.speed = 30; verge.lane = 1.1;
    tick(road, idle, .1); tick(verge, idle, .1);
    expect(road.lane).toBeLessThan(0); expect(verge.speed).toBeLessThan(road.speed);
  });
  it('sweeps cone collisions at high speed and shows temporary feedback', () => {
    const state = createVillaRace(); state.distance = 169; state.lane = -.62; state.speed = 60;
    advanceVillaRace(state, idle, .25);
    expect(state.crashes).toBe(1); expect(state.crashTimer).toBeGreaterThan(0); expect(state.speed).toBeLessThan(25);
    tick(state, { ...idle, brake: true }, 2);
    expect(state.crashes).toBe(1); expect(state.crashTimer).toBe(0);
  });
  it('allows passing cones in another lane, including on a subsequent lap', () => {
    for (const lap of [0, 1]) {
      const safe = createVillaRace(), hit = createVillaRace();
      safe.distance = hit.distance = lap * VILLA_RACE_LAP_LENGTH + 169;
      safe.speed = hit.speed = 60; safe.lane = .62; hit.lane = -.62;
      advanceVillaRace(safe, idle, .1); advanceVillaRace(hit, idle, .1);
      expect(safe.crashes).toBe(0); expect(hit.crashes).toBe(1);
    }
  });
  it('contains the lane at the guardrail and debounces impacts', () => {
    const state = createVillaRace(); state.lane = 1.27; state.speed = 40;
    tick(state, { ...idle, steer: 1, throttle: 1 }, .25);
    expect(state.crashes).toBe(1); expect(state.lane).toBeLessThanOrEqual(1.3);
  });
  it('counts checkpoints, completed laps and best lap time', () => {
    const state = createVillaRace(); state.distance = 599; state.speed = 30;
    advanceVillaRace(state, idle, .1); expect(state.checkpoint).toBe(1);
    state.distance = VILLA_RACE_LAP_LENGTH - 1; state.lapTime = 70;
    advanceVillaRace(state, idle, .1);
    expect(state.laps).toBe(1); expect(state.checkpoint).toBe(4);
    expect(state.bestLap).toBeGreaterThanOrEqual(70); expect(state.lapTime).toBeLessThan(.1);
    state.distance = VILLA_RACE_LAP_LENGTH * 2 - 1; state.lapTime = 65;
    advanceVillaRace(state, idle, .1);
    expect(state.laps).toBe(2); expect(state.bestLap).toBeLessThan(66);
  });
  it('ignores invalid dt, caps stalled frames, and sanitizes inputs', () => {
    const state = createVillaRace(), original = structuredClone(state);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) advanceVillaRace(state, { ...idle, throttle: 1 }, dt);
    expect(state).toEqual(original);
    advanceVillaRace(state, { throttle: NaN, steer: Infinity, brake: false }, .1);
    expect(state.speed).toBe(0); expect(state.steer).toBe(0);
    const capped = createVillaRace(), normal = createVillaRace();
    advanceVillaRace(capped, { ...idle, throttle: 4, steer: -5 }, 99);
    advanceVillaRace(normal, { ...idle, throttle: 1, steer: -1 }, .25);
    expect(capped).toEqual(normal);
  });
  it('draws the in-world HUD without changing state or exceeding font limits', () => {
    const state = createVillaRace(), before = structuredClone(state), labels: string[] = [], fonts: string[] = [];
    const ctx = new Proxy({}, {
      get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : name === 'fillText' ? (text: string) => labels.push(text) : () => {},
      set: (_, name, value) => { if (name === 'font') fonts.push(value); return true; },
    }) as CanvasRenderingContext2D;
    drawVillaRace(ctx, 960, 540, state);
    expect(state).toEqual(before);
    expect(labels).toContain('Press W to drive · avoid the cones');
    expect(labels.some(label => label.includes('Checkpoints'))).toBe(true);
    for (const font of fonts) expect(Number(/(\d+)px/.exec(font)?.[1])).toBeLessThanOrEqual(56);
  });
});
