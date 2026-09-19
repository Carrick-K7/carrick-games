import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { advanceVillaDriving, createVillaDriving, VILLA_CAR_LIMITS, villaDrivingPoseBlocked, villaDrivingSteerLimit } from '../src/villaDriving.js';
import { advanceVillaPickup, createVillaPickup, VILLA_PICKUP_LIMITS, villaPickupPoseBlocked } from '../src/villaPickup.js';
import { advanceVillaSuv, createVillaSuv, VILLA_SUV_LIMITS, villaSuvPoseBlocked } from '../src/villaSuv.js';
import { moveVillaPlayer, villaSupportAt, villaCollides, VILLA_WALL_COLLIDERS, VILLA_RAILS, type VillaCollider, type VillaPosition } from '../src/villaWorld.js';
import { villaTerrainHeight, villaTerrainGroundHeight } from '../src/villaEstateLayout.js';
import { VILLA_STREAM_BRIDGE, villaStreamContains, villaStreamSectionAt } from '../src/villaStream.js';
import { createVillaStreamModel } from '../src/villaStreamModel.js';
import { furnishVilla } from '../src/villaFurnishings.js';
import { VILLA_BEDS } from '../src/villaSeating.js';
import { VILLA_MASTER_VANITY } from '../src/villaBedroomLayout.js';

const cars = [
  { id: 'car', create: createVillaDriving, advance: advanceVillaDriving, blocked: villaDrivingPoseBlocked, limits: VILLA_CAR_LIMITS, kph: 180 },
  { id: 'pickup', create: createVillaPickup, advance: advanceVillaPickup, blocked: villaPickupPoseBlocked, limits: VILLA_PICKUP_LIMITS, kph: 140 },
  { id: 'suv', create: createVillaSuv, advance: advanceVillaSuv, blocked: villaSuvPoseBlocked, limits: VILLA_SUV_LIMITS, kph: 160 },
];
const throttle = { throttle: 1, steer: 0, brake: false };
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); for (const m of Array.isArray(n.material) ? n.material : [n.material]) materials.add(m); } });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); }); textures.forEach(t => t.dispose()); root.clear();
}

describe('manual road speed beyond the former25km/h limit', () => {
  it.each(cars)('$id accelerates physically beyond50km/h while retaining its real top speed', car => {
    const state = { ...car.create(), x: 55, z: -15 };
    for (let i = 0; i < 300; i++) car.advance(state, throttle, 1 / 60, []);
    expect(state.speed * 3.6).toBeGreaterThan(49); expect(state.z).toBeGreaterThan(18);
    expect(state.collisions).toBe(0); expect(car.limits.maxSpeed * 3.6).toBeCloseTo(car.kph);
    Object.assign(state, { x: 55, z: 15, speed: car.limits.maxSpeed });
    car.advance(state, throttle, .25, []); expect(state.speed).toBeCloseTo(car.limits.maxSpeed);
    expect(state.z - 15).toBeCloseTo(car.limits.maxSpeed * .25, 4);
  });
  it.each(cars)('$id cannot jump through a2cm barrier at full speed with the largest accepted tick', car => {
    const state = { ...car.create(), x: 55, z: 45, speed: car.limits.maxSpeed };
    const barrier = { minX: 52, maxX: 58, minZ: 50, maxZ: 50.02, minY: -1, maxY: 4 };
    car.advance(state, throttle, .25, [barrier]);
    expect(state.contact).toBe(true); expect(state.collisions).toBe(1); expect(state.speed).toBe(0);
    expect(state.z + car.limits.halfLength).toBeLessThanOrEqual(50.002);
    expect(state.z).toBeGreaterThan(45);
  });
  it('retains parking lock but bounds high-speed lateral curvature and brakes without reversing', () => {
    expect(villaDrivingSteerLimit(5)).toBe(VILLA_CAR_LIMITS.maxSteer);
    expect(villaDrivingSteerLimit(40)).toBeLessThan(.02);
    const state = { ...createVillaDriving(), x: 50, z: 25, speed: 40 };
    advanceVillaDriving(state, { ...throttle, steer: 1 }, .20, []);
    expect(Math.abs(state.yaw)).toBeLessThan(.05); expect(Math.abs(state.steering)).toBeLessThan(.02);
    for (let i = 0; i < 360; i++) advanceVillaDriving(state, { throttle: 1, steer: 0, brake: true }, 1 / 60, []);
    expect(state.speed).toBe(0); expect(state.collisions).toBe(0);
  });
});

