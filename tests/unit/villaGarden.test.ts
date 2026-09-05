import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createVillaGarden, VILLA_FLOWER_SPECIES, VILLA_FRUIT_SPECIES, VILLA_GARDEN_TREES,
  VILLA_ROOF_PLANTERS, VILLA_VEGETABLE_BEDS, VILLA_VEGETABLE_SPECIES,
} from '../../src/games/villaGarden.js';
import { STAIR_HOLE, VILLA_SPAWN, villaCollides, type VillaCollider } from '../../src/games/villaWorld.js';

const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>, margin = 0) =>
  a.minX - margin < b.maxX && a.maxX + margin > b.minX && a.minZ - margin < b.maxZ && a.maxZ + margin > b.minZ;
const dispose = (root: THREE.Object3D) => {
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  materials.forEach(material => material.dispose()); root.clear();
};

describe('authored villa garden', () => {
  const parent = new THREE.Group();
  let colliders: VillaCollider[], root: THREE.Object3D, meshes: THREE.Mesh[];
  beforeAll(() => {
    ({ colliders } = createVillaGarden(parent)); root = parent.children[0];
    meshes = []; root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  });
  afterAll(() => dispose(parent));

  it('replaces the original ten trunks at exactly the same positions, scales and collision dimensions', () => {
    const original = [[-23.2, -11, 1.25], [-23, 8.2, 1], [-22, 19, 1.25], [-14, 22.8, 1], [8, 23, 1.15], [23.2, 19, 1.2], [23.4, 7, 1], [22.7, -12, 1.2], [-8, -14.5, 1.15], [8, -14.5, 1.1]];
    expect(VILLA_GARDEN_TREES.map(t => [t.x, t.z, t.scale])).toEqual(original);
    original.forEach(([x, z, s], i) => {
      const collider = colliders[i];
      expect(collider.minX).toBeCloseTo(x - 0.25 * s); expect(collider.maxX).toBeCloseTo(x + 0.25 * s);
      expect(collider.minZ).toBeCloseTo(z - 0.25 * s); expect(collider.maxZ).toBeCloseTo(z + 0.25 * s);
      expect(collider.minY).toBe(0); expect(collider.maxY).toBeCloseTo(2.9 * s);
    });
    expect(colliders).toHaveLength(20); // Ten trunks, six planters, four raised beds.
  });

  it('has six botanical fruit species with distinct leaf, fruit and silhouette specifications', () => {
    const species = ['cherry', 'orange', 'mango', 'apple', 'pear', 'lemon'];
    expect(Object.keys(VILLA_FRUIT_SPECIES)).toEqual(species);
    expect(new Set(VILLA_GARDEN_TREES.map(t => t.species))).toEqual(new Set(species));
    for (const field of ['shape', 'leafShape', 'silhouette', 'fruit', 'leaf'] as const) {
      expect(new Set(Object.values(VILLA_FRUIT_SPECIES).map(s => s[field])).size).toBe(6);
    }
    const trees = root.children.filter(n => n.userData.kind === 'fruit-tree');
    expect(trees).toHaveLength(10);
    for (const tree of trees) {
      expect(tree.userData.fruitClusters).toBe(12);
      expect(tree.userData.fruitHeight[0]).toBeGreaterThan(1.6);
      expect(tree.userData.fruitHeight[1]).toBeLessThan(3.5);
      expect(tree.name).toContain(tree.userData.species);
    }
    expect(root.getObjectByName('Garden/fruit-tree/cherry')?.userData.shape).toBe('paired-cherries');
    expect(root.getObjectByName('Garden/fruit-tree/mango')?.userData.shape).toBe('elongated-mango');
  });

  it('actually renders each fruit color below the canopy, including elongated mango geometry', () => {
    for (const [species, spec] of Object.entries(VILLA_FRUIT_SPECIES)) {
      const mesh = meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === spec.fruit.slice(1));
      expect(mesh, `${species} fruit batch`).toBeDefined();
      const tree = VILLA_GARDEN_TREES.find(t => t.species === species)!;
      const positions = mesh!.geometry.getAttribute('position');
      const visibleFruit = new THREE.Box3();
      // Isolate the outer east fruit pair on the selected tree, excluding other trees/crops.
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i);
        if (p.x > tree.x + 0.65 * tree.scale && p.x < tree.x + 1.65 * tree.scale && Math.abs(p.z - tree.z) < 0.2 * tree.scale) visibleFruit.expandByPoint(p);
      }
      expect(visibleFruit.isEmpty()).toBe(false);
      expect(visibleFruit.min.y).toBeGreaterThan(1.6);
      expect(visibleFruit.max.y).toBeLessThan(3.7);
      if (species === 'mango') expect(visibleFruit.max.y - visibleFruit.min.y).toBeGreaterThan(0.5 * tree.scale);
    }
  });

  it('keeps paired fruit surfaces separated and cherries smaller than the other orchard fruit', () => {
    const sphere = new THREE.SphereGeometry(1, 8, 5), smooth = new THREE.SphereGeometry(1, 16, 12);
    const lowCount = sphere.index!.count, mangoCount = smooth.index!.count;
    sphere.dispose(); smooth.dispose();
    for (const [species, spec] of Object.entries(VILLA_FRUIT_SPECIES)) {
      const mesh = meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === spec.fruit.slice(1))!;
      const p = mesh.geometry.getAttribute('position');
      const perFruit = species === 'mango' ? mangoCount : lowCount * (species === 'apple' ? 3 : species === 'pear' || species === 'lemon' ? 2 : 1);
      const trees = VILLA_GARDEN_TREES.filter(t => t.species === species);
      trees.forEach((tree, treeIndex) => {
        for (let cluster = 0; cluster < 12; cluster++) {
          const a = cluster * Math.PI / 6, spans: [number, number][] = [];
          for (let fruit = 0; fruit < 2; fruit++) {
            let min = Infinity, max = -Infinity;
            const bounds = new THREE.Box3(), start = (treeIndex * 24 + cluster * 2 + fruit) * perFruit;
            for (let i = start; i < start + perFruit; i++) {
              const point = new THREE.Vector3().fromBufferAttribute(p, i); bounds.expandByPoint(point);
              const radial = (point.x - tree.x) * Math.cos(a) + (point.z - tree.z) * Math.sin(a);
              min = Math.min(min, radial); max = Math.max(max, radial);
            }
            spans.push([min, max]);
            if (species === 'cherry') expect(bounds.max.y - bounds.min.y).toBeLessThan(0.17 * tree.scale);
          }
          expect(spans[1][0] - spans[0][1], `${species} cluster ${cluster}`).toBeGreaterThan(0.025 * tree.scale);
        }
      });
    }
  });

  it('renders each mango as one continuous smooth skin with integrated subtle vertex-color blush', () => {
    const mesh = meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === VILLA_FRUIT_SPECIES.mango.fruit.slice(1))!;
    const sphere = new THREE.SphereGeometry(1, 16, 12), perFruit = sphere.index!.count; sphere.dispose();
    const p = mesh.geometry.getAttribute('position'), color = mesh.geometry.getAttribute('color');
    expect(p.count).toBe(VILLA_GARDEN_TREES.filter(t => t.species === 'mango').length * 24 * perFruit);
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect(color.count).toBe(p.count);
    let minGreen = 1;
    // Weld the seam/poles of the first fruit and verify one connected triangle skin.
    const adjacent = new Map<string, Set<string>>();
    for (let i = 0; i < perFruit; i += 3) {
      const triangle: string[] = [];
      for (let j = 0; j < 3; j++) {
        const k = i + j, key = [p.getX(k), p.getY(k), p.getZ(k)].map(n => n.toFixed(5)).join('/');
        triangle.push(key); if (!adjacent.has(key)) adjacent.set(key, new Set());
        minGreen = Math.min(minGreen, color.getY(k));
      }
      for (const a of triangle) for (const b of triangle) adjacent.get(a)!.add(b);
    }
    const pending = [adjacent.keys().next().value!], seen = new Set<string>();
    while (pending.length) { const key = pending.pop()!; if (seen.has(key)) continue; seen.add(key); pending.push(...adjacent.get(key)!); }
    expect(seen.size).toBe(adjacent.size);
    expect(minGreen).toBeGreaterThan(0.8); expect(minGreen).toBeLessThan(0.98);
  });

  it('gives the six tree species different geometric crown proportions, not only different colors', () => {
    const proportions: string[] = [];
    for (const [species, spec] of Object.entries(VILLA_FRUIT_SPECIES)) {
      const tree = VILLA_GARDEN_TREES.find(t => t.species === species)!;
      const mesh = meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === spec.leaf.slice(1))!;
      const p = mesh.geometry.getAttribute('position'), bounds = new THREE.Box3();
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i);
        if (Math.abs(point.x - tree.x) < 3 * tree.scale && Math.abs(point.z - tree.z) < 3 * tree.scale) bounds.expandByPoint(point);
      }
      const size = bounds.getSize(new THREE.Vector3());
      proportions.push((size.x / size.y).toFixed(2));
      expect(size.y).toBeGreaterThan(tree.scale);
    }
    expect(new Set(proportions).size).toBe(6);
  });

  it('adds six different flowering edge planters on the roof without blocking existing roof features', () => {
    expect(VILLA_ROOF_PLANTERS.map(p => p.species)).toEqual(VILLA_FLOWER_SPECIES);
    const markers = root.children.filter(n => n.userData.kind === 'flower-planter');
    expect(markers).toHaveLength(6);
    const keepClear = [STAIR_HOLE, rect(-1.1, 1.1, -7.5, -5.1), rect(1.7, 6.7, -7.5, 1.5),
      rect(-9.9, -4.1, 2.1, 6.5), // Seating, rug and old tea hotspot.
      rect(-7.7, -4.3, -6.2, -2.8), rect(7.15, 9.85, -6.5, -5.5), // Dining and BBQ.
      ...[-10.3, -3.1].flatMap(x => [1.3, 7].map(z => rect(x - 0.08, x + 0.08, z - 0.08, z + 0.08))),
      ...[[-10.8, 7.9], [-3, 7.9], [10.7, 7.9], [10.7, -8], [-10.6, -7.9], [-3, -7.9]].map(([x, z]) => rect(x - 0.4, x + 0.4, z - 0.4, z + 0.4))];
    VILLA_ROOF_PLANTERS.forEach((p, i) => {
      expect(markers[i].position.y).toBe(7.2);
      const c = colliders[10 + i];
      expect(c.minY).toBe(7.2); expect(c.maxY).toBeCloseTo(7.63);
      expect(c.minX).toBeGreaterThan(-11.9); expect(c.maxX).toBeLessThan(11.9);
      expect(c.minZ).toBeGreaterThan(-8.9); expect(c.maxZ).toBeLessThan(8.9);
      expect(Math.abs(p.x) > 10 || Math.abs(p.z) > 7.7).toBe(true);
      keepClear.forEach(r => expect(overlaps(c, r, 0.23)).toBe(false));
    });
  });

  it('keeps four framed two-row crops inside the dedicated vegetable patch with wide cross aisles', () => {
    expect(VILLA_VEGETABLE_BEDS.map(p => p.species)).toEqual(VILLA_VEGETABLE_SPECIES);
    const markers = root.children.filter(n => n.userData.kind === 'vegetable-bed');
    expect(markers).toHaveLength(4);
    markers.forEach(n => { expect(n.userData.rows).toBe(2); expect(n.userData.plants).toBe(10); });
    const beds = colliders.slice(16);
    beds.forEach(c => {
      expect(c.minX).toBeGreaterThanOrEqual(-11.6); expect(c.maxX).toBeLessThanOrEqual(-4.1);
      expect(c.minZ).toBeGreaterThanOrEqual(17); expect(c.maxZ).toBeLessThanOrEqual(22);
      expect(c.minY).toBe(0); expect(c.maxY).toBeGreaterThanOrEqual(0.28);
    });
    expect(beds[0].maxY).toBe(1.65); // A real tomato trellis, protected from pets too.
    expect(beds[1].minX - beds[0].maxX).toBeCloseTo(1.6);
    expect(beds[2].minZ - beds[0].maxZ).toBeCloseTo(1.45);
    for (const p of [{ x: -7.9, y: 0, z: 18 }, { x: -10, y: 0, z: 19.5 }, { x: -7.9, y: 0, z: 21 }]) expect(villaCollides(p, colliders)).toBe(false);
    for (const bed of VILLA_VEGETABLE_BEDS) expect(villaCollides({ x: bed.x, y: 0, z: bed.z }, colliders)).toBe(true);
  });

  it('preserves spawn, entrance path, driveway and driving course', () => {
    expect(villaCollides(VILLA_SPAWN, colliders)).toBe(false);
    const keepClear = [rect(-2.3, 2.3, 11, 21), rect(13, 19, 2, 26), rect(-24, 27, 25, 53)];
    colliders.filter(c => c.minY < 1).forEach(c => keepClear.forEach(r => expect(overlaps(c, r, 0.23)).toBe(false)));
  });

  it('batches shared, scene-owned materials into at most 28 draw calls without lights, text or animation nodes', () => {
    expect(parent.children).toHaveLength(1); expect(root.name).toBe('Villa garden');
    expect(meshes.length).toBeGreaterThan(15); expect(meshes.length).toBeLessThanOrEqual(28);
    expect(new Set(meshes.map(m => m.material)).size).toBe(meshes.length);
    expect(root.children.filter(n => !(n instanceof THREE.Mesh))).toHaveLength(20);
    let vertices = 0;
    for (const mesh of meshes) {
      const p = mesh.geometry.getAttribute('position'); vertices += p.count;
      expect(p.count).toBeGreaterThan(0); expect(mesh.geometry.getAttribute('normal').count).toBe(p.count);
      expect(mesh.geometry.getAttribute('uv').count).toBe(p.count);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
      expect((mesh.material as THREE.MeshStandardMaterial).map).toBeNull();
    }
    expect(vertices).toBeLessThan(600_000);
    expect(root.children.some(n => n instanceof THREE.Light || n instanceof THREE.Sprite)).toBe(false);
  });

  it('creates deterministic geometry and independent material ownership on repeated construction', () => {
    const second = new THREE.Group(); const other = createVillaGarden(second);
    try {
      expect(other.colliders).toEqual(colliders);
      const secondMeshes: THREE.Mesh[] = []; second.traverse(n => { if (n instanceof THREE.Mesh) secondMeshes.push(n); });
      expect(secondMeshes.length).toBe(meshes.length);
      meshes.forEach((mesh, index) => {
        const otherMesh = secondMeshes[index];
        expect(otherMesh.material).not.toBe(mesh.material);
        const a = mesh.geometry.getAttribute('position').array, b = otherMesh.geometry.getAttribute('position').array;
        expect(a.length).toBe(b.length);
        expect(a.every((value, i) => value === b[i])).toBe(true);
      });
    } finally { dispose(second); }
  });
});
