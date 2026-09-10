import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaEstateFence, createVillaTerrainGeometry } from '../../src/games/villaTerrainModel.js';
import { VILLA_ESTATE_BOUNDS as BOUNDS, VILLA_ESTATE_FENCE_SEGMENTS, VILLA_POND, villaTerrainHeight, villaTerrainNormal } from '../../src/games/villaEstateLayout.js';
import { POOL } from '../../src/games/villaWorld.js';

type P = { x: number; y: number; z: number };
type Triangle = [P, P, P];
const cross = (a: P, b: P, p: P) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
function contains(triangle: Triangle, x: number, z: number) {
  const p = { x, z, y: 0 }, sides = triangle.map((a, i) => cross(a, triangle[(i + 1) % 3], p));
  return sides.every(s => s >= -1e-7) || sides.every(s => s <= 1e-7);
}
function poolIntersectionArea(triangle: Triangle) {
  let polygon: P[] = [...triangle];
  for (const [axis, value, sign] of [['x', POOL.minX, 1], ['x', POOL.maxX, -1], ['z', POOL.minZ, 1], ['z', POOL.maxZ, -1]] as const) {
    const result: P[] = [];
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length], da = (a[axis] - value) * sign, db = (b[axis] - value) * sign;
      if (da >= 0) result.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); result.push({ x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t }); }
    });
    polygon = result;
  }
  return Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.z - p.z * q.x; }, 0)) / 2;
}
function pondDistanceSquared(triangle: Triangle) {
  const t = triangle.map(p => ({ x: (p.x - VILLA_POND.x) / VILLA_POND.radiusX, y: 0, z: (p.z - VILLA_POND.z) / VILLA_POND.radiusZ })) as Triangle;
  if (contains(t, 0, 0)) return 0;
  return Math.min(...t.map((a, i) => {
    const b = t[(i + 1) % 3], dx = b.x - a.x, dz = b.z - a.z, u = Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / (dx * dx + dz * dz || 1)));
    return (a.x + u * dx) ** 2 + (a.z + u * dz) ** 2;
  }));
}
const inPool = (x: number, z: number) => x > POOL.minX && x < POOL.maxX && z > POOL.minZ && z < POOL.maxZ;
const inPond = (x: number, z: number) => ((x - VILLA_POND.x) / VILLA_POND.radiusX) ** 2 + ((z - VILLA_POND.z) / VILLA_POND.radiusZ) ** 2 < 1;

