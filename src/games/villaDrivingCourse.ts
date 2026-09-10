import * as THREE from 'three';
import { VILLA_SCENIC_ROAD, type VillaDrivingState } from './villaDriving.js';
import { villaTerrainHeight } from './villaEstateLayout.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

type RoadPoint = { x: number; z: number };
/** The original garden oval is retained. A long flowing branch shares its east
 * and west tangents, so either short or long scenic drive is continuous. */
export const VILLA_SOUTH_ROAD_KNOTS: readonly RoadPoint[] = [
  { x: 23, z: 28 }, { x: 21, z: 39 }, { x: 23, z: 51 }, { x: 30, z: 65 },
  { x: 32, z: 81 }, { x: 25, z: 100 }, { x: 32, z: 120 }, { x: 30, z: 139 },
  { x: 19, z: 150 }, { x: 4, z: 148 }, { x: -7, z: 133 }, { x: -8, z: 112 },
  { x: 0, z: 94 }, { x: 1, z: 74 }, { x: -2, z: 62 }, { x: -9, z: 51 },
  { x: -9, z: 39 }, { x: -9, z: 28 },
];
const catmull = (a: number, b: number, c: number, d: number, t: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
/** End knots only constrain tangent; start/end at the original oval extremes. */
export function villaSouthRoadPoint(t: number): RoadPoint {
  const spans = VILLA_SOUTH_ROAD_KNOTS.length - 3, u = Math.max(0, Math.min(1, t)) * spans, i = Math.min(spans - 1, Math.floor(u)), f = u - i;
  const [a, b, c, d] = VILLA_SOUTH_ROAD_KNOTS.slice(i, i + 4);
  return { x: catmull(a.x, b.x, c.x, d.x, f), z: catmull(a.z, b.z, c.z, d.z, f) };
}
export const VILLA_SOUTH_ROAD_SAMPLES: readonly RoadPoint[] = Array.from({ length: 481 }, (_, i) => villaSouthRoadPoint(i / 480));
export const VILLA_SCENIC_ROAD_SAMPLES: readonly RoadPoint[] = Array.from({ length: 145 }, (_, i) => {
  const a = i / 144 * Math.PI * 2, r = VILLA_SCENIC_ROAD;
  return { x: r.x + Math.cos(a) * r.radiusX, z: r.z + Math.sin(a) * r.radiusZ };
});
export const VILLA_ESTATE_ROAD_PATHS: readonly (readonly RoadPoint[])[] = [VILLA_SCENIC_ROAD_SAMPLES, VILLA_SOUTH_ROAD_SAMPLES, [{ x: 16.2, z: 2 }, { x: 16.2, z: 34 }]];
export function villaDistanceToRoad(x: number, z: number): number {
  let best = Infinity;
  for (const path of VILLA_ESTATE_ROAD_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
/** Every road vertex samples authoritative terrain, including cross-road slope.
 * Broad ribbons are subdivided across width to avoid bridging the gentle hills. */
export function createVillaDrivingCourse(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state: VillaDrivingState): void } {
  const root = new THREE.Group(); root.name = 'villa-driving-course'; parent.add(root);
  root.userData = { kind: 'scenic-loop', roadWidth: VILLA_SCENIC_ROAD.width, drivewayWidth: VILLA_SCENIC_ROAD.drivewayWidth, examination: false, southExtent: 150, terrainSampled: true };
  const model = new VillaModelBuilder(root, 'garden-road');
  const asphalt = villaMaterial(0x59605b, .98), shoulder = villaMaterial(0xa3997e, .99);
  const paint = villaMaterial(0xd8d4be, .95), bark = villaMaterial(0x7c634a, .94), leaf = villaMaterial(0x526d49, .97);
  asphalt.name = 'estate-road-asphalt'; shoulder.name = 'estate-road-shoulder';
  const ribbon = (points: readonly RoadPoint[], width: number, lift: number, material: THREE.Material) => {
    const vertices: number[] = [], indices: number[] = [], uv: number[] = [], across = Math.max(2, Math.ceil(width / 1.2));
    for (let i = 0; i < points.length; i++) {
      const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
      for (let j = 0; j <= across; j++) {
        const offset = (j / across - .5) * width, x = p.x + dz / length * offset, z = p.z - dx / length * offset;
        vertices.push(x, villaTerrainHeight(x, z) + lift, z); uv.push(j / across, i / 6);
      }
      if (i) for (let j = 0; j < across; j++) { const n = (i - 1) * (across + 1) + j; indices.push(n, n + across + 1, n + 1, n + 1, n + across + 1, n + across + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); model.geometry(geometry, material);
  };
  const half = VILLA_SCENIC_ROAD.width / 2;
  for (const [index, path] of VILLA_ESTATE_ROAD_PATHS.entries()) {
    const width = index === 2 ? VILLA_SCENIC_ROAD.drivewayWidth : half * 2;
    ribbon(path, width + .9, .022 + index * .002, shoulder); ribbon(path, width, .041 + index * .003, asphalt);
  }
  // Four-bay apron gently narrows into the original driveway; not a box crossing
  // the preserved lemon trunk (23.4,7). Broad area stops at z5, north of that tree.
  ribbon([{ x: 23.2, z: 2 }, { x: 23.2, z: 3.5 }, { x: 23.2, z: 5 }], 21.2, .048, asphalt);
  const apron = [{ x: 29.5, z: 4.5 }, { x: 29.5, z: 13 }, { x: 27, z: 20 }, { x: 23.4, z: 27 }, { x: 20.3, z: 33 }];
  ribbon(apron, 7, .024, shoulder); ribbon(apron, 6.3, .049, asphalt);
  // Paint stays on the old oval's quiet outer edge, interrupted at all merges.
  for (const side of [-1, 1]) for (let i = 0; i < VILLA_SCENIC_ROAD_SAMPLES.length - 1; i++) {
    const a = VILLA_SCENIC_ROAD_SAMPLES[i], b = VILLA_SCENIC_ROAD_SAMPLES[i + 1], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), offset = side * (half - .16);
    if ((a.x > 11.6 && a.z < 35) || Math.abs(a.z - 39) < 9) continue;
    const x = (a.x + b.x) / 2 + dz / length * offset, z = (a.z + b.z) / 2 - dx / length * offset;
    model.geometry(new THREE.BoxGeometry(.055, .004, length), paint, [x, villaTerrainHeight(x, z) + .053, z], [0, Math.atan2(dx, dz), 0]);
  }
  // Preserve the three familiar island trees and their collider identities/API.
  for (const [x, z, height] of [[1, 39, 3.8], [6, 40, 4.2], [10, 38, 3.4]]) {
    const y = villaTerrainHeight(x, z);
    model.cylinder(x, y + height * .4, z, .10, .14, height * .8, bark);
    model.ellipsoid(x, y + height * .82, z, 1.3, 1.5, 1.25, leaf); model.collide(x, y, z, .3, height, .3);
  }
  model.finish();
  return { colliders: model.colliders, update(state) { root.userData.contact = state.contact; root.userData.distance = state.distance; } };
}
