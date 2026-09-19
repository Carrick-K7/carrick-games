import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { furnishVilla } from '../src/villaFurnishings.js';
import { createVillaGarden, VILLA_GARDEN_TREES } from '../src/villaGarden.js';
import { VILLA_RELAX_SEATS } from '../src/villaSeating.js';
import { VILLA_WALL_COLLIDERS, VILLA_RAILS, VILLA_ROOMS, villaCollides, villaRoomAt, moveVillaPlayer, type VillaPosition } from '../src/villaWorld.js';
import { VILLA_HOME_LIGHTS, VILLA_SECURITY_CAMERAS } from '../src/villaHome.js';
import { POOL, VILLA_GARAGE_EXTENT } from '../src/villaEstateLayout.js';
import { createVillaBathDoors } from '../src/villaBathDoors.js';
import { createVillaWardrobes } from '../src/villaWardrobe.js';

const scene = new THREE.Scene();
let furniture: ReturnType<typeof furnishVilla>, garden: ReturnType<typeof createVillaGarden>;
const base = () => ({ evening: false, fireplace: false, gaming: true, fedUntil: 0, bathDoors: createVillaBathDoors(), grillLids: [false, false, false] });
let meshes: THREE.Mesh[];
beforeAll(() => {
  const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
  try { furniture = furnishVilla(scene); garden = createVillaGarden(scene); }
  finally { vi.unstubAllGlobals(); }
  scene.updateMatrixWorld(true); meshes = [];
  scene.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
});
beforeEach(() => { furniture.update(0, base()); scene.updateMatrixWorld(true); });
afterAll(() => {
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
  scene.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m); } });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); scene.clear();
});
const hits = (from: [number, number, number], direction: [number, number, number], far: number) =>
  new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false);
const obstacles = () => [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...furniture.colliders, ...garden.colliders];
const walk = (from: VillaPosition, x: number, z: number) => {
  const result = moveVillaPlayer(from, x - from.x, z - from.z, obstacles(), undefined, 1.75);
  expect(result.x, `route ${JSON.stringify(from)} -> ${x},${z}`).toBeCloseTo(x, 4);
  expect(result.z).toBeCloseTo(z, 4);
  return result;
};

