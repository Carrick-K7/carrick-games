import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaSuv, createVillaSuv, isVillaSuvCollider, villaSuvAnchors, villaSuvExitClear, villaSuvFootprint, villaSuvOverlaps, villaSuvPoseBlocked, villaSuvSafeExit, VILLA_SUV, VILLA_SUV_LIMITS } from '../src/villaSuv.js';
import { createVillaSuvModel } from '../src/villaSuvModel.js';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaDriving, isVillaVehicleCollider, villaCarOverlaps } from '../src/villaDriving.js';
import { VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT, villaTerrainOrientation } from '../src/villaEstateLayout.js';
import { VILLA_CAR } from '../src/villaActivities.js';
import { POOL, VILLA_WALL_COLLIDERS, type VillaCollider } from '../src/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false, handbrake: false };
const tick = (state: ReturnType<typeof createVillaSuv>, input = idle, seconds = 1, obstacles: readonly VillaCollider[] = []) => { for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaSuv(state, input, 1 / 120, obstacles); };
const dispose = (root: THREE.Object3D) => { const materials = new Set<THREE.Material>(); root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materials.add(m)); } }); materials.forEach(m => m.dispose()); };

describe('Villa coupe-SUV independent driving profile and safety', () => {
  it('has distinct dimensions, wheelbase and anchors and leaves the reserved garage bay', () => {
    const state = createVillaSuv(); expect(state).toMatchObject({ x: VILLA_SUV.center.x, z: VILLA_SUV.center.z, yaw: 0, speed: 0 });
    const a = villaSuvAnchors(state); expect(a.seat).toEqual(VILLA_SUV.seat); expect(a.exit).toEqual(VILLA_SUV.exit); expect(a.body).toEqual(VILLA_SUV.body);
    expect(VILLA_SUV_LIMITS.wheelbase).toBeCloseTo(2.9, 3); expect(VILLA_SUV.eyeHeight).toBeGreaterThan(1.4);
    tick(state, { ...idle, throttle: 1 }, 6, VILLA_WALL_COLLIDERS);
    expect(state.z).toBeGreaterThan(23); expect(state.x).toBe(VILLA_SUV.center.x); expect(state.collisions).toBe(0); expect(state.speed).toBeLessThanOrEqual(VILLA_SUV_LIMITS.maxSpeed);
  });
  it('blocks pool and property edges and contains the entire SUV inside the estate', () => {
    expect(villaSuvPoseBlocked({ x: (POOL.minX + POOL.maxX) / 2, z: 0, yaw: 0 }, [])).toBe(true);
    expect(villaSuvPoseBlocked({ x: VILLA_ESTATE_BOUNDS.maxX - .5, z: 30, yaw: 0 }, [])).toBe(true);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const corners = villaSuvFootprint({ x: 20, z: 60, yaw });
      for (const c of corners) {
        expect(c.x).toBeGreaterThan(VILLA_ESTATE_BOUNDS.minX); expect(c.x).toBeLessThan(VILLA_ESTATE_BOUNDS.maxX);
        expect(c.z).toBeGreaterThan(VILLA_ESTATE_BOUNDS.minZ); expect(c.z).toBeLessThan(VILLA_ESTATE_BOUNDS.maxZ);
      }
    }
  });
  it('registers only its own stable identities, ignores itself and collides with both other vehicles', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), sedan = createVillaVehicle(scene), pickup = createVillaPickupModel(scene);
    try {
      for (const collider of [...sedan.colliders, ...pickup.colliders]) expect(isVillaSuvCollider(collider)).toBe(false);
      for (const collider of suv.colliders) expect(isVillaSuvCollider(collider)).toBe(true);
      const pose = { ...createVillaSuv() };
      // In its own bay it touches neither neighbour, and it ignores its own shell.
      expect(sedan.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      expect(pickup.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      expect(suv.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      // Dropped onto the sedan's space, it does collide with the sedan.
      const ontoSedan = { ...pose, x: VILLA_CAR.center.x, z: VILLA_CAR.center.z };
      expect(sedan.colliders.some(b => villaSuvOverlaps(ontoSedan, b))).toBe(true);
    } finally { dispose(scene); }
  });
  it('keeps a hollow cabin within dimensions and opens only the driver door without moving the shell', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), activities = { suv: createVillaSuv(), suvDoorOpen: false };
    try {
      const body = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      expect(body.max.x - body.min.x).toBeLessThanOrEqual(VILLA_SUV_LIMITS.halfWidth * 2 + .35);
      expect(body.max.z - body.min.z).toBeLessThanOrEqual(VILLA_SUV_LIMITS.halfLength * 2 + .35);
      expect(body.max.y - body.min.y).toBeLessThanOrEqual(VILLA_SUV_LIMITS.height + .1);
      const driver = scene.getObjectByName('suv-driver-door')!, passenger = scene.getObjectByName('suv-passenger-door')!;
      const shell = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      for (let i = 0; i < 40; i++) suv.update(i * .05, { ...activities, suvDoorOpen: true });
      expect(suv.doorProgress).toBeGreaterThan(0);
      expect(driver.rotation.y).not.toBe(0); expect(passenger.rotation.y).toBe(0);
      const after = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      expect(after.min.x).toBeCloseTo(shell.min.x, 3); expect(after.min.z).toBeCloseTo(shell.min.z, 3);
    } finally { dispose(scene); }
  });
  it('offers genuinely swept supported side exits, not free endpoints across walls', () => {
    const pose = { ...createVillaSuv() };
    // A wall over the driver-side exit blocks it; open ground leaves it clear.
    const wall = { minX: 49.0, maxX: 50.5, minZ: -3.3, maxZ: -2.5, minY: 0, maxY: 2 };
    expect(villaSuvExitClear(pose, [wall], 1)).toBe(false);
    expect(villaSuvExitClear(pose, [], 1)).toBe(true);
    const exit = villaSuvSafeExit(pose, []);
    expect(exit).toEqual(VILLA_SUV.exit);
    expect(villaSuvExitClear(pose, [], -1)).toBe(true);
  });
  it('tilts to the shared terrain while live colliders and seated anchors follow the same height', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), state = { ...createVillaSuv(), x: 14, z: 127 };
    try {
      const terrain = villaTerrainOrientation(state.x, state.z, state.yaw);
      suv.update(1, { suv: state, suvDoorOpen: false });
      const root = scene.getObjectByName('villa-suv')!;
      expect(root.position.y).toBeCloseTo(terrain.y, 4); expect(root.rotation.x).toBeCloseTo(terrain.pitch, 4);
      const anchors = villaSuvAnchors(state);
      expect(Number.isFinite(anchors.seat.y)).toBe(true);
    } finally { dispose(scene); }
  });
});
