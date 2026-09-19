import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaPark, createVillaParkRun, villaParkBay, villaParkRoute, villaVehicleParked, VILLA_PARK_CRUISE } from '../src/villaAutopilot.js';
import { advanceVillaDriving, createVillaDriving, VILLA_CAR_LIMITS } from '../src/villaDriving.js';
import { advanceVillaPickup, createVillaPickup, VILLA_PICKUP_LIMITS } from '../src/villaPickup.js';
import { advanceVillaSuv, createVillaSuv, VILLA_SUV_LIMITS } from '../src/villaSuv.js';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import type { VillaCollider } from '../src/villaWorld.js';

const profiles = [
  { id: 'car' as const, create: createVillaDriving, advance: advanceVillaDriving, limits: VILLA_CAR_LIMITS },
  { id: 'pickup' as const, create: createVillaPickup, advance: advanceVillaPickup, limits: VILLA_PICKUP_LIMITS },
  { id: 'suv' as const, create: createVillaSuv, advance: advanceVillaSuv, limits: VILLA_SUV_LIMITS },
];
const scene = new THREE.Group();
let obstacles: VillaCollider[];
beforeAll(() => { obstacles = createVillaEstateModel(scene).colliders; });
afterAll(() => {
  const materials = new Set<THREE.Material>();
  scene.traverse(node => {
    if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); }
  });
  materials.forEach(m => m.dispose());
});

describe.each(profiles)('$id automatic parking with the real high-speed drivetrain', profile => {
  it.each([30, 60, 120])('converges without teleports or gear chatter at %i Hz, retaining all real collision checks', hz => {
    // East link originally timed out: its legal road first leads away from home.
    // Driveway/apron cases exercise projected final alignment and a direction
    // change where the outbound and return segments geometrically overlap.
    const starts = [{ x: 40, z: 26, yaw: 2.6 }, { x: 34, z: 20, yaw: 0 }, { x: 31, z: 9, yaw: .6 }];
    for (const start of starts) {
      const state = { ...profile.create(), ...start }, run = createVillaParkRun(), dt = 1 / hz;
      run.active = true; run.points = villaParkRoute(profile.id, state);
      let arrived = false, index = 0, gears = 0, direction = false, fastest = 0;
      for (let step = 0; step < hz * 300; step++) {
        const before = { ...state }, control = advanceVillaPark(profile.id, state, state.speed, profile.limits, run, dt);
        // Compare the ACTUAL pose/state supplied to the controller on every
        // frame, including arrival: a <5cm assertion cannot hide a final snap.
        expect(state).toEqual(before);
        expect(run.index).toBeGreaterThanOrEqual(index); index = run.index;
        if (run.reversing !== direction) { gears++; direction = run.reversing; }
        expect(run.failed, `${profile.id} ${hz}Hz from ${JSON.stringify(start)}`).toBe('');
        expect(Math.abs(control.input.throttle)).toBeLessThanOrEqual(.35);
        profile.advance(state, control.input, dt, obstacles);
        const moved = Math.hypot(state.x - before.x, state.z - before.z);
        expect(moved).toBeLessThanOrEqual(Math.max(Math.abs(before.speed), Math.abs(state.speed)) * dt + .00001);
        expect(state.collisions).toBe(0); fastest = Math.max(fastest, Math.abs(state.speed));
        if (control.arrived) { arrived = true; break; }
      }
      expect(arrived).toBe(true); expect(villaVehicleParked(profile.id, state)).toBe(true);
      const bay = villaParkBay(profile.id);
      expect(Math.hypot(state.x - bay.x, state.z - bay.z)).toBeLessThan(.05);
      expect(Math.abs(state.speed)).toBeLessThan(.08);
      expect(fastest).toBeLessThan(VILLA_PARK_CRUISE + .1);
      expect(gears).toBeLessThan(8);
    }
  });
});

it('keeps legitimate away-from-bay road travel progressing instead of cancelling reverse on a timer', () => {
  const state = { ...createVillaDriving(), x: 40, z: 26, yaw: 2.6 }, run = createVillaParkRun();
  run.active = true; run.points = villaParkRoute('car', state);
  const bay = villaParkBay('car'), startDistance = Math.hypot(state.x - bay.x, state.z - bay.z);
  let firstRemaining = Infinity;
  for (let step = 0; step < 60 * 12; step++) {
    const control = advanceVillaPark('car', state, state.speed, VILLA_CAR_LIMITS, run, 1 / 60);
    if (!step) firstRemaining = run.best;
    advanceVillaDriving(state, control.input, 1 / 60, obstacles);
  }
  expect(Math.hypot(state.x - bay.x, state.z - bay.z)).toBeGreaterThan(startDistance + 10);
  expect(run.index).toBeGreaterThan(8); expect(run.best).toBeLessThan(firstRemaining - 12);
  expect(run.noProgress).toBeLessThan(.5); expect(run.reversing).toBe(true); expect(run.failed).toBe('');
});

it('reports a truly blocked drivetrain within the unchanged six-second watchdog and never nudges its pose', () => {
  const state = { ...createVillaDriving(), x: 34, z: 20, yaw: 0 }, run = createVillaParkRun();
  run.active = true; run.points = villaParkRoute('car', state);
  const before = { ...state };
  for (let step = 0; step < 60 * 7 && !run.failed; step++) advanceVillaPark('car', state, 0, VILLA_CAR_LIMITS, run, 1 / 60);
  expect(run.failed).toBe('blocked'); expect(run.elapsed).toBeLessThan(6.1); expect(state).toEqual(before);
});

it('returns a stationary command for an invalid clock without changing run or vehicle state', () => {
  const state = { ...createVillaDriving(), x: 40, z: 26, yaw: 2.6 }, run = createVillaParkRun();
  run.active = true; run.points = villaParkRoute('car', state);
  const before = structuredClone(run), pose = { ...state };
  for (const dt of [0, -1, NaN, Infinity]) {
    expect(advanceVillaPark('car', state, 0, VILLA_CAR_LIMITS, run, dt).input.handbrake).toBe(true);
    expect(run).toEqual(before); expect(state).toEqual(pose);
  }
});
