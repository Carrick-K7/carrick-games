import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { POOL, type VillaCollider } from './villaWorld.js';
import { VILLA_BUILDING_FOOTPRINT, VILLA_ESTATE_BOUNDS, VILLA_ESTATE_FENCE_SEGMENTS, VILLA_POND, VILLA_POND_BOUNDS, villaTerrainHeight, villaTerrainNormal } from './villaEstateLayout.js';

type Point = { x: number; z: number };
function halfPlane(points: readonly Point[], a: Point, b: Point, inside: boolean): Point[] {
  const out: Point[] = [], distance = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!, dp = distance(p), dq = distance(q);
    const ip = inside ? dp >= 0 : dp <= 0, iq = inside ? dq >= 0 : dq <= 0;
    if (ip) out.push(p);
    if (ip !== iq) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  }
  return out;
}
/** Carve a convex hole from a convex cell into non-overlapping convex pieces. */
function subtract(points: readonly Point[], hole: readonly Point[]): Point[][] {
  const pieces: Point[][] = []; let remainder = [...points];
  for (let i = 0; i < hole.length && remainder.length >= 3; i++) {
    const a = hole[i]!, b = hole[(i + 1) % hole.length]!;
    const outside = halfPlane(remainder, a, b, false);
    if (outside.length >= 3) pieces.push(outside);
    remainder = halfPlane(remainder, a, b, true);
  }
  return pieces;
}
const rect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }): Point[] => [
  { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ },
];
/** One sampled lawn mesh, with real pool/pond openings and no long flat triangles. */
export function createVillaTerrainGeometry(): THREE.BufferGeometry {
  const bounds = VILLA_ESTATE_BOUNDS, positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const pond = Array.from({ length: 128 }, (_, i) => {
    const angle = i * Math.PI * 2 / 128;
    // Circumscribe, rather than inscribe, the analytical water ellipse: every
    // chord stays outside it, with at most 3mm extra covered by the visible bank.
    const scale = 1 / Math.cos(Math.PI / 128);
    return { x: VILLA_POND.x + Math.cos(angle) * VILLA_POND.radiusX * scale, z: VILLA_POND.z + Math.sin(angle) * VILLA_POND.radiusZ * scale };
  });
  const pool = rect(POOL);
  // The lawn must not run under the house or garage: its flat interior surface
  // is exactly coplanar with the interior slabs and the lift car floor, which
  // z-fights (a flickering threshold and a grass-looking lift floor).
  const buildings = rect(VILLA_BUILDING_FOOTPRINT);
  const grid = (min: number, max: number, extra: number[]) => [...new Set([min, max, ...Array.from({ length: Math.ceil(max - min) }, (_, i) => min + i), ...extra])].filter(v => v >= min && v <= max).sort((a, b) => a - b);
  const xs = grid(bounds.minX, bounds.maxX, [POOL.minX, POOL.maxX, VILLA_BUILDING_FOOTPRINT.minX, VILLA_BUILDING_FOOTPRINT.maxX]);
  const zs = grid(bounds.minZ, bounds.maxZ, [POOL.minZ, POOL.maxZ, VILLA_BUILDING_FOOTPRINT.minZ, VILLA_BUILDING_FOOTPRINT.maxZ]);
  const append = (p: Point) => {
    const normal = villaTerrainNormal(p.x, p.z);
    positions.push(p.x, villaTerrainHeight(p.x, p.z) - .022, p.z);
    normals.push(normal.x, normal.y, normal.z); uvs.push(p.x / 2.5, p.z / 2.5);
  };
  for (let x = 0; x + 1 < xs.length; x++) for (let z = 0; z + 1 < zs.length; z++) {
    const cell = { minX: xs[x]!, maxX: xs[x + 1]!, minZ: zs[z]!, maxZ: zs[z + 1]! };
    let polygons = [rect(cell)];
    for (const [hole, r] of [[buildings, VILLA_BUILDING_FOOTPRINT], [pool, POOL], [pond, VILLA_POND_BOUNDS]] as const) {
      if (cell.maxX <= r.minX || cell.minX >= r.maxX || cell.maxZ <= r.minZ || cell.minZ >= r.maxZ) continue;
      polygons = polygons.flatMap(polygon => subtract(polygon, hole));
    }
    for (const polygon of polygons) for (let i = 1; i + 1 < polygon.length; i++) {
      const a = polygon[0]!, b = polygon[i]!, c = polygon[i + 1]!;
      if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-8) continue;
      // Reverse XZ winding so the visible normal points up.
      append(a); append(c); append(b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { gridMetres: 1, openings: ['building', 'pool', 'pond'], south: '+Z', north: '-Z' };
  return geometry;
}
export function createVillaEstateFence(parent: THREE.Object3D, wood: THREE.Material): { colliders: VillaCollider[] } {
  const b = new VillaModelBuilder(parent, 'villa-estate-fence');
  for (const segment of VILLA_ESTATE_FENCE_SEGMENTS) {
    const dx = segment.to.x - segment.from.x, dz = segment.to.z - segment.from.z;
    const count = Math.ceil(Math.hypot(dx, dz) / 2);
    const point = (i: number) => ({ x: segment.from.x + dx * i / count, z: segment.from.z + dz * i / count });
    for (let i = 0; i <= count; i++) {
      const p = point(i), y = villaTerrainHeight(p.x, p.z);
      b.box(p.x, y + .6, p.z, .12, 1.2, .12, wood, .008);
      if (i === count) continue;
      const q = point(i + 1), qy = villaTerrainHeight(q.x, q.z);
      for (const h of [.35, .9]) b.beam([p.x, y + h, p.z], [q.x, qy + h, q.z], .044, wood, 6);
    }
    // Broad-phase chunks remain short enough to follow the rolling ground.
    for (let i = 0; i < count; i += 4) {
      const p = point(i), q = point(Math.min(count, i + 4));
      const heights = Array.from({ length: 5 }, (_, j) => villaTerrainHeight(p.x + (q.x - p.x) * j / 4, p.z + (q.z - p.z) * j / 4));
      b.colliders.push({ minX: Math.min(p.x, q.x) - .06, maxX: Math.max(p.x, q.x) + .06, minZ: Math.min(p.z, q.z) - .06, maxZ: Math.max(p.z, q.z) + .06, minY: Math.min(...heights), maxY: Math.max(...heights) + 1.2 });
    }
  }
  b.finish(); b.root.userData.bounds = VILLA_ESTATE_BOUNDS;
  return { colliders: b.colliders };
}
