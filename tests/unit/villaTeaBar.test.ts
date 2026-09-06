import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaTeaBar, VILLA_TEA_BAR } from '../../src/games/villaTeaBar';
import { VILLA_AQUARIUM } from '../../src/games/villaSeating';
import { moveVillaPlayer, villaCollides, VILLA_WALL_COLLIDERS, type VillaCollider, type VillaPosition } from '../../src/games/villaWorld';

const box = (x: number, z: number, w: number, d: number, height: number): VillaCollider => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: height });
// Exact nearby fixture dimensions from villaFurnishings, without a DOM/canvas dependency.
const neighbors = [
  box(-10, -0.1, 2.5, 0.42, 3.4), box(-10, 0.35, 2.88, 0.9, 1.61),
  box(VILLA_AQUARIUM.x, VILLA_AQUARIUM.z, VILLA_AQUARIUM.width, VILLA_AQUARIUM.depth, 2.17), box(-8.5, -2.8, 2.8, 1.35, 0.76),
  ...[-9.33, -7.67].flatMap(x => [-3.88, -1.72].map(z => box(x, z, 0.65, 0.68, 1.1))),
  box(-5.2, -5.6, 2.7, 1.43, 1.03), ...[-5.85, -4.55].map(x => box(x, -4.48, 0.54, 0.51, 0.8)),
  box(-5.67, -8.35, 1.22, 1.08, 0.99),
];
function follow(p: VillaPosition, target: VillaPosition, colliders: VillaCollider[]): VillaPosition {
  let current = { ...p };
  const steps = Math.ceil(Math.hypot(target.x - p.x, target.z - p.z) / 0.05);
  for (let i = 0; i < steps; i++) {
    current = moveVillaPlayer(current, (target.x - p.x) / steps, (target.z - p.z) / steps, colliders);
    expect(villaCollides(current, colliders)).toBe(false);
  }
  expect(current.x).toBeCloseTo(target.x, 6); expect(current.z).toBeCloseTo(target.z, 6);
  return current;
}

describe('villa tea bar safe kitchen placement', () => {
  it('exports ground approach, visible anchor and ten-second duration with one matching cabinet box', () => {
    const scene = new THREE.Scene(), bar = createVillaTeaBar(scene), c = bar.colliders[0];
    expect(VILLA_TEA_BAR.duration).toBe(10);
    expect(VILLA_TEA_BAR.approach).toEqual({ x: -6.7, y: 0, z: -1.65 });
    expect(VILLA_TEA_BAR.anchor.y).toBeGreaterThan(VILLA_TEA_BAR.height);
    expect(bar.colliders).toHaveLength(1); expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
    expect(c.minX).toBeCloseTo(-7.8); expect(c.maxX).toBeCloseTo(-5.6);
    expect(c.minZ).toBeCloseTo(-1); expect(c.maxZ).toBeCloseTo(-0.2);
    expect(c.minY).toBe(0); expect(c.maxY).toBe(0.95);
    expect(villaCollides(VILLA_TEA_BAR.approach, [...neighbors, c])).toBe(false);
    expect(villaCollides({ x: VILLA_TEA_BAR.x, y: 0, z: VILLA_TEA_BAR.z }, [c])).toBe(true);
    for (const other of neighbors) {
      const overlap = c.minX < other.maxX && c.maxX > other.minX && c.minZ < other.maxZ && c.maxZ > other.minZ;
      expect(overlap).toBe(false);
    }
    expect(neighbors[2].minX - c.maxX).toBeCloseTo(0.385);
  });

  it('preserves real east/north approaches, nearby dining circulation and access toward the tap', () => {
    const bar = createVillaTeaBar(new THREE.Scene()), colliders = [...VILLA_WALL_COLLIDERS, ...neighbors, ...bar.colliders];
    const approach = VILLA_TEA_BAR.approach;
    follow({ x: -6.7, y: 0, z: -3.6 }, approach, colliders);
    let p = follow({ x: -5.67, y: 0, z: -7.1 }, { x: -3, y: 0, z: -7.1 }, colliders);
    p = follow(p, { x: -3, y: 0, z: -1.65 }, colliders);
    p = follow(p, approach, colliders);
    follow(p, { x: -3, y: 0, z: -1.65 }, colliders);
    expect(bar.colliders.every(c => c.minZ > -2)).toBe(true); // No sink/island/tap intrusion.
  });
});

