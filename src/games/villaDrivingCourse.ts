import * as THREE from 'three';
import { VILLA_SCENIC_ROAD, type VillaDrivingState } from './villaDriving.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

/** A broad private garden road. No cones, examination bays, scores or signs. */
export function createVillaDrivingCourse(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state: VillaDrivingState): void } {
  const root = new THREE.Group(); root.name = 'villa-driving-course'; parent.add(root);
  root.userData = { kind: 'scenic-loop', roadWidth: VILLA_SCENIC_ROAD.width, drivewayWidth: VILLA_SCENIC_ROAD.drivewayWidth, examination: false };
  const model = new VillaModelBuilder(root, 'garden-road');
  const asphalt = villaMaterial(0x59605b, .98), shoulder = villaMaterial(0xa3997e, .99);
  const paint = villaMaterial(0xd8d4be, .95), bark = villaMaterial(0x7c634a, .94), leaf = villaMaterial(0x526d49, .97);
  const road = VILLA_SCENIC_ROAD, segments = 96;
  const point = (t: number, offset: number) => {
    const a = t * Math.PI * 2, tx = -road.radiusX * Math.sin(a), tz = road.radiusZ * Math.cos(a), length = Math.hypot(tx, tz);
    return { x: road.x + Math.cos(a) * road.radiusX + tz / length * offset, z: road.z + Math.sin(a) * road.radiusZ - tx / length * offset };
  };
  const ribbon = (inner: number, outer: number, y: number, material: THREE.Material) => {
    const vertices: number[] = [], indices: number[] = [], uv: number[] = [];
    for (let i = 0; i <= segments; i++) for (const [j, offset] of [inner, outer].entries()) {
      const p = point(i / segments, offset); vertices.push(p.x, y, p.z); uv.push(j, i / 6);
    }
    for (let i = 0; i < segments; i++) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); model.geometry(geometry, material);
  };
  const half = road.width / 2;
  ribbon(-half - .45, half + .45, .018, shoulder); ribbon(-half, half, .031, asphalt);
  // A wide, uninterrupted garage approach merges into the oval, without a barrier.
  model.box(16.2, .011, 18, road.drivewayWidth + .8, .022, 32, shoulder, 0);
  model.box(16.2, .024, 18, road.drivewayWidth, .022, 32, asphalt, 0);
  // Low-key edge delineation, not a lesson layout; leave the driveway merge open.
  for (const side of [-1, 1]) for (let i = 0; i < segments; i++) {
    const a = point(i / segments, side * (half - .16)), b = point((i + 1) / segments, side * (half - .16));
    if ((a.x > 11.6 && a.x < 20.8 && a.z < 34.1) || (b.x > 11.6 && b.x < 20.8 && b.z < 34.1)) continue;
    model.geometry(new THREE.BoxGeometry(.07, .005, Math.hypot(b.x - a.x, b.z - a.z)), paint,
      [(a.x + b.x) / 2, .039, (a.z + b.z) / 2], [0, Math.atan2(b.x - a.x, b.z - a.z), 0]);
  }
  // A small planted island gives the road a natural destination and open sightlines.
  for (const [x, z, height] of [[1, 39, 3.8], [6, 40, 4.2], [10, 38, 3.4]]) {
    model.cylinder(x, height * .4, z, .10, .14, height * .8, bark);
    model.ellipsoid(x, height * .82, z, 1.3, 1.5, 1.25, leaf);
    model.collide(x, 0, z, .3, height, .3);
  }
  model.finish();
  return { colliders: model.colliders, update(state) { root.userData.contact = state.contact; root.userData.distance = state.distance; } };
}
