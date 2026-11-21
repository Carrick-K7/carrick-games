import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_ESTATE_FIELDS, VILLA_ESTATE_VIEWPOINT, VILLA_GARAGE_EXTENT, VILLA_POND, villaTerrainHeight } from './villaEstateLayout.js';
import { NatureMesh, NaturePalette, add3, collar, fieldStone, margin, mix3, polar, type P3 } from './villaNatureGeometry.js';
import { addVillaFieldCorn, addVillaRosette } from './villaCropArt.js';
import { addVillaWaterMargin } from './villaWoodlandArt.js';
import { timberMember } from './villaOutdoorJoinery.js';
import { VILLA_SOUTH_ROAD_SAMPLES } from './villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
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
  for (const plant of [leaf, cabbage, lavender, corn]) { plant.side = THREE.DoubleSide; plant.vertexColors = true; }
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
  const castIron = villaMaterial(0x555950, .78, .32);
  // A few flush roadside catch basins: actual slats span the recessed sill, not
  // markings on the road or raised obstacles. Follow the real southern ribbon
  // frame and sample ground under both sides of every small grate on the hills.
  for (const [i, side] of [[77, 1], [185, -1], [298, 1]]) {
    const p = VILLA_SOUTH_ROAD_SAMPLES[i], q = VILLA_SOUTH_ROAD_SAMPLES[i + 1];
    const run = Math.hypot(q.x - p.x, q.z - p.z), fx = (q.x - p.x) / run, fz = (q.z - p.z) / run, offset = side * (VILLA_SCENIC_ROAD.width / 2 + .76);
    const at = (u: number, v: number, h: number): P3 => {
      const x = p.x + fz * (offset + u) + fx * v, z = p.z - fx * (offset + u) + fz * v;
      return [x, villaTerrainHeight(x, z) + h, z];
    };
    const bed = new NatureMesh(), a = bed.point(at(-.19,-.47,.008)), d = bed.point(at(.19,.47,.008));
    const b = bed.point(at(.19,-.47,.008)), c = bed.point(at(-.19,.47,.008)); bed.tri(a,c,b); bed.tri(b,c,d); model.geometry(bed.geometry(), soil);
    for (const u of [-.212, .212]) timberMember(model, at(u,-.54,.030), at(u,.54,.030), .074,.058,stone,.009);
    for (const v of [-.50,.50]) timberMember(model, at(-.175,v,.030), at(.175,v,.030), .078,.058,stone,.009);
    for (let j = 0; j < 10; j++) {
      const v = -.425 + j * .094; timberMember(model, at(-.194,v,.048), at(.194,v,.048), .041,.016,castIron,.003);
    }
  }
  // Walkable low beds, distinct crop morphology and neat but imperfect rows.
  // Foliage is soft scenery, not invisible solid blocks spanning the farmland.
  for (const field of VILLA_ESTATE_FIELDS) {
    const marker = new THREE.Object3D(); marker.name = `estate-field-${field.crop}`; marker.userData = { ...field, cultivated: true }; root.add(marker);
    patch(field.minX, field.maxX, field.minZ, field.maxZ, soil, .037);
    for (let x = field.minX + .55; x < field.maxX - .2; x += .98) {
      for (let z = field.minZ + .55; z < field.maxZ - .2; z += field.crop === 'corn' ? 1.1 : 1.3) {
        const y = villaTerrainHeight(x, z);
        const phase = x * 2.83 + z * 1.73;
        model.at(x, y + .025, z, phase, () => {
          if (field.crop === 'corn') { addVillaFieldCorn(model, leaf, corn, phase); return; }
          const art = new NaturePalette();
          if (field.crop === 'cabbage') addVillaRosette(art, [0, 0, 0], leaf, cabbage, phase, 1.48, true);
          else {
            for (let j = 0; j < 5; j++) {
              const a = j * 2.399 + phase, foot = polar(a, .024, 0), end = polar(a, .14 + .04 * Math.sin(a), .37 + .07 * Math.cos(a));
              art.get(leaf).stem([collar(foot, .008), collar(end, .003)], 4, 0, 0, true);
              for (let k = 0; k < 5; k++) art.get(leaf).blade(mix3(foot, end, .13 + .115 * k), polar(a + (k % 2 ? -.87 : .87), .107, .067), .015, margin.lance, .016);
              for (let k = 0; k < 4; k++) for (const side of [-1, 1]) art.get(lavender).blade(mix3(foot, end, .67 + .097 * k),
                polar(a + k * 1.74 + side, .030 - .003 * k, .031), .016, margin.spur, .006, .14, .30);
            }
          }
          art.finish(model);
        });
      }
    }
    // Long, shallow tilled ridges share the patch's terrain sampler. Their
    // tapering crests end before the timber curbs (no raised aisle obstacles).
    for (let x = field.minX + .55; x < field.maxX - .2; x += .98) {
      const earth = new NatureMesh(), dz = field.maxZ - field.minZ - .26, n = Math.ceil(dz / .85);
      for (let i = 0; i <= n; i++) {
        const z = field.minZ + .13 + dz * i / n, t = Math.min(1, i * .85, (n - i) * .85);
        for (const [w, h] of [[-.20, .038], [-.085, .045 + t * .021], [.046, .047 + t * .024], [.20, .038]]) earth.point([x + w, villaTerrainHeight(x + w, z) + h, z]);
        if (i) for (let j = 0; j < 3; j++) { const k = (i - 1) * 4 + j; earth.tri(k, k + 4, k + 1); earth.tri(k + 1, k + 4, k + 5); }
      }
      model.geometry(earth.geometry(), soil);
    }
    // Low cast-iron standpipe at the head of each irrigation line. The three
    // spokes span a genuinely open handwheel; its axle enters the riser.
    const ix = field.minX + .22, iz = field.minZ + .32, iy = villaTerrainHeight(ix, iz);
    model.at(ix, iy, iz, 0, () => {
      model.cylinder(0,.072,0,.026,.033,.105,castIron,[0,0,0],8);
      model.beam([0,.104,0],[.076,.104,0],.020,castIron,7);
      model.beam([.071,.109,0],[.083,.059,.008],.015,castIron,7);
      model.cylinder(0,.134,0,.010,.011,.048,castIron,[0,0,0],7);
      model.geometry(new THREE.TorusGeometry(.048,.007,5,13),castIron,[0,.158,0],[Math.PI/2,0,0]);
      for (let spoke=0;spoke<3;spoke++) model.beam([0,.158,0],polar(spoke*Math.PI*2/3,.048,.158),.004,castIron,5);
    });
    // Timber edges are ankle-low finishes, not full-field support colliders.
    for (const x of [field.minX, field.maxX]) for (let z = field.minZ; z < field.maxZ; z += 1) {
      const next = Math.min(field.maxZ, z + 1);
      timberMember(model, [x, villaTerrainHeight(x, z) + .049, z], [x, villaTerrainHeight(x, next) + .049, next], .079, .089, timber, .008);
      if (Math.round(z - field.minZ) % 3 === 0) model.cylinder(x, villaTerrainHeight(x, z) + .056, z, .054, .052, .113, timber, [0, 0, 0], 7);
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
    if (i % 4 === 0) {
      model.geometry(fieldStone(a * 2, .38, .19, .26), stone, [x, y + .085, z], [0, a, 0]);
      model.geometry(fieldStone(a + 5, .18, .092, .14), stone, [x + .32 * Math.sin(a), y + .038, z - .32 * Math.cos(a)], [0, a + 1, 0]);
    } else {
      model.at(x, y - .015, z, a, () => addVillaWaterMargin(model, .83 + .13 * (i % 3), a, leaf, cabbage, corn, i % 4 === 1));
    }
  }
  // Pebbles and silt patches on the bed, so clear water reads as shallow rather
  // than as a tinted disc floating over a flat plate.
  let seed = 20260912;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 54; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .76;
    const px = VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * r, pz = VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * r;
    const size = .10 + random() * .16;
    model.geometry(fieldStone(i * .783, size, size * .39, size * (.8 + random() * .4)), i % 3 === 0 ? stone : bed,
      [px, bedY + size * .11, pz], [0, a, 0]);
  }
  // Rooted water lilies at two shallow coves: radial folded pads have a cleft
  // all the way to the petiole; the floor-to-pad stems remain visible from shore.
  for (const sector of [2.31, 5.5]) for (let j = 0; j < 6; j++) {
    const a = sector + .13 * (j % 3), r = .67 + .083 * Math.floor(j / 3), px = VILLA_POND.x + Math.cos(a) * VILLA_POND.radiusX * r,
      pz = VILLA_POND.z + Math.sin(a) * VILLA_POND.radiusZ * r, radius = .115 + .028 * Math.sin(j + a), cy = VILLA_POND.waterY + .014;
    const waterArt = new NaturePalette(), pad = waterArt.get(cabbage), top: P3 = [px, cy, pz], foot: P3 = [px - .12, bedY, pz + .035];
    waterArt.get(leaf).stem([collar(foot, .009), collar(mix3(foot, top, .57), .007), collar(top, .005)], 4, 0, 0, true);
    const heart = pad.point(top); let previous = 0;
    for (let k = 0; k <= 14; k++) {
      const t = a + .16 + k / 14 * (Math.PI * 2 - .32), p = add3(top, polar(t, radius * (1 + .05 * Math.cos(t * 3)), .007 + .005 * Math.sin(2 * t)));
      const v = pad.point(p); if (k) pad.tri(heart, v, previous); previous = v;
    }
    waterArt.finish(model);
  }
  const v = VILLA_ESTATE_VIEWPOINT;
  const circle = Array.from({ length: 65 }, (_, i) => { const a = i / 64 * Math.PI * 2; return { x: v.x + Math.cos(a) * v.radius, z: v.z + Math.sin(a) * v.radius }; });
  surface([{ x: v.x, z: v.z }, ...circle], Array.from({ length: 64 }, (_, i) => [0, i + 2, i + 1]).flat(), path, .064);
  const view = new THREE.Object3D(); view.name = 'estate-hill-viewpoint'; view.position.set(v.x, villaTerrainHeight(v.x, v.z), v.z); view.userData = { northViewToHouse: true }; root.add(view);
  for (const [x, z, scale] of [[18, 130, .8], [16.8, 131, .6], [17.7, 131.6, .5]]) {
    const y = villaTerrainHeight(x, z); model.geometry(fieldStone(x + z, scale, scale * .56, scale * .68), stone, [x, y + scale * .25, z], [0, x * .41, 0]); model.collide(x, y, z, scale * 1.5, scale * .8, scale);
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
    const hi = 1.76 + i % 3 * .075, face = gz(-7.58);
    // Each hung tool rests on a bent peg that returns into the slatboard.
    workshop.beam([x, hi - .07, gz(-7.64)], [x, hi - .07, face + .015], .009, metal, 6);
    if (i % 3 === 0) {
      const outline = new THREE.Shape(), contour = [[-.019,-.355], [.018,-.355], [.018,-.062], [.044,-.048], [.065,-.015], [.062,.035], [.041,.062], [.031,.015], [0,.003], [-.021,.022], [-.025,.064], [-.052,.039], [-.061,-.015], [-.039,-.048], [-.018,-.063]];
      contour.forEach(([u, v], k) => k ? outline.lineTo(u, v) : outline.moveTo(u, v)); outline.closePath();
      workshop.geometry(new THREE.ExtrudeGeometry(outline, { depth: .014, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 1, steps: 1 }), metal, [x, hi, face - .007]);
      workshop.geometry(new THREE.TorusGeometry(.029, .009, 5, 12), metal, [x, hi - .372, face]);
    } else if (i % 3 === 1) {
      for (const hand of [-1, 1]) {
        workshop.beam([x + hand * .046, hi - .365, face], [x + hand * .009, hi - .16, face], .018, red, 7);
        workshop.beam([x + hand * .009, hi - .17, face], [x - hand * .024, hi - .067, face], .013, metal, 7);
        workshop.beam([x - hand * .024, hi - .067, face], [x - hand * .009, hi - .019, face], .010, metal, 6);
      }
      workshop.cylinder(x, hi - .136, face, .019, .019, .034, charcoal, [Math.PI / 2, 0, 0], 8);
    } else {
      workshop.cylinder(x, hi - .24, face, .024, .033, .168, timber, [0, 0, 0], 8);
      workshop.cylinder(x, hi - .149, face, .017, .026, .028, metal, [0, 0, 0], 9);
      workshop.beam([x, hi - .15, face], [x, hi + .057, face], .009, metal, 6);
      workshop.box(x, hi + .062, face, .021, .027, .007, metal, .002);
    }
  }
  workshop.collide(gx(28.8), 0, gz(-7.28), 3.7, 2.14, .85);
  // Tool trolley along east wall, real drawers, casters and push handle. It
  // parks north of the east window, clear of the SUV's door/exit corridor: at
  // the old z=-3.8 spot it clipped the reserved-2 exit anchor and blocked boarding.
  workshop.box(gx(33.8), .55, -8.0, .62, .72, 1.03, red, .026);
  workshop.box(gx(33.8), .93, -8.0, .68, .055, 1.09, charcoal, .014);
  for (let i = 0; i < 5; i++) {
    workshop.box(gx(33.479), .318 + i * .12, -8, .022, .113, .935, red, .006);
    workshop.box(gx(33.458), .348 + i * .12, -8, .034, .025, .69, metal, .006);
  }
  // Casters touch the slab: a wheel floating 5 cm read as clipping, not height.
  for (const x of [33.6, 34]) for (const z of [-8.4, -7.6]) {
    workshop.cylinder(gx(x), .075, z, .075, .075, .06, charcoal, [0, 0, Math.PI / 2], 12);
    for (const side of [-1, 1]) workshop.box(gx(x) + side * .041, .136, z, .015, .133, .045, metal, .006);
    workshop.cylinder(gx(x), .075, z, .021, .021, .102, metal, [0, 0, Math.PI / 2], 8);
  }
  workshop.beam([gx(33.52), .83, -8.5], [gx(33.52), .83, -8.75], .019, metal); workshop.beam([gx(33.52), .83, -8.75], [gx(34.05), .83, -8.75], .019, metal);
  workshop.collide(gx(33.8), 0, -8.1, .75, .98, 1.4);
  // Floor jack stays parked against the northern wall, not under a spawn vehicle.
  for (const side of [-1, 1]) {
    const x = gx(32.6) + side * .167;
    timberMember(workshop, [x, .11, gz(-7.31)], [x, .11, gz(-6.49)], .057, .115, red, .012);
    for (const z of [-7.25, -6.54]) {
      workshop.cylinder(x, .065, gz(z), .065, .065, .067, charcoal, [0, 0, Math.PI / 2], 12);
      workshop.cylinder(x, .065, gz(z), .022, .022, .080, metal, [0, 0, Math.PI / 2], 8);
    }
    timberMember(workshop, [x, .13, gz(-6.78)], [gx(32.6) + side * .064, .267, gz(-7.12)], .049, .064, metal, .008);
  }
  workshop.beam([gx(32.42), .12, gz(-6.68)], [gx(32.78), .12, gz(-6.68)], .026, metal);
  workshop.cylinder(gx(32.6), .275, gz(-7.12), .104, .081, .030, charcoal);
  workshop.geometry(new THREE.TorusGeometry(.089, .012, 6, 20), charcoal, [gx(32.6), .294, gz(-7.12)], [Math.PI/2, 0, 0]);
  workshop.beam([gx(32.6), .102, gz(-6.7)], [gx(32.6), .97, gz(-6.28)], .018, metal);
  workshop.beam([gx(32.6), .83, gz(-6.348)], [gx(32.6), .97, gz(-6.28)], .024, charcoal, 8);
  workshop.collide(gx(32.6), 0, gz(-6.85), .58, 1.06, 1.28);
  for (let i = 0; i < 3; i++) {
    // Section of a tyre: open bead and stamped sidewall rising to a broad
    // tread with moulded grooves. Unlike a doughnut these stack on flat lips.
    const rubber = new NatureMesh();
    rubber.round([[.004,.208],[.002,.258],[.009,.326],[.022,.359],[.037,.379],[.053,.385],[.060,.377],[.068,.385],
      [.095,.386],[.102,.378],[.110,.386],[.145,.385],[.152,.377],[.160,.384],[.178,.371],[.193,.347],[.202,.305],
      [.210,.25],[.206,.208],[.186,.201],[.026,.201],[.004,.208]], 28);
    workshop.geometry(rubber.geometry(), charcoal, [gx(33.76), i * .208, gz(-5.75)]);
  }
  workshop.collide(gx(33.76), 0, gz(-5.75), .82, .68, .82);
  const charger = new THREE.Group(); charger.name = 'garage-charging-pedestal'; charger.userData = { kind: 'charging-pedestal', count: 1 }; root.add(charger);
  const charge = new VillaModelBuilder(charger, 'charging-pedestal-details');
  const cx = gx(13.05);
  charge.box(cx, .60, -6.3, .24, 1.2, .22, metal, .025); charge.box(cx, 1.25, -6.3, .37, .43, .25, charcoal, .045);
  charge.box(cx, 1.30, -6.164, .24, .11, .012, villaMaterial(0x8caea2, .3), .009);
  const cable = new NatureMesh();
  cable.stem([[cx - .082,1.055,-6.19,.016],[cx - .120,.994,-6.142,.015],[cx - .157,.817,-6.127,.015],
    [cx - .145,.669,-6.12,.015],[cx - .092,.613,-6.114,.015],[cx + .016,.605,-6.111,.015],
    [cx + .102,.665,-6.114,.015],[cx + .145,.81,-6.118,.015],[cx + .146,.997,-6.123,.015]], 7);
  charge.geometry(cable.geometry(), charcoal);
  charge.beam([cx + .144,.956,-6.124], [cx + .146,1.059,-6.135], .024, metal, 8);
  charge.box(cx + .146, 1.068, -6.145, .052, .112, .076, charcoal, .015);
  charge.cylinder(cx + .146, 1.101, -6.166, .029, .029, .079, metal, [Math.PI / 2, 0, 0], 10);
  charge.box(cx, .032, -6.30, .345, .064, .310, charcoal, .009);
  for (const dx of [-.13,.13]) for (const dz of [-.115,.115]) charge.cylinder(cx + dx, .068, -6.30 + dz, .016, .016, .01, metal, [0, 0, 0], 6);
  charge.collide(cx, 0, -6.27, .47, 1.5, .47); charge.finish(); workshop.finish();
  return { colliders: [...model.colliders, ...workshop.colliders, ...charge.colliders] };
}
