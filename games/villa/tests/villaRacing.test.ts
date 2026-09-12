import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaRace, createVillaRace, drawVillaRace, villaRallyCurvature, villaRallyElevation, VILLA_RACE_LAP_LENGTH, VILLA_RACE_MAX_SPEED, VILLA_RACE_WHEEL_TURN } from '../src/villaRacing.js';
import { createVillaRallyWheel } from '../src/villaGaming.js';
import { VILLA_RACING } from '../src/villaActivities.js';

const idle = { throttle: 0, steer: 0, brake: false };
const tick = (state: ReturnType<typeof createVillaRace>, input = idle, seconds = 1) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaRace(state, input, 1 / 120);
};
const drawing = () => {
  const labels: string[] = [], rotations: number[] = [], fonts: string[] = [], colors: string[] = [], coordinates: number[] = [];
  const ctx = new Proxy({}, {
    get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : name === 'fillText' ? (text: string) => labels.push(text) : name === 'rotate' ? (angle: number) => rotations.push(angle) : (...args: unknown[]) => { for (const n of args) if (typeof n === 'number') coordinates.push(n); },
    set: (_, name, value) => { if (name === 'font') fonts.push(value); if (name === 'fillStyle') colors.push(value); return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, labels, rotations, fonts, colors, coordinates };
};

describe('Villa forest gravel rally', () => {
  it('starts parked with independent deterministic roadside rocks and no centre cones', () => {
    const first = createVillaRace(), second = createVillaRace();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ speed: 0, distance: 0, lane: 0, laps: 0, crashes: 0, checkpoint: 0 });
    expect(first.obstacles.every(o => Math.abs(o.lane) > 1 && o.distance < VILLA_RACE_LAP_LENGTH)).toBe(true);
    tick(first, { ...idle, throttle: 1 }); first.obstacles[0]!.lane = 0;
    expect(second).toEqual(createVillaRace());
  });
  it('has periodic flowing and tight bends in both directions and actual terrain', () => {
    const curves = Array.from({ length: 240 }, (_, i) => villaRallyCurvature(i * 10));
    expect(Math.max(...curves)).toBeGreaterThan(.006); expect(Math.min(...curves)).toBeLessThan(-.006);
    expect(villaRallyElevation(200)).not.toBeCloseTo(villaRallyElevation(700));
    for (const d of [0, 100, 900, 2300]) {
      expect(villaRallyCurvature(d)).toBeCloseTo(villaRallyCurvature(d + VILLA_RACE_LAP_LENGTH), 12);
      expect(villaRallyElevation(d)).toBeCloseTo(villaRallyElevation(d + VILLA_RACE_LAP_LENGTH), 12);
    }
  });
  it('accelerates, travels and respects the speed cap', () => {
    const state = createVillaRace(); tick(state, { ...idle, throttle: 1 }, 2);
    expect(state.speed).toBeGreaterThan(20); expect(state.distance).toBeGreaterThan(20);
    state.speed = VILLA_RACE_MAX_SPEED; advanceVillaRace(state, { ...idle, throttle: 1 }, .1);
    expect(state.speed).toBeLessThanOrEqual(VILLA_RACE_MAX_SPEED);
  });
  it('coasts; S service brake is stronger than Space handbrake, neither reverses', () => {
    const coast = createVillaRace(), space = createVillaRace(), s = createVillaRace();
    coast.speed = space.speed = s.speed = 30;
    tick(coast); tick(space, { ...idle, throttle: 1, brake: true }); tick(s, { ...idle, throttle: -1 });
    expect(coast.speed).toBeLessThan(30); expect(coast.speed).toBeGreaterThan(20);
    expect(space.speed).toBeGreaterThan(s.speed); expect(space.speed).toBeLessThan(10); expect(s.speed).toBe(0);
    tick(space, { ...idle, brake: true }); expect(space.speed).toBe(0);
    const distance = s.distance; tick(s, { ...idle, throttle: -1 }); expect(s.distance).toBe(distance);
  });
  it('smooths analog left/right/release and only moves laterally while moving', () => {
    const left = createVillaRace(), right = createVillaRace(), stopped = createVillaRace();
    left.speed = right.speed = 20;
    tick(left, { ...idle, steer: -.5 }, .25); tick(right, { ...idle, steer: .5 }, .25);
    tick(stopped, { ...idle, steer: 1 });
    expect(left.lane).toBeLessThan(0); expect(right.lane).toBeGreaterThan(0);
    expect(right.steer).toBeGreaterThan(.4); expect(right.steer).toBeLessThan(.5); expect(left.steer).toBeCloseTo(-right.steer);
    expect(stopped.lane).toBe(0); const previous = right.steer;
    advanceVillaRace(right, idle, 1 / 120); expect(right.steer).toBeGreaterThan(0); expect(right.steer).toBeLessThan(previous);
    tick(right, idle); expect(right.steer).toBeLessThan(.001);
  });
  it('handbrake releases rear grip to rotate more tightly than service braking', () => {
    const hand = createVillaRace(), service = createVillaRace();
    hand.speed = service.speed = 25; hand.steer = service.steer = .5;
    tick(hand, { throttle: 0, steer: .5, brake: true }, .15);
    tick(service, { throttle: -1, steer: .5, brake: false }, .15);
    expect(hand.lane).toBeGreaterThan(service.lane);
    expect(hand.speed).toBeLessThan(25); expect(service.speed).toBeLessThan(25);
  });
  it('curves push outward and dirt shoulders slow travel', () => {
    const road = createVillaRace(), verge = createVillaRace();
    road.distance = verge.distance = 80; road.speed = verge.speed = 30; verge.lane = 1.1;
    expect(villaRallyCurvature(80)).toBeGreaterThan(0);
    tick(road, idle, .1); tick(verge, idle, .1);
    expect(road.lane).toBeLessThan(0); expect(verge.speed).toBeLessThan(road.speed);
  });
  it('sweeps rock impacts without tunnelling and allows passing safely on later runs', () => {
    for (const lap of [0, 1]) {
      const safe = createVillaRace(), hit = createVillaRace(); const rock = hit.obstacles[0]!;
      safe.distance = hit.distance = lap * VILLA_RACE_LAP_LENGTH + rock.distance - 1;
      safe.speed = hit.speed = 60; safe.lane = 0; hit.lane = rock.lane;
      advanceVillaRace(safe, idle, .1); advanceVillaRace(hit, idle, .1);
      expect(safe.crashes).toBe(0); expect(hit.crashes).toBe(1); expect(hit.speed).toBeLessThan(25);
      tick(hit, { ...idle, brake: true }, 2); expect(hit.crashes).toBe(1); expect(hit.crashTimer).toBe(0);
    }
  });
  it('contains lateral travel and debounces boundary impacts', () => {
    const state = createVillaRace(); state.lane = 1.27; state.speed = 40; state.steer = 1;
    tick(state, { ...idle, steer: 1, throttle: 1 }, .25);
    expect(state.crashes).toBe(1); expect(state.lane).toBeLessThanOrEqual(1.3);
  });
  it('counts 600m splits, completed stage runs and best stage time', () => {
    const state = createVillaRace(); state.distance = 599; state.speed = 30;
    advanceVillaRace(state, idle, .1); expect(state.checkpoint).toBe(1);
    state.distance = VILLA_RACE_LAP_LENGTH - 1; state.lapTime = 70;
    advanceVillaRace(state, idle, .1);
    expect(state.laps).toBe(1); expect(state.checkpoint).toBe(4);
    expect(state.bestLap).toBeGreaterThanOrEqual(70); expect(state.lapTime).toBeLessThan(.1);
    state.distance = VILLA_RACE_LAP_LENGTH * 2 - 1; state.lapTime = 65;
    advanceVillaRace(state, idle, .1); expect(state.laps).toBe(2); expect(state.bestLap).toBeLessThan(66);
  });
  it('ignores invalid dt, caps stalls, sanitizes input and substeps deterministically', () => {
    const state = createVillaRace(), original = structuredClone(state);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) advanceVillaRace(state, { ...idle, throttle: 1 }, dt);
    expect(state).toEqual(original);
    advanceVillaRace(state, { throttle: NaN, steer: Infinity, brake: false }, .1);
    expect(state.speed).toBe(0); expect(state.steer).toBe(0);
    const capped = createVillaRace(), normal = createVillaRace(), fine = createVillaRace();
    advanceVillaRace(capped, { ...idle, throttle: 4, steer: -5 }, 99);
    advanceVillaRace(normal, { ...idle, throttle: 1, steer: -1 }, .25);
    tick(fine, { ...idle, throttle: 1, steer: -1 }, .25);
    expect(capped).toEqual(normal); expect(fine).toEqual(normal);
  });
  it('stays finite and bounded over a long deterministic session', () => {
    const a = createVillaRace(), b = createVillaRace();
    for (let i = 0; i < 2400; i++) {
      const input = { throttle: i % 50 < 40 ? 1 : -1, steer: Math.sin(i * .02), brake: i % 97 < 7 };
      advanceVillaRace(a, input, .25); advanceVillaRace(b, input, .25);
      expect(a.speed).toBeGreaterThanOrEqual(0); expect(a.speed).toBeLessThanOrEqual(60); expect(Math.abs(a.lane)).toBeLessThanOrEqual(1.3);
      expect(Number.isFinite(a.distance)).toBe(true);
    }
    expect(a).toEqual(b);
  });
  it('draws gravel, stage feedback and safe finite hill projections without mutation', () => {
    for (const distance of [0, 100, 550, 1100, 1800, 2399]) {
      const state = createVillaRace(); state.distance = distance; const before = structuredClone(state), draw = drawing();
      drawVillaRace(draw.ctx, 960, 540, state); expect(state).toEqual(before);
      expect(draw.labels).toContain('Pine Ridge · Gravel rally');
      expect(draw.labels.some(label => label.includes('Space handbrake'))).toBe(true);
      expect(draw.labels.some(label => /cone|Coastal|score/i.test(label))).toBe(false);
      expect(draw.coordinates.every(Number.isFinite)).toBe(true);
      expect(draw.colors).toContain('#b7a080'); expect(draw.colors).not.toContain('#475259');
      for (const font of draw.fonts) expect(Number(/([\d.]+)px/.exec(font)?.[1])).toBeLessThanOrEqual(56);
    }
  });
});