describe('whole-map renovation acceptance: real geometry and live collision', () => {
  it('maps renamed rooms and switched fixtures to the same floor and zone', () => {
    for (const id of ['tea-room', 'reading-hall', 'massage', 'wardrobe', 'ensuite', 'guest', 'master']) {
      const room = VILLA_ROOMS.find(room => room.id === id)!;
      expect(room).toBeDefined();
      const lights = VILLA_HOME_LIGHTS.find(light => light.id === id)!;
      expect(lights).toBeDefined();
      for (const p of lights.fixtures) expect(villaRoomAt({ ...p, y: room.floor * 3.6 }).id).toBe(id);
    }
    expect(VILLA_ROOMS.some(room => ['family', 'studio', 'playroom', 'east-suite'].includes(room.id))).toBe(false);
    for (const [id, bounds] of [['pool', POOL], ['garage', VILLA_GARAGE_EXTENT]] as const) {
      const target = VILLA_SECURITY_CAMERAS.find(camera => camera.id === id)!.target;
      expect(target.x).toBeGreaterThan(bounds.minX); expect(target.x).toBeLessThan(bounds.maxX);
      expect(target.z).toBeGreaterThan(bounds.minZ); expect(target.z).toBeLessThan(bounds.maxZ);
    }
  });
  it('really leaves the ground-floor lounge empty, with no forgotten storage collider', () => {
    const contents = furniture.colliders.filter(c => c.minY < 2 && c.maxY > 0
      && c.minX > 17.11 && c.maxX < 28.1 && c.minZ > -8.89 && c.maxZ < 8.89);
    expect(contents).toEqual([]);
    walk({ x: 18, y: 0, z: -5.6 }, 27, -5.6);
  });
  it('places the shower head on 2F and exposes tub water above its opaque basin floor', () => {
    const head = hits([16.05, 6.4, -7.85], [0, -1, 0], 1)[0];
    expect(head).toBeDefined(); expect(head.point.y).toBeGreaterThan(5.8); expect(head.point.y).toBeLessThan(5.95);
    expect(hits([16.05, 2.5, -7.85], [0, -1, 0], .7)).toHaveLength(0);
    const water = hits([11.4, 5.2, -4.4], [0, -1, 0], 1.6)[0];
    expect(water).toBeDefined(); expect(water.point.y).toBeCloseTo(3.9225, 3);
    const tub = furniture.colliders.find(c => Math.abs(c.minX - 10.175) < .001 && Math.abs(c.minZ + 6.6) < .001)!;
    expect(tub.maxX - tub.minX).toBeCloseTo(2.45); expect(tub.maxZ - tub.minZ).toBeCloseTo(4.4);
  });
  it('keeps the guest/dressing doorway and ensuite cross-aisle physically open', () => {
    walk({ x: -17, y: 3.6, z: -7.3 }, -17, -10.1);
    walk({ x: -14.4, y: 3.6, z: -4.9 }, -11.9, -4.9);
    // A visual-only cabinet could pass collision tests: raycast the actual models too.
    expect(hits([-17, 5, -7.3], [0, 0, -1], 3)).toHaveLength(0);
    expect(scene.getObjectByName('suite/double-vanity')).toBeDefined();
    expect(scene.getObjectByName('suite/toilet')).toBeDefined();
    expect(scene.getObjectByName('suite/ensuite-shower')).toBeDefined();
  });
  it('has two real closable bath doors and no shelving across either entrance', () => {
    const west = { x: 6.8, y: 3.6, z: -4.8 }, east = { x: 18.2, y: 3.6, z: -2 };
    expect(moveVillaPlayer(west, 2.4, 0, obstacles(), undefined, 1.75).x).toBeLessThan(8.2);
    expect(moveVillaPlayer(east, -2.4, 0, obstacles(), undefined, 1.75).x).toBeGreaterThan(16.8);
    const state = base(); Object.assign(state.bathDoors, { west: true, east: true, progressW: 1, progressE: 1 });
    furniture.update(1, state);
    walk(west, 9.2, -4.8); walk(east, 15.8, -2);
    walk({ x: 21.5, y: 3.6, z: -7 }, 21.5, -10.1);
    const vanity = furniture.colliders.find(c => Math.abs((c.minX + c.maxX) / 2 - 13.7) < .01 && c.maxY < 5)!;
    expect(vanity.maxX).toBeLessThan(14.85); // clear of the fully open far leaf
  });
  it('rests three distinct grill lids at their own hinges and resets all animations', () => {
    const lids = [1, 2, 3].map(i => scene.getObjectByName(`roof-grill-lid-${i}`)!);
    expect(lids.every(Boolean)).toBe(true);
    for (const lid of lids) { const box = new THREE.Box3().setFromObject(lid); expect(box.min.y).toBeGreaterThan(8.1); expect(box.max.y).toBeLessThan(8.4); }
    const state = base(); state.grillLids = [true, false, true];
    for (let i = 1; i <= 20; i++) furniture.update(i * .05, state);
    expect(lids[0].rotation.x).toBeCloseTo(-1.25); expect(lids[1].rotation.x).toBe(0); expect(lids[2].rotation.x).toBeCloseTo(-1.25);
    furniture.update(0, base()); expect(lids.map(lid => lid.rotation.x)).toEqual([0, 0, 0]);
  });
  it('updates simultaneous wardrobe/fridge/door changes without OR short-circuiting', () => {
    const state = { ...base(), wardrobes: createVillaWardrobes() };
    for (const item of Object.values(state.wardrobes.wardrobes)) { item.open = true; item.progress = .5; }
    state.bathDoors.progressW = .5;
    expect(furniture.update(1, state)).toBe(true);
    // Every independent updater consumed the same state on the first call.
    expect(furniture.update(1, state)).toBe(false);
  });
  it('keeps the low-profile vacuum on a clear first-floor loop and returns it to its dock', () => {
    const robot = scene.getObjectByName('robot-vacuum')!;
    for (let t = 0; t <= 80; t += .25) {
      furniture.update(t, base()); scene.updateMatrixWorld(true);
      expect(robot.position.y).toBe(0);
      // Precise vertices, not the rotated bounding cube of a circular body.
      const size = new THREE.Box3().setFromObject(robot, true).getSize(new THREE.Vector3());
      expect(size.y).toBeLessThan(.10); expect(size.x).toBeLessThan(.45);
      expect(villaCollides(robot.position, obstacles(), .10), `robot cleaning at ${t}`).toBe(false);
    }
    expect(robot.position.x).toBe(4.45); expect(robot.position.z).toBe(-7.85);
  });
  it('keeps botanical trunks out of both pool loungers and their stand-up points', () => {
    for (const seat of VILLA_RELAX_SEATS.filter(s => s.kind === 'lounger')) {
      for (const tree of VILLA_GARDEN_TREES) {
        const dx = Math.max(0, Math.abs(tree.x - seat.origin.x) - seat.width / 2);
        const dz = Math.max(0, Math.abs(tree.z - seat.origin.z) - seat.depth / 2);
        expect(Math.hypot(dx, dz), `${tree.species} through ${seat.id}`).toBeGreaterThan(.20);
      }
      for (const point of seat.exits) expect(villaCollides(point, obstacles(), 1.75)).toBe(false);
    }
  });
});
