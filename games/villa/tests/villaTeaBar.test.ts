import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaTeaBar, VILLA_TEA_BAR } from '../src/villaTeaBar';
import { VILLA_AQUARIUM, VILLA_FIREPLACE_WALL } from '../src/villaLivingLayout';
import { advanceVillaTea, createVillaTea, interactVillaTea } from '../src/villaTea';
import { moveVillaPlayer, villaCollides, VILLA_WALL_COLLIDERS, type VillaCollider, type VillaPosition } from '../src/villaWorld';
const scenes: THREE.Scene[] = [];
function make() { const scene = new THREE.Scene(); scenes.push(scene); return { scene, bar: createVillaTeaBar(scene) }; }
afterEach(() => scenes.splice(0).forEach(scene => {
  const materials = new Set<THREE.Material>(); scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  materials.forEach(m => m.dispose()); scene.clear();
}));
const box = (x: number, z: number, w: number, d: number, height: number): VillaCollider => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: height });
const neighbors = [
  box(-10, -0.1, 2.5, 0.42, 3.4), box(-10, 0.35, 2.88, 0.9, 1.61),
  box(VILLA_AQUARIUM.x, VILLA_AQUARIUM.z, VILLA_AQUARIUM.width, VILLA_AQUARIUM.depth, 2.17), box(-8.5, -2.8, 2.8, 1.35, 0.76),
  ...[-9.33, -7.67].flatMap(x => [-3.88, -1.72].map(z => box(x, z, 0.65, 0.68, 1.1))),
  box(-5.2, -5.6, 2.7, 1.43, 1.03), ...[-5.85, -4.55].map(x => box(x, -4.48, 0.54, 0.51, 0.8)),
];
function follow(p: VillaPosition, target: VillaPosition, colliders: VillaCollider[]): VillaPosition {
  let current = { ...p }; const steps = Math.ceil(Math.hypot(target.x - p.x, target.z - p.z) / 0.05);
  for (let i = 0; i < steps; i++) { current = moveVillaPlayer(current, (target.x - p.x) / steps, (target.z - p.z) / steps, colliders); expect(villaCollides(current, colliders)).toBe(false); }
  expect(current.x).toBeCloseTo(target.x, 6); expect(current.z).toBeCloseTo(target.z, 6); return current;
}

describe('fireplace-wall tea bar placement', () => {
  it('aligns its actual back edge to chimney and aquarium, with positive cabinet/wall gaps', () => {
    const { bar } = make(), c = bar.colliders[0];
    expect(VILLA_FIREPLACE_WALL.backZ).toBeCloseTo(-0.31);
    expect(c.minZ).toBeCloseTo(VILLA_FIREPLACE_WALL.backZ);
    expect(VILLA_AQUARIUM.z - VILLA_AQUARIUM.depth / 2).toBeCloseTo(c.minZ);
    expect(c.maxX).toBeCloseTo(-5.95); expect(c.minX).toBeCloseTo(-8.15);
    expect(c.maxZ).toBeCloseTo(0.49); expect(c.minY).toBe(0); expect(c.maxY).toBe(0.95);
    expect(neighbors[2].minX - c.maxX).toBeCloseTo(0.255);
    expect(-2.11 - neighbors[2].maxX).toBeGreaterThan(0.15);
    for (const other of neighbors) expect(c.minX < other.maxX && c.maxX > other.minX && c.minZ < other.maxZ && c.maxZ > other.minZ).toBe(false);
    expect(villaCollides(VILLA_TEA_BAR.approach, [...neighbors, c])).toBe(false);
  });
  it('walks around—not through—the relocated cabinets from kitchen, entrance and the living aisle', () => {
    const { bar } = make(), colliders = [...VILLA_WALL_COLLIDERS, ...neighbors, ...bar.colliders];
    let p = follow({ x: -3, y: 0, z: -7.1 }, { x: -3, y: 0, z: -1.05 }, colliders);
    p = follow(p, { x: -1.25, y: 0, z: -1.05 }, colliders);
    p = follow(p, { x: -1.25, y: 0, z: 1.45 }, colliders);
    p = follow(p, { ...VILLA_TEA_BAR.approach, z: 1.45 }, colliders);
    follow(p, VILLA_TEA_BAR.approach, colliders);
    p = follow({ x: -7.05, y: 0, z: 2.2 }, VILLA_TEA_BAR.approach, colliders);
    follow(p, VILLA_AQUARIUM.approach, colliders);
  });
});