describe('scene-owned detailed tea bar without WebGL', () => {
  it('includes real brewing equipment in low material batches, contained on its countertop', () => {
    const scene = new THREE.Scene(); createVillaTeaBar(scene);
    const root = scene.getObjectByName('villa-tea-bar')!;
    expect(root.userData).toMatchObject({ activity: 'tea-brewing', duration: 10, stool: false });
    for (const name of ['cabinet', 'stone-counter', 'tea-tray', 'gooseneck-kettle', 'teapot', 'cup-1', 'cup-2', 'tea-canister-1', 'tea-canister-2', 'tea-tools', 'steam']) {
      expect(root.getObjectByName(`tea-bar/${name}`), name).toBeTruthy();
    }
    expect(root.getObjectByName('tea-bar/tea-tray')!.userData.slats).toBe(13);
    expect(root.getObjectByName('tea-bar/cup-1')!.userData.openRim).toBe(true);
    expect(root.getObjectByName('tea-bar/gooseneck-kettle')!.userData.curvedSpout).toBe(true);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3(); let staticMeshes = 0, dynamicMeshes = 0;
    root.traverse(o => {
      expect(o instanceof THREE.Light).toBe(false);
      if (o instanceof THREE.InstancedMesh) { dynamicMeshes++; expect(o.castShadow).toBe(false); }
      else if (o instanceof THREE.Mesh) {
        staticMeshes++; bounds.union(new THREE.Box3().setFromObject(o, true));
        expect(o.geometry.getAttribute('position').count).toBeGreaterThan(20);
      }
    });
    expect(staticMeshes).toBe(8); expect(dynamicMeshes).toBe(1);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-7.801); expect(bounds.max.x).toBeLessThanOrEqual(-5.599);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-1.001); expect(bounds.max.z).toBeLessThanOrEqual(-0.199);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeGreaterThan(1.3); expect(bounds.max.y).toBeLessThan(1.4);
  });

  it('switches steam off-on-off and resets without touching static geometry/colliders or creating resources', () => {
    const scene = new THREE.Scene(), bar = createVillaTeaBar(scene);
    const steam = scene.getObjectByName('tea-bar/steam') as THREE.InstancedMesh;
    const collider = bar.colliders[0], before = { ...collider }, array = bar.colliders;
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.push(o.geometry); materials.push(...(Array.isArray(o.material) ? o.material : [o.material])); } });
    expect(steam.visible).toBe(false); expect(steam.count).toBe(12);
    bar.update(0, true); expect(steam.visible).toBe(true);
    const initial = Array.from(steam.instanceMatrix.array);
    bar.update(0.4, true); expect(Array.from(steam.instanceMatrix.array)).not.toEqual(initial);
    bar.update(0, true); expect(Array.from(steam.instanceMatrix.array)).toEqual(initial);
    for (const time of [NaN, Infinity, -Infinity, -100, 1e100]) {
      bar.update(time, true); expect(Array.from(steam.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    }
    const version = steam.instanceMatrix.version;
    bar.update(10, false); expect(steam.visible).toBe(false);
    bar.update(0, false); expect(steam.visible).toBe(false); expect(steam.instanceMatrix.version).toBe(version);
    expect(bar.colliders).toBe(array); expect(bar.colliders[0]).toBe(collider); expect(collider).toEqual(before);
    const after: THREE.BufferGeometry[] = [];
    scene.traverse(o => { if (o instanceof THREE.Mesh) after.push(o.geometry); });
    expect(after).toEqual(geometries);
    expect(new Set(materials).size).toBe(9);
  });

  it('keeps steam small and above cups/teapot, never requiring another light or render target', () => {
    const scene = new THREE.Scene(), bar = createVillaTeaBar(scene), matrix = new THREE.Matrix4();
    const steam = scene.getObjectByName('tea-bar/steam') as THREE.InstancedMesh;
    const position = new THREE.Vector3(), scale = new THREE.Vector3();
    const material = steam.material as THREE.MeshBasicMaterial;
    expect(material.depthWrite).toBe(false); expect(material.opacity).toBeLessThan(0.2); expect(material.map).toBeNull();
    for (let i = 0; i < 90; i++) {
      bar.update(i / 13, true);
      for (let j = 0; j < steam.count; j++) {
        steam.getMatrixAt(j, matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
        expect(position.y).toBeGreaterThan(1.07); expect(position.y + scale.y).toBeLessThan(1.6);
        expect(scale.x).toBeLessThan(0.04); expect(scale.y).toBeLessThan(0.07);
        expect(position.x).toBeGreaterThan(-6.81); expect(position.x).toBeLessThan(-6.15);
      }
    }
  });

  it('makes every live geometry/material reachable by the existing scene disposal traversal', () => {
    const scene = new THREE.Scene(); createVillaTeaBar(scene);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(o => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    expect(geometries.size).toBe(9); expect(materials.size).toBe(9);
    let disposed = 0;
    for (const g of geometries) { g.addEventListener('dispose', () => disposed++); g.dispose(); }
    for (const m of materials) { m.addEventListener('dispose', () => disposed++); m.dispose(); }
    expect(disposed).toBe(18); scene.clear(); expect(scene.children).toHaveLength(0);
    const fresh = new THREE.Scene(); createVillaTeaBar(fresh);
    expect(fresh.getObjectByName('tea-bar/steam')!.visible).toBe(false);
  });
});