describe('Villa rig driver-view steering', () => {
  it('projects right clockwise and left anticlockwise from the actual +Z-facing seat, matching the screen', () => {
    const root = new THREE.Group(), rig = createVillaRallyWheel(root);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .01, 100);
    camera.position.set(VILLA_RACING.seat.x, VILLA_RACING.seat.y + VILLA_RACING.eyeHeight, VILLA_RACING.seat.z);
    camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 1))); camera.updateMatrixWorld(true);
    const projectedMarker = (steer: number) => {
      rig.setSteer(steer); root.updateMatrixWorld(true);
      const center = rig.spin.getWorldPosition(new THREE.Vector3()).project(camera);
      const point = rig.marker.getWorldPosition(new THREE.Vector3()).project(camera);
      return new THREE.Vector2(point.x - center.x, point.y - center.y);
    };
    const neutral = projectedMarker(0), right = projectedMarker(.65), left = projectedMarker(-.65);
    expect(neutral.y).toBeGreaterThan(0); expect(neutral.x).toBeCloseTo(0);
    // In NDC, +X right / +Y up; a clockwise top-marker displacement is right.
    expect(right.x).toBeGreaterThan(0); expect(left.x).toBeLessThan(0);
    expect(neutral.cross(right)).toBeLessThan(0); expect(neutral.cross(left)).toBeGreaterThan(0);
    expect(rig.mount.rotation.z).toBe(0); expect(rig.mount.rotation.x).toBe(.25);
    const state = createVillaRace(); tick(state, { ...idle, steer: .65 }, .25);
    rig.setSteer(state.steer); const draw = drawing(); drawVillaRace(draw.ctx, 960, 540, state);
    expect(draw.rotations).toContain(state.steer * VILLA_RACE_WHEEL_TURN);
    expect(rig.spin.rotation.z).toBe(state.steer * VILLA_RACE_WHEEL_TURN);
    tick(state, idle, 1); rig.setSteer(state.steer); expect(Math.abs(rig.spin.rotation.z)).toBeLessThan(.001);
    root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach(m => m.dispose()); } });
  });
});
