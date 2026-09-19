import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_ESTATE_FIELDS, VILLA_ESTATE_VIEWPOINT, VILLA_GARAGE_EXTENT, VILLA_POND, villaTerrainHeight } from './villaEstateLayout.js';
import type { VillaCollider } from './villaWorld.js';

type Point = { x: number; z: number };
/** Static scene-owned additions ONLY: no base lawn, old garden, garage shell or
 * perimeter fence. Builder batches by material; scene traversal owns disposal. */
export function createVillaEstateModel(parent: THREE.Object3D): { colliders: VillaCollider[] } {
  const root = new THREE.Group(); root.name = 'villa-estate-additions'; root.userData = { static: true, terrainSampled: true }; parent.add(root);
  const model = new VillaModelBuilder(root, 'estate-landscape');
  const soil = villaMaterial(0x796048, 1), path = villaMaterial(0xbaae91, 1), bank = villaMaterial(0x8d8b66, 1);
  const timber = villaMaterial(0x907451, .87), leaf = villaMaterial(0x637c46, .97), cabbage = villaMaterial(0x87a16e, .96);
  const lavender = villaMaterial(0x87748f, .98), corn = villaMaterial(0xc0b36a, .98), stone = villaMaterial(0x9d9b8c, .93);
  soil.name = 'cultivated-soil'; path.name = 'estate-walking-gravel';
  const surface = (points: Point[], triangles: number[], material: THREE.Material, lift: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, villaTerrainHeight(p.x, p.z) + lift, p.z]), 3));
    g.setIndex(triangles); g.computeVertexNormals(); model.geometry(g, material);
  };
  const patch = (minX: number, maxX: number, minZ: number, maxZ: number, material: THREE.Material, lift = .024) => {
    const nx = Math.ceil((maxX - minX) / .8), nz = Math.ceil((maxZ - minZ) / .8), points: Point[] = [], indices: number[] = [];
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) points.push({ x: minX + (maxX - minX) * j / nx, z: minZ + (maxZ - minZ) * i / nz });
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const n = i * (nx + 1) + j; indices.push(n, n + nx + 1, n + 1, n + 1, n + nx + 1, n + nx + 2); }
    surface(points, indices, material, lift);
  };
  // Walkable low beds, distinct crop morphology and neat but imperfect rows.
  // Foliage is soft scenery, not invisible solid blocks spanning the farmland.
  for (const field of VILLA_ESTATE_FIELDS) {
    const marker = new THREE.Object3D(); marker.name = `estate-field-${field.crop}`; marker.userData = { ...field, cultivated: true }; root.add(marker);
    patch(field.minX, field.maxX, field.minZ, field.maxZ, soil, .037);
    for (let x = field.minX + .55; x < field.maxX - .2; x += .98) {
      for (let z = field.minZ + .55; z < field.maxZ - .2; z += field.crop === 'corn' ? 1.1 : 1.3) {
        const y = villaTerrainHeight(x, z);
        if (field.crop === 'cabbage') {
          model.ellipsoid(x, y + .17, z, .21, .17, .23, cabbage);
          for (const side of [-1, 1]) model.ellipsoid(x + side * .16, y + .11, z, .17, .055, .22, leaf);
        } else if (field.crop === 'corn') {
          model.cylinder(x, y + .58, z, .012, .024, 1.15, leaf, [0, 0, 0], 5);
          for (const side of [-1, 1]) {
            model.beam([x, y + .45, z], [x + side * .32, y + .68, z + .14], .029, leaf, 5);
            model.beam([x, y + .76, z], [x + side * .27, y + .94, z - .1], .022, leaf, 5);
          }
          model.ellipsoid(x + .03, y + .73, z + .045, .043, .16, .052, corn);
          model.beam([x, y + 1.1, z], [x + .05, y + 1.32, z], .014, corn, 5);
        } else {
          model.ellipsoid(x, y + .15, z, .23, .13, .26, leaf);
          for (const dx of [-.12, 0, .12]) {
            model.beam([x + dx, y + .10, z], [x + dx, y + .40, z + .035], .007, leaf, 5);
            model.ellipsoid(x + dx, y + .39, z + .035, .04, .11, .04, lavender);
          }
        }
      }
    }
    // Timber edges are ankle-low finishes, not full-field support colliders.
    for (const x of [field.minX, field.maxX]) for (let z = field.minZ; z < field.maxZ; z += 1) {
      const next = Math.min(field.maxZ, z + 1);
      model.beam([x, villaTerrainHeight(x, z) + .045, z], [x, villaTerrainHeight(x, next) + .045, next], .045, timber, 5);
    }
  }
  const walkway = (knots: Point[], width = 1.6) => {
    // A single stitched ribbon: per-segment strips left triangular grass slits
    // at every bend of the pond path. Sample across width as well as length.
    const centres: Point[] = [knots[0]], points: Point[] = [], indices: number[] = [];
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .45));
      for (let j = 1; j <= n; j++) centres.push({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n });
    }
    const last = knots[knots.length - 1];
    const closed = Math.hypot(knots[0].x - last.x, knots[0].z - last.z) < .001;
    const across = Math.ceil(width / .45), stride = across + 1;
    centres.forEach((p, i) => {
      const a = centres[i ? i - 1 : closed ? centres.length - 2 : 0];
      const b = centres[i === centres.length - 1 && closed ? 1 : Math.min(centres.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
      for (let j = 0; j <= across; j++) { const offset = (j / across - .5) * width; points.push({ x: p.x + dz / length * offset, z: p.z - dx / length * offset }); }
      if (i) for (let j = 0; j < across; j++) { const k = (i - 1) * stride + j; indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1); }
    });
    surface(points, indices, path, .063);
  };
  walkway([{ x: -13.5, z: 24 }, { x: -13.6, z: 31 }, { x: -13.7, z: 50 }, { x: -12, z: 63 }]);
  const pondWalk = Array.from({ length: 97 }, (_, i) => { const a = i / 96 * Math.PI * 2; return { x: VILLA_POND.x + Math.cos(a) * 9.3, z: VILLA_POND.z + Math.sin(a) * 13 }; });
  walkway(pondWalk, 1.35);
  walkway([{ x: -5, z: 88 }, { x: 7, z: 100 }, { x: 13, z: 114 }, { x: 14, z: 127 }], 1.7);
  // Level natural pond: shape follows an irregular shoreline inside the exact
  // unsafe ellipse. A sloping bank fills the ground cutout without covering water.
  const pondRoot = new THREE.Group(); pondRoot.name = 'estate-natural-pond'; root.add(pondRoot);
  pondRoot.userData = { waterY: VILLA_POND.waterY, unsupported: true, staticWater: true };
  // Clear water needs something to be clear *through*: a silt bed and a basin
  // wall so the terrain cutout never shows as a hole under the surface.
  const water = new THREE.MeshStandardMaterial({ color: 0x559b9d, roughness: .16, metalness: .04, transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide });
  const bed = new THREE.MeshStandardMaterial({ color: 0xa8a687, roughness: .93, metalness: 0 });
  const silt = new THREE.MeshStandardMaterial({ color: 0xb0a480, roughness: .95, metalness: 0 });
  const bedY = VILLA_POND.waterY - .62;
  const bedPoints: number[] = [VILLA_POND.x, bedY, VILLA_POND.z], bedIndices: number[] = [];
  const basinPoints: number[] = [], basinIndices: number[] = [];
  const waterPoints: number[] = [VILLA_POND.x, VILLA_POND.waterY, VILLA_POND.z], bankPoints: number[] = [], waterIndices: number[] = [], bankIndices: number[] = [], segments = 96;
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, radius = .943 + .02 * Math.sin(a * 3) + .012 * Math.cos(a * 5);
    const x = VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * radius, z = VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * radius;
    waterPoints.push(x, VILLA_POND.waterY, z);
    const ox = VILLA_POND.x + Math.cos(a) * (VILLA_POND.radiusX + 1.15), oz = VILLA_POND.z + Math.sin(a) * (VILLA_POND.radiusZ + 1.15);
    bankPoints.push(x, VILLA_POND.waterY - .014, z, ox, villaTerrainHeight(ox, oz) + .025, oz);
    if (i < segments) { waterIndices.push(0, i + 2, i + 1); const n = i * 2; bankIndices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    const bx = VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * radius * .82, bz = VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * radius * .82;
    bedPoints.push(bx, bedY, bz);
    basinPoints.push(bx, bedY, bz, x, VILLA_POND.waterY, z);
    if (i < segments) { bedIndices.push(0, i + 2, i + 1); const m = i * 2; basinIndices.push(m, m + 2, m + 1, m + 1, m + 2, m + 3); }
  }
  for (const [vertices, indices, material, name] of [[waterPoints, waterIndices, water, 'estate-pond-water'], [bankPoints, bankIndices, bank, 'estate-pond-bank'],
    [bedPoints, bedIndices, bed, 'estate-pond-bed'], [basinPoints, basinIndices, silt, 'estate-pond-basin']] as const) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material); mesh.name = name; mesh.receiveShadow = true; pondRoot.add(mesh);
  }
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, x = VILLA_POND.x + Math.cos(a) * 7.35, z = VILLA_POND.z + Math.sin(a) * 10.85, y = villaTerrainHeight(x, z);
    if (i % 4 === 0) model.ellipsoid(x, y + .11, z, .30, .15, .20, stone);
    else for (const dx of [-.10, .03, .11]) model.beam([x + dx, y, z], [x + dx + .03, y + .45 + (i % 3) * .12, z], .012, leaf, 5);
  }
  // Pebbles and silt patches on the bed, so clear water reads as shallow rather
  // than as a tinted disc floating over a flat plate.
  let seed = 20260912;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 54; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .76;
    const px = VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * r, pz = VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * r;
    const size = .10 + random() * .16;
    model.ellipsoid(px, bedY + size * .32, pz, size, size * .34, size * (.8 + random() * .4), i % 3 === 0 ? stone : bed);
  }
  const v = VILLA_ESTATE_VIEWPOINT;
  const circle = Array.from({ length: 65 }, (_, i) => { const a = i / 64 * Math.PI * 2; return { x: v.x + Math.cos(a) * v.radius, z: v.z + Math.sin(a) * v.radius }; });
  surface([{ x: v.x, z: v.z }, ...circle], Array.from({ length: 64 }, (_, i) => [0, i + 2, i + 1]).flat(), path, .064);
  const view = new THREE.Object3D(); view.name = 'estate-hill-viewpoint'; view.position.set(v.x, villaTerrainHeight(v.x, v.z), v.z); view.userData = { northViewToHouse: true }; root.add(view);
  for (const [x, z, scale] of [[18, 130, .8], [16.8, 131, .6], [17.7, 131.6, .5]]) {
    const y = villaTerrainHeight(x, z); model.ellipsoid(x, y + scale * .3, z, scale, scale * .5, scale * .68, stone); model.collide(x, y, z, scale * 1.5, scale * .8, scale);
  }
  model.finish();

  const workshop = new VillaModelBuilder(root, 'garage-maintenance-equipment');
  const metal = villaMaterial(0x88928e, .35, .7), charcoal = villaMaterial(0x28312f, .7), red = villaMaterial(0x97594a, .54, .15);
  // Authored as offsets from the garage's west wall, so moving the garage east
  // carries its equipment instead of leaving it standing inside the house.
  const g = VILLA_GARAGE_EXTENT;
  const gx = (x: number) => x - 12 + g.minX;
  // The north-wall props also track the wall: authored at minZ=-8 originally.
  const gz = (z: number) => z + (g.minZ + 8);
  // Rear workbench; the two reserved bay centres stay drive-through corridors.
  workshop.box(gx(28.8), .89, gz(-7.24), 3.6, .10, .72, timber, .025);
  for (const x of [27.25, 30.35]) for (const z of [gz(-7.48), gz(-7)]) workshop.box(gx(x), .43, z, .075, .86, .075, metal, .006);
  workshop.box(gx(28.8), 1.57, gz(-7.64), 3.55, 1.08, .045, charcoal, .006);
  for (let i = 0; i < 9; i++) {
    const x = gx(27.4 + i * .35);
    workshop.beam([x, 1.32, gz(-7.58)], [x, 1.7 + (i % 3) * .09, gz(-7.58)], .021, metal, 6);
    workshop.geometry(new THREE.TorusGeometry(.045, .013, 6, 12, Math.PI * 1.5), metal, [x, 1.76 + (i % 3) * .09, gz(-7.58)]);
  }
  workshop.collide(gx(28.8), 0, gz(-7.28), 3.7, 2.14, .85);
  // Tool trolley along east wall, real drawers, casters and push handle. It
  // parks north of the east window, clear of the SUV's door/exit corridor: at
  // the old z=-3.8 spot it clipped the reserved-2 exit anchor and blocked boarding.
  workshop.box(gx(33.8), .55, -8.0, .62, .72, 1.03, red, .026);
  workshop.box(gx(33.8), .93, -8.0, .68, .055, 1.09, charcoal, .014);
  for (let i = 0; i < 5; i++) workshop.box(gx(33.475), .30 + i * .12, -8.0, .018, .027, .69, metal, .006);
  // Casters touch the slab: a wheel floating 5 cm read as clipping, not height.
  for (const x of [33.6, 34]) for (const z of [-8.4, -7.6]) workshop.cylinder(gx(x), .075, z, .075, .075, .06, charcoal, [0, 0, Math.PI / 2], 12);
  workshop.beam([gx(33.52), .83, -8.5], [gx(33.52), .83, -8.75], .019, metal); workshop.beam([gx(33.52), .83, -8.75], [gx(34.05), .83, -8.75], .019, metal);
  workshop.collide(gx(33.8), 0, -8.1, .75, .98, 1.4);
  // Floor jack stays parked against the northern wall, not under a spawn vehicle.
  workshop.box(gx(32.6), .06, gz(-6.9), .44, .12, .95, red, .025);
  workshop.beam([gx(32.6), .1, gz(-6.8)], [gx(32.6), .28, gz(-7.12)], .075, metal);
  workshop.cylinder(gx(32.6), .28, gz(-7.12), .105, .105, .035, charcoal);
  workshop.beam([gx(32.6), .11, gz(-6.55)], [gx(32.6), .97, gz(-6.28)], .018, metal); workshop.collide(gx(32.6), 0, gz(-6.85), .58, 1.06, 1.28);
  for (let i = 0; i < 3; i++) workshop.geometry(new THREE.TorusGeometry(.29, .105, 10, 28), charcoal, [gx(33.76), .105 + i * .21, gz(-5.75)], [Math.PI / 2, 0, 0]);
  workshop.collide(gx(33.76), 0, gz(-5.75), .82, .68, .82);
  const charger = new THREE.Group(); charger.name = 'garage-charging-pedestal'; charger.userData = { kind: 'charging-pedestal', count: 1 }; root.add(charger);
  const charge = new VillaModelBuilder(charger, 'charging-pedestal-details');
  const cx = gx(13.05);
  charge.box(cx, .60, -6.3, .24, 1.2, .22, metal, .025); charge.box(cx, 1.25, -6.3, .37, .43, .25, charcoal, .045);
  charge.box(cx, 1.30, -6.164, .24, .11, .012, villaMaterial(0x8caea2, .3), .009);
  charge.geometry(new THREE.TorusGeometry(.18, .018, 6, 24), charcoal, [cx, .82, -6.15]); charge.box(cx + .16, 1.01, -6.12, .045, .12, .075, charcoal, .013);
  charge.collide(cx, 0, -6.27, .47, 1.5, .47); charge.finish(); workshop.finish();
  return { colliders: [...model.colliders, ...workshop.colliders, ...charge.colliders] };
}