describe('scene-owned persistent tea model', () => {
  it('keeps equipment, hollow cups and all static bounds on the actual south-facing counter', () => {
    const { scene } = make(), root = scene.getObjectByName('villa-tea-bar')!;
    for (const name of ['cabinet', 'stone-counter', 'tea-tray', 'gooseneck-kettle', 'teapot', 'cup-1', 'cup-2', 'tea-canister-1', 'tea-canister-2', 'tea-tools', 'steam']) expect(root.getObjectByName(`tea-bar/${name}`)).toBeTruthy();
    expect(root.getObjectByName('tea-bar/cup-1')!.userData).toMatchObject({ openRim: true, initiallyEmpty: true });
    scene.updateMatrixWorld(true); const bounds = new THREE.Box3(); let meshes = 0;
    root.traverse(o => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) { meshes++; bounds.union(new THREE.Box3().setFromObject(o)); expect(o.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true); } });
    expect(meshes).toBeLessThanOrEqual(11);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-8.151); expect(bounds.max.x).toBeLessThanOrEqual(-5.949);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-0.311); expect(bounds.max.z).toBeLessThanOrEqual(0.491);
    expect(bounds.max.y).toBeGreaterThan(1.3); expect(bounds.max.y).toBeLessThan(1.4);
  });
  it('renders empty → progressive liquid → persistent ready → lifted/tilted/depleted cup → empty', () => {
    const { scene, bar } = make(), tea = createVillaTea();
    const liquid = scene.getObjectByName('tea-bar/liquid')!, cup = scene.getObjectByName('tea-bar/drinking-cup')!;
    const start = cup.position.clone(); expect(liquid.visible).toBe(false);
    interactVillaTea(tea); advanceVillaTea(tea, 2.5); bar.update(2.5, tea); expect(liquid.visible).toBe(true);
    const quarterY = liquid.position.y; advanceVillaTea(tea, 7.5); bar.update(10, tea); expect(liquid.position.y).toBeGreaterThan(quarterY);
    bar.update(200, tea); expect(liquid.visible).toBe(true); expect(cup.position.equals(start)).toBe(true);
    interactVillaTea(tea); advanceVillaTea(tea, 1.4); bar.update(201.4, tea);
    expect(cup.position.y).toBeGreaterThan(start.y + 0.4); expect(cup.rotation.x).toBeGreaterThan(0.7); expect(liquid.position.y).toBeLessThan(0.044);
    advanceVillaTea(tea, 2.8); bar.update(204.2, tea); expect(liquid.visible).toBe(false); expect(cup.position.equals(start)).toBe(true); expect(cup.rotation.x).toBe(0);
  });
  it('keeps steam bounded, finite, resettable and legacy-compatible without new resources', () => {
    const { scene, bar } = make(), steam = scene.getObjectByName('tea-bar/steam') as THREE.InstancedMesh;
    const collider = bar.colliders[0], before = { ...collider }, geometries: THREE.BufferGeometry[] = [];
    scene.traverse(o => { if (o instanceof THREE.Mesh) geometries.push(o.geometry); });
    bar.update(0, true); const initial = Array.from(steam.instanceMatrix.array); bar.update(0.4, true); expect(Array.from(steam.instanceMatrix.array)).not.toEqual(initial);
    bar.update(0, true); expect(Array.from(steam.instanceMatrix.array)).toEqual(initial);
    for (const time of [NaN, Infinity, -Infinity, -100, 1e100]) { bar.update(time, true); expect(Array.from(steam.instanceMatrix.array).every(Number.isFinite)).toBe(true); }
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < 60; i++) {
      bar.update(i / 13, true);
      for (let j = 0; j < steam.count; j++) { steam.getMatrixAt(j, matrix); point.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
        expect(point.y).toBeGreaterThan(1.07); expect(point.y + scale.y).toBeLessThan(1.6); expect(scale.x).toBeLessThan(0.04);
        expect(point.x).toBeGreaterThan(VILLA_TEA_BAR.x - 0.55); expect(point.x).toBeLessThan(VILLA_TEA_BAR.x + 0.11);
      }
    }
    const version = steam.instanceMatrix.version; bar.update(100, false); expect(steam.visible).toBe(false); expect(steam.instanceMatrix.version).toBe(version);
    expect(bar.colliders[0]).toBe(collider); expect(collider).toEqual(before);
    const after: THREE.BufferGeometry[] = []; scene.traverse(o => { if (o instanceof THREE.Mesh) after.push(o.geometry); }); expect(after).toEqual(geometries);
    const materials = new Set<THREE.Material>(); scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
    expect(materials.size).toBeLessThanOrEqual(9); expect(geometries).toHaveLength(11);
    expect([...materials].every(m => !('map' in m) || !m.map)).toBe(true);
  });
});