describe('Villa sampled terrain mesh and exact water openings', () => {
  let geometry: THREE.BufferGeometry, triangles: Triangle[];
  const buckets = new Map<string, Triangle[]>();
  beforeAll(() => {
    geometry = createVillaTerrainGeometry(); const p = geometry.getAttribute('position'), indices = geometry.index;
    triangles = [];
    for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
      const t = [0, 1, 2].map(j => { const k = indices ? indices.getX(i + j) : i + j; return { x: p.getX(k), y: p.getY(k), z: p.getZ(k) }; }) as Triangle;
      triangles.push(t);
      for (let x = Math.floor(Math.min(...t.map(v => v.x))); x <= Math.floor(Math.max(...t.map(v => v.x))); x++) for (let z = Math.floor(Math.min(...t.map(v => v.z))); z <= Math.floor(Math.max(...t.map(v => v.z))); z++) {
        const key = `${x}/${z}`, list = buckets.get(key) ?? []; list.push(t); buckets.set(key, list);
      }
    }
  });
  afterAll(() => geometry.dispose());
  const at = (x: number, z: number) => (buckets.get(`${Math.floor(x)}/${Math.floor(z)}`) ?? []).filter(t => contains(t, x, z));

  it('has finite indexed geometry, upward normalized normals and metre-local height samples', () => {
    let maxHeightError = 0, maxNormalError = 0, minNormalY = 1, maxSpan = 0;
    for (const name of ['position', 'normal', 'uv']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    const p = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = villaTerrainNormal(x, z);
      maxHeightError = Math.max(maxHeightError, Math.abs(y - (villaTerrainHeight(x, z) - 0.022)));
      maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1), Math.abs(normal.getX(i) - n.x), Math.abs(normal.getZ(i) - n.z));
      minNormalY = Math.min(minNormalY, normal.getY(i));
    }
    for (const t of triangles) {
      expect(cross(t[0], t[1], t[2])).toBeLessThan(1e-7);
      maxSpan = Math.max(maxSpan, Math.max(...t.map(v => v.x)) - Math.min(...t.map(v => v.x)), Math.max(...t.map(v => v.z)) - Math.min(...t.map(v => v.z)));
    }
    expect(maxHeightError).toBeLessThan(2e-6); expect(maxNormalError).toBeLessThan(2e-6); expect(minNormalY).toBeGreaterThan(0.98); expect(maxSpan).toBeLessThanOrEqual(1.00002);
    expect(geometry.boundingBox!.min.x).toBeCloseTo(BOUNDS.minX); expect(geometry.boundingBox!.max.z).toBeCloseTo(BOUNDS.maxZ); expect(geometry.boundingSphere!.radius).toBeGreaterThan(50);
  });
  it('does not allow any triangle area inside the exact rectangular pool', () => {
    const candidates = triangles.filter(t => Math.max(...t.map(p => p.x)) >= POOL.minX && Math.min(...t.map(p => p.x)) <= POOL.maxX && Math.max(...t.map(p => p.z)) >= POOL.minZ && Math.min(...t.map(p => p.z)) <= POOL.maxZ);
    expect(Math.max(...candidates.map(poolIntersectionArea))).toBeLessThan(1e-7);
    expect(at((POOL.minX + POOL.maxX) / 2, (POOL.minZ + POOL.maxZ) / 2)).toHaveLength(0);
  });
  it('keeps complete triangle edges outside the analytic pond ellipse, not merely their centroids', () => {
    let closest = Infinity, worst: Triangle | null = null;
    for (const t of triangles) {
      const distance = pondDistanceSquared(t);
      if (distance < closest) { closest = distance; worst = t; }
    }
    // 2e-6 permits Float32 edge roundoff, not an inscribed polygon's grass wedges.
    expect(closest, `normalized squared pond clearance=${closest}; triangle=${JSON.stringify(worst)}`).toBeGreaterThanOrEqual(1 - 2e-6);
    expect(at(VILLA_POND.x, VILLA_POND.z)).toHaveLength(0);
  });
  it('retains outside support across estate bounds, grid seams and right up to the water margins', () => {
    const samples: [number, number][] = [];
    for (let x = BOUNDS.minX + 0.123; x <= BOUNDS.maxX; x += 2.13) for (let z = BOUNDS.minZ + 0.217; z <= BOUNDS.maxZ; z += 3.17) if (!inPool(x, z) && !inPond(x, z)) samples.push([x, z]);
    for (const x of [BOUNDS.minX + 0.001, BOUNDS.maxX - 0.001]) for (const z of [BOUNDS.minZ + 0.001, 0, 61.5, 121, BOUNDS.maxZ - 0.001]) samples.push([x, z]);
    for (const x of [POOL.minX - 0.01, POOL.maxX + 0.01]) for (let z = POOL.minZ; z <= POOL.maxZ; z += 0.7) samples.push([x, z]);
    for (const z of [POOL.minZ - 0.01, POOL.maxZ + 0.01]) for (let x = POOL.minX; x <= POOL.maxX; x += 0.7) samples.push([x, z]);
    for (let i = 0; i < 256; i++) { const a = i * Math.PI / 128; samples.push([VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * 1.002, VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * 1.002]); }
    const missing = samples.filter(([x, z]) => at(x, z).length === 0); expect(missing.slice(0, 20), `${missing.length} missing terrain samples`).toEqual([]);
  });
  it('matches interpolated surface height between grid vertices without long flat bridges', () => {
    let worst = 0;
    for (const t of triangles) {
      const x = (t[0].x + t[1].x + t[2].x) / 3, z = (t[0].z + t[1].z + t[2].z) / 3, y = (t[0].y + t[1].y + t[2].y) / 3;
      worst = Math.max(worst, Math.abs(y + 0.022 - villaTerrainHeight(x, z)));
    }
    // A 1m height grid stays within 1cm between samples, comfortably below the
    // 22mm visual grass offset; exact vertex height is checked separately.
    expect(worst).toBeLessThan(0.01);
  });
});

describe('Villa terrain-following perimeter fence', () => {
  it('grounds posts, follows hills, conservatively bounds rails and stays outside playable estate', () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial(), fence = createVillaEstateFence(root, material); root.updateMatrixWorld(true);
    const model = root.getObjectByName('villa-estate-fence')!, meshes: THREE.Mesh[] = []; model.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); }); expect(meshes).toHaveLength(1);
    const ray = new THREE.Raycaster();
    for (const segment of VILLA_ESTATE_FENCE_SEGMENTS) {
      const count = Math.ceil(Math.hypot(segment.to.x - segment.from.x, segment.to.z - segment.from.z) / 2);
      for (const index of [0, Math.floor(count / 2), count]) {
        const x = segment.from.x + (segment.to.x - segment.from.x) * index / count, z = segment.from.z + (segment.to.z - segment.from.z) * index / count, floor = villaTerrainHeight(x, z);
        ray.set(new THREE.Vector3(x, floor + 3, z), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObjects(meshes)[0]; expect(hit).toBeDefined(); expect(hit.point.y).toBeCloseTo(floor + 1.2, 4);
        expect(fence.colliders.some(c => x >= c.minX - 1e-6 && x <= c.maxX + 1e-6 && z >= c.minZ - 1e-6 && z <= c.maxZ + 1e-6 && floor >= c.minY - 0.005 && floor + 1.2 <= c.maxY + 0.005)).toBe(true);
      }
    }
    for (const c of fence.colliders) {
      expect(Object.values(c).every(Number.isFinite)).toBe(true); expect(c.maxY).toBeGreaterThan(c.minY);
      expect(c.maxX < BOUNDS.minX || c.minX > BOUNDS.maxX || c.maxZ < BOUNDS.minZ || c.minZ > BOUNDS.maxZ).toBe(true);
      expect(Math.max(c.maxX - c.minX, c.maxZ - c.minZ)).toBeLessThan(8.13);
    }
    meshes.forEach(m => m.geometry.dispose()); material.dispose();
  });
});