describe('integrated north stream and real bridge support', () => {
  const root = new THREE.Group(), bridge = createVillaStreamModel(root);
  afterAll(() => dispose(root));
  it('walks continuously across both3m ramps and timber deck without walking on water', () => {
    let p = { x: 0, y: 0, z: -29 }, reachedDeck = false;
    for (let i = 0; i < 220; i++) {
      const previous = p; p = moveVillaPlayer(p, 0, -.09, bridge.colliders, undefined, 1.75);
      expect(p.z).toBeLessThan(previous.z); expect(Math.abs(p.y - previous.y)).toBeLessThan(.01);
      if (p.z < -35 && p.z > -41) { reachedDeck = true; expect(p.y).toBeCloseTo(.08); }
    }
    expect(reachedDeck).toBe(true); expect(p.z).toBeLessThan(-48); expect(p.y).toBe(0);
    expect(villaTerrainGroundHeight(0, -38)).toBeLessThan(-.4);
    expect(villaTerrainHeight(0, -38)).toBe(VILLA_STREAM_BRIDGE.deckY);
  });
  it('blocks walking and vehicle footprints at the actual stream while keeping dry banks supported', () => {
    const s = villaStreamSectionAt(12)!;
    expect(villaSupportAt(12, s.z, 0)).toBeNull();
    const start = { x: 12, y: 0, z: s.z + s.halfWidth + 2 };
    const stopped = moveVillaPlayer(start, 0, -8, bridge.colliders);
    expect(stopped.z).toBeGreaterThan(s.z + s.halfWidth);
    expect(villaStreamContains(stopped.x, stopped.z, .23)).toBe(false);
    expect(villaSupportAt(stopped.x, stopped.z, stopped.y)).not.toBeNull();
    for (const car of cars) expect(car.blocked({ x: 12, z: s.z, yaw: Math.PI }, bridge.colliders)).toBe(true);
  });
  it.each(cars)('$id crosses the supported bridge without colliding with rails or water', car => {
    const state = { ...car.create(), x: 0, z: -29, yaw: Math.PI };
    for (let i = 0; i < 1200 && state.z > -47; i++) car.advance(state, { ...throttle, throttle: .20 }, 1 / 60, bridge.colliders);
    expect(state.z).toBeLessThanOrEqual(-47); expect(state.collisions).toBe(0);
    expect(car.blocked(state, bridge.colliders)).toBe(false); expect(villaTerrainHeight(state.x, state.z)).toBe(0);
  });
});

describe('bedroom circulation in the fully furnished plan', () => {
  const scene = new THREE.Scene(); let obstacles: VillaCollider[];
  beforeAll(() => {
    const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
    try { obstacles = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...furnishVilla(scene).colliders]; }
    finally { vi.unstubAllGlobals(); }
  });
  afterAll(() => dispose(scene));
  const walk = (from: VillaPosition, x: number, z: number) => {
    const p = moveVillaPlayer(from, x - from.x, z - from.z, obstacles, undefined, 1.75);
    expect(p.x, `route ${JSON.stringify(from)} -> ${x},${z}`).toBeCloseTo(x, 5); expect(p.z).toBeCloseTo(z, 5); return p;
  };
  it('keeps the entire guest entrance vestibule free of the bed, desk and chairs', () => {
    for (const z of [-16, -15.4, -14.7, -14.0]) {
      const start = { x: -2.9, y: 3.6, z };
      const p = walk(start, -6.5, z); walk(p, start.x, start.z);
    }
    walk({ x: -2.9, y: 3.6, z: -14.7 }, -17.5, -14.7);
    walk({ x: -17, y: 3.6, z: -7.4 }, -17, -10.5);
    expect(VILLA_BEDS[1].origin.x).toBeLessThan(-20);
  });
  it('walks from the master entry to the wider wall-side vanity and back to the balcony', () => {
    let p = { x: -3.4, y: 3.6, z: 2.6 };
    for (const [x, z] of [[-13.05, 2.6], [-13.05, 6.15], [-22.1, 6.15], [-22.1, 2.45], [-22.1, 8.1], [-7.3, 8.1], [-7.3, 10]]) p = walk(p, x, z);
    expect(p.y).toBeCloseTo(3.6); expect(VILLA_MASTER_VANITY.width).toBe(3.2);
    expect(villaCollides({ x: -22.1, y: 3.6, z: 2.45 }, obstacles, 1.75)).toBe(false);
  });
});
