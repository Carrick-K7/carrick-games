import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createVillaBedroom, VILLA_MASTER_WARDROBE, VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR,
  VILLA_MASTER_STOOL, VILLA_VANITY_ACCESSORIES,
} from '../src/villaBedroom.js';
import { villaCollides, type VillaCollider } from '../src/villaWorld.js';

const intersects = (a: VillaCollider, b: VillaCollider) => a.minX < b.maxX && a.maxX > b.minX
  && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
const dispose = (root: THREE.Object3D) => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(n => { if (n instanceof THREE.Mesh) { geometries.add(n.geometry); for (const m of Array.isArray(n.material) ? n.material : [n.material]) materials.add(m); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
};

describe('north-wall master bedroom joinery', () => {
  const parent = new THREE.Group();
  let root: THREE.Object3D, colliders: VillaCollider[], meshes: THREE.Mesh[];
  beforeAll(() => {
    ({ colliders } = createVillaBedroom(parent)); root = parent.children[0];
    meshes = []; root.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); });
  });
  afterAll(() => dispose(parent));

  it('makes one fitted five-bay wardrobe row with ten doors and handles', () => {
    const w = VILLA_MASTER_WARDROBE;
    expect(root.getObjectByName('Bedroom/wardrobe-row')?.userData).toMatchObject({ bays: 5, doors: 10, wall: 'north' });
    const bays: THREE.Object3D[] = []; root.traverse(n => { if (n.name.startsWith('Bedroom/wardrobe-bay-')) bays.push(n); });
    expect(bays).toHaveLength(5);
    bays.forEach((bay, i) => {
      expect(bay.userData).toMatchObject({ doors: 2, handles: 2 });
      expect(bay.position.x).toBeCloseTo(-11.2 + (i + 0.5) * 1.04);
      expect(bay.position.y).toBe(3.6);
    });
    const wardrobeColliders = colliders.filter(c => c.maxX <= -6 + 1e-8);
    expect(Math.min(...wardrobeColliders.map(c => c.minX))).toBeCloseTo(-11.2);
    expect(Math.max(...wardrobeColliders.map(c => c.maxX))).toBeCloseTo(-6);
    expect(Math.min(...wardrobeColliders.map(c => c.minZ))).toBeCloseTo(0.15);
    expect(Math.max(...wardrobeColliders.map(c => c.maxZ))).toBeCloseTo(w.handleFrontZ);
    // Real sides, back, shelves and independently moving doors replace a giant solid box.
    expect(wardrobeColliders.length).toBeGreaterThan(20);
    expect(wardrobeColliders.every(c => c.maxX - c.minX < 1 || c.maxY - c.minY < 0.2 || c.maxZ - c.minZ < 0.1)).toBe(true);
    expect(villaCollides({ x: w.x, y: 3.6, z: 0.8 }, colliders)).toBe(true);
  });

  it('leaves real knee space rather than hiding a solid vanity cabinet behind its legs', () => {
    const v = VILLA_MASTER_VANITY;
    expect(root.getObjectByName('Bedroom/dressing-table')?.userData).toMatchObject({ openKneeSpace: true, drawers: 2 });
    const knee: VillaCollider = { minX: v.x - v.kneeWidth / 2, maxX: v.x + v.kneeWidth / 2,
      minY: v.y + 0.03, maxY: v.y + v.kneeHeight, minZ: v.z - 0.2, maxZ: v.z + 0.3 };
    expect(colliders.some(c => intersects(c, knee))).toBe(false);
    // Actual triangle geometry agrees: a horizontal ray through the knee opening.
    parent.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(v.x, v.y + 0.4, v.z + 0.34), new THREE.Vector3(0, 0, -1), 0, 0.55);
    expect(ray.intersectObjects(meshes, false)).toHaveLength(0);
    expect(villaCollides({ x: v.x, y: v.y, z: v.z }, colliders)).toBe(true); // A standing body hits the desktop.
    const s = VILLA_MASTER_STOOL;
    expect(villaCollides({ x: s.x, y: s.y, z: s.z }, colliders)).toBe(true);
    expect(colliders[colliders.length - 1].maxY).toBeCloseTo(s.y + s.height);
    expect(colliders.filter(c => c.minX > -6)).toHaveLength(10); // Vanity legs/brace/drawers/top; mirror; stool.
  });

  it('fits entirely inside the master room and preserves doors, bed access and glazing', () => {
    for (const c of colliders) {
      expect(c.minX).toBeGreaterThan(-11.9); expect(c.maxX).toBeLessThan(-2.2);
      expect(c.minZ).toBeGreaterThan(0.11); expect(c.maxZ).toBeLessThan(2);
      expect(c.minY).toBeGreaterThanOrEqual(3.6); expect(c.maxY).toBeLessThan(7);
    }
    const clearZones: VillaCollider[] = [
      { minX: -2.9, maxX: -1.5, minZ: 1.5, maxZ: 3.8, minY: 3.6, maxY: 6.6 },
      { minX: -8.5, maxX: -6.2, minZ: 8, maxZ: 9.3, minY: 3.6, maxY: 6.6 },
      { minX: -9.435, maxX: -6.565, minZ: 3.6, maxZ: 7.47, minY: 3.6, maxY: 5.7 },
      { minX: -11.9, maxX: -11.5, minZ: 1, maxZ: 8, minY: 3.6, maxY: 6.6 },
      { minX: -5.5, maxX: -2.5, minZ: 3.9, maxZ: 7.5, minY: 3.6, maxY: 6.6 },
    ];
    clearZones.forEach(zone => expect(colliders.some(c => intersects(c, zone))).toBe(false));
    // Continuous route in from the east, along the foot of the bed and west side.
    for (let x = -10.7; x <= -2; x += 0.15) expect(villaCollides({ x, y: 3.6, z: 2.65 }, colliders)).toBe(false);
    for (let z = 2; z < 9; z += 0.15) expect(villaCollides({ x: -10.8, y: 3.6, z }, colliders)).toBe(false);
    for (let x = -10.8; x < -6.3; x += 0.15) expect(villaCollides({ x, y: 3.6, z: 8.1 }, colliders)).toBe(false);
  });

  it('supplies a polished-metal mirror, restrained emissive trim and five modeled vanity accessories', () => {
    const m = VILLA_MASTER_MIRROR;
    const node = root.getObjectByName('Bedroom/dressing-mirror')!;
    expect(node.position.toArray()).toEqual([m.x, m.y, m.z]);
    expect(node.userData).toMatchObject({ renderTarget: false, litTrim: true, reflection: 'environment-polished-metal' });
    const material = meshes.map(mesh => mesh.material as THREE.MeshStandardMaterial).find(mat => mat.name === 'Bedroom polished mirror')!;
    expect(material.metalness).toBe(1); expect(material.roughness).toBeLessThan(0.1);
    expect(material.envMap).toBeNull(); // Uses existing scene environment, no separately owned render target.
    expect(meshes.some(mesh => (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity === 0.65)).toBe(true);
    for (const kind of VILLA_VANITY_ACCESSORIES) expect(root.getObjectByName(`Bedroom/${kind}`)).toBeDefined();
    expect(root.getObjectByName('Bedroom/brush-cup')?.userData.brushes).toBe(3);
    expect(root.getObjectByName('Bedroom/compact')?.userData.open).toBe(true);
    expect(root.children.some(n => n instanceof THREE.Light || n instanceof THREE.Sprite)).toBe(false);
  });

  it('merges finite geometry by scene-owned materials without DOM textures or excessive draw calls', () => {
    expect(parent.children).toHaveLength(1); expect(root.name).toBe('Villa master bedroom');
    expect(meshes.length).toBeLessThanOrEqual(24);
    expect(meshes.filter(mesh => mesh instanceof THREE.InstancedMesh)).toHaveLength(3);
    expect(new Set(meshes.map(mesh => mesh.material)).size).toBeLessThan(meshes.length);
    let vertices = 0;
    for (const mesh of meshes) {
      const p = mesh.geometry.getAttribute('position'); vertices += p.count;
      expect(p.count).toBeGreaterThan(0); expect(p.array.every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.getAttribute('normal').count).toBe(p.count);
      expect((mesh.material as THREE.MeshStandardMaterial).map).toBeNull();
      expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    }
    expect(vertices).toBeLessThan(100_000);
  });

  it('recreates the same static geometry with independent materials and colliders', () => {
    const second = new THREE.Group();
    try {
      expect(createVillaBedroom(second).colliders).toEqual(colliders);
      const secondMeshes: THREE.Mesh[] = []; second.traverse(n => { if (n instanceof THREE.Mesh) secondMeshes.push(n); });
      expect(secondMeshes).toHaveLength(meshes.length);
      secondMeshes.forEach((mesh, i) => {
        expect(mesh.material).not.toBe(meshes[i].material);
        const a = mesh.geometry.getAttribute('position').array, b = meshes[i].geometry.getAttribute('position').array;
        expect(a.length).toBe(b.length); expect(a.every((value, j) => value === b[j])).toBe(true);
      });
    } finally { dispose(second); }
  });
});
