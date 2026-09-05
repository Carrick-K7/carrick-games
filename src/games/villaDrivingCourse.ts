import * as THREE from 'three';
import { VILLA_DRIVING_COURSE, type VillaDrivingState } from './villaDriving.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

/** A casual, metre-scale practice yard, not an official examination simulation. */
export function createVillaDrivingCourse(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state: VillaDrivingState): void } {
  const root = new THREE.Group(); root.name = 'villa-driving-course'; parent.add(root);
  const model = new VillaModelBuilder(root, 'practice-yard');
  const asphalt = villaMaterial(0x525856, 0.98), paint = villaMaterial(0xe4dfc2, 0.95);
  const orange = villaMaterial(0xc96935, 0.88), rubber = villaMaterial(0x333835, 0.96), white = villaMaterial(0xe5e7df, 0.9);
  const colliders: VillaCollider[] = [];
  // Top .014 is above terrain, markings .023 above asphalt; no coincident planes.
  model.box(7, 0.004, 39, 34, 0.02, 28, asphalt, 0);
  model.box(16, 0.004, 13.5, 6, 0.02, 23, asphalt, 0);
  const line = (ax: number, az: number, bx: number, bz: number, width = 0.09) => {
    const length = Math.hypot(bx - ax, bz - az);
    model.geometry(new THREE.BoxGeometry(width, 0.008, length), paint, [(ax + bx) / 2, 0.023, (az + bz) / 2], [0, Math.atan2(bx - ax, bz - az), 0]);
  };
  const cone = (x: number, z: number) => {
    model.box(x, 0.045, z, 0.38, 0.06, 0.38, rubber, 0.025);
    model.cylinder(x, 0.31, z, 0.04, 0.16, 0.5, orange, [0, 0, 0], 12);
    model.cylinder(x, 0.37, z, 0.069, 0.09, 0.085, white, [0, 0, 0], 12);
    colliders.push({ minX: x - 0.19, maxX: x + 0.19, minZ: z - 0.19, maxZ: z + 0.19, minY: 0, maxY: 0.56 });
  };
  // Open garage approach and entrance: no cones or kerbs across the driveway.
  line(13.2, 2.1, 13.2, 24.7); line(18.8, 2.1, 18.8, 24.7);
  line(-9.5, 25.5, 12, 25.5); line(20, 25.5, 23.5, 25.5);
  line(23.5, 25.5, 23.5, 52.5); line(23.5, 52.5, -9.5, 52.5); line(-9.5, 52.5, -9.5, 25.5);
  const reverse = VILLA_DRIVING_COURSE.reverseBay;
  line(reverse.minX, reverse.minZ, reverse.maxX, reverse.minZ);
  for (const x of [reverse.minX, reverse.maxX]) { line(x, reverse.minZ, x, reverse.maxZ); cone(x, reverse.minZ); cone(x, reverse.maxZ); }
  const parallel = VILLA_DRIVING_COURSE.parallelBay;
  line(parallel.minX, parallel.maxZ, parallel.maxX, parallel.maxZ);
  for (const x of [parallel.minX, parallel.maxX]) { line(x, parallel.minZ, x, parallel.maxZ); cone(x, parallel.minZ); cone(x, parallel.maxZ); }
  // Smooth S painted edges, 5.6m apart, with sparse cones outside the turning envelope.
  const curve = new THREE.CatmullRomCurve3(VILLA_DRIVING_COURSE.sPoints.map(p => new THREE.Vector3(p.x, 0, p.z)));
  for (const side of [-1, 1]) {
    let last: THREE.Vector3 | undefined;
    for (let i = 0; i <= 48; i++) {
      const point = curve.getPoint(i / 48), tangent = curve.getTangent(i / 48);
      point.x += tangent.z * 2.8 * side; point.z -= tangent.x * 2.8 * side;
      if (last) line(last.x, last.z, point.x, point.z);
      if (i % 16 === 0) cone(point.x, point.z);
      last = point;
    }
  }
  // Right-angle practice has ample turning space rather than a car-width impossible elbow.
  line(20, 35, 20, 50); line(20, 50, 8, 50);
  line(14, 35, 14, 41); line(14, 41, 8, 41);
  for (const [x, z] of [[20, 35], [20, 43], [20, 50], [14, 41], [8, 50]]) cone(x, z);
  // Small physical driving-school board, never room-name labels or extra lights.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e5e2d5'; ctx.fillRect(0, 0, 512, 192); ctx.fillStyle = '#39473f';
      ctx.textAlign = 'center'; ctx.font = '500 40px system-ui'; ctx.fillText('慢行 · 驾驶练习', 256, 65);
      ctx.font = '28px system-ui'; ctx.fillText('倒库 / 侧方 / 曲线 / 直角', 256, 115); ctx.fillText('Practice yard · 25 km/h', 256, 155);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.01), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      sign.name = 'practice-yard-sign'; sign.position.set(21.7, 1.75, 26); sign.rotation.y = Math.PI; root.add(sign);
      for (const x of [20.7, 22.7]) model.cylinder(x, 0.85, 26, 0.035, 0.035, 1.7, rubber);
      colliders.push({ minX: 20.3, maxX: 23.1, minZ: 25.9, maxZ: 26.1, minY: 0, maxY: 2.3 });
    }
  }
  model.finish();
  return { colliders, update(state) { root.userData.contact = state.contact; root.userData.progress = state.progress; } };
}
