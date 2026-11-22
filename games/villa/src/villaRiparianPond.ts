import * as THREE from 'three';
import { VILLA_POND as pond, villaTerrainGroundHeight } from './villaEstateLayout.js';
import { type VillaModelBuilder } from './villaModel.js';
import { NaturePalette, add3, collar, mix3, polar, turn, type P3 } from './villaNatureGeometry.js';
import { RiparianMesh, drift, earthFinish, mix, riparianSeed, sediment, smooth, type GroundHeight, type XZ } from './villaRiparianGround.js';
import { riparianWaterMaterial } from './villaRiparianWater.js';

const spokes = 96, rings = [0, .14, .29, .43, .57, .68, .78, .86, .925, .97, 1];
const xy = (a: number, r: number): XZ => ({ x: pond.x + Math.cos(a) * pond.radiusX * r, z: pond.z + Math.sin(a) * pond.radiusZ * r });
function radiusAt(a: number) {
  const { x, z } = xy(a, 1), n = drift(x * .62, z * .55);
  // Silted indentations and two slumped banks, inside the unchanged hazard.
  return .942 + .024 * Math.sin(a * 3) + .017 * Math.cos(a * 7) + .035 * (n - .5)
    - .073 * smooth((Math.cos(a - 2.4) - .88) / .12) - .061 * smooth((Math.cos(a - 5.3) - .94) / .06);
}
export function pondShorePoint(a: number, offshoreMetres: number): XZ {
  return xy(a, radiusAt(a) + offshoreMetres / Math.hypot(pond.radiusX * Math.cos(a), pond.radiusZ * Math.sin(a)));
}
function cutHeight(x: number, z: number, t: number, a: number) {
  const inlet = smooth((Math.cos(a - 2.39) - .47) / .53) + .77 * smooth((Math.cos(a - 5.48) - .67) / .33);
  const pool = Math.exp(-(((x - pond.x - 1.3) / 3.6) ** 2 + ((z - pond.z + 2.1) / 5) ** 2));
  const d = .50 + .38 * pool + .14 * drift(x * .51, z * .43);
  return pond.waterY - d * smooth((1 - t) / (.31 + inlet * .52 + .14 * drift(x * .19, z * .21)));
}
function triHeight(p: XZ, a: P3, b: P3, c: P3) {
  const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], dx = p.x - a[0], dz = p.z - a[2], area = bx * cz - bz * cx;
  const u = (dx * cz - dz * cx) / area, v = (bx * dz - bz * dx) / area;
  if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
}
/** One continuous silt floor, intertidal shelf, and rim. The grass cutout is
 * circumscribed about the hazard ellipse: carry a scalloped earthen toe beyond
 * that cut and bury its outermost edge below the EXISTING lawn (-22mm). */
export function addRiparianPond(root: THREE.Object3D): GroundHeight {
  const terrain = new RiparianMesh(), rows: P3[][] = [], waterPositions: number[] = [], depths: number[] = [], uv: number[] = [], waterIds: number[] = [];
  const groundIds: number[][] = [], waterRows: number[][] = [], source: P3 = [pond.x, cutHeight(pond.x, pond.z, 0, 0), pond.z];
  const centre = terrain.vertex(...source, sediment(...source, pond.waterY, 0));
  const breeze: number[] = [];
  function waterVertex(x: number, y: number, z: number) {
    // Coherent wind lanes: the long ripples turn and subside in sheltered
    // coves instead of stamping an identical wave field over the entire pond.
    uv.push(x + .91 * drift(x * .25, z * .39), z + 1.17 * drift(z * .28, x * .35));
    breeze.push(.18 + .88 * smooth((drift(x * .31, z * .26) - .21) / .61));
    depths.push(Math.max(0, pond.waterY - y)); return waterPositions.push(x, pond.waterY, z) / 3 - 1;
  }
  const waterCentre = waterVertex(...source);
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * turn, r = radiusAt(a), shore = xy(a, r), rim = xy(a, 1), n = drift(shore.x * .76, shore.z * .58);
    const rimRadius = 1 + (.19 + .71 * n) / Math.hypot(pond.radiusX * Math.cos(a), pond.radiusZ * Math.sin(a));
    const p: P3[] = [source], gi = [centre], wi = [waterCentre];
    for (const t of rings.slice(1)) {
      // Offset interior contours, but leave their shoreline nodes coincident with the dry rim.
      const f = t + .042 * Math.sin(t * Math.PI) * (2 * n - 1), { x, z } = xy(a, f * r), y = cutHeight(x, z, f, a);
      p.push([x, y, z]); gi.push(terrain.vertex(x, y, z, sediment(x, y, z, pond.waterY, 0))); wi.push(waterVertex(x, y, z));
    }
    for (const t of [.21 + .12 * n, .60 + .11 * n, .84, 1]) {
      const { x, z } = xy(a, mix(r, rimRadius, t)), ground = villaTerrainGroundHeight(rim.x, rim.z);
      const y = t === 1 ? ground - .029 : mix(pond.waterY, ground + .013 * n, smooth(t / .85)) + (n - .48) * .030 * Math.sin(t * Math.PI);
      const exposure = drift(x * .54 + 4, z * .52);
      p.push([x, y, z]); gi.push(terrain.vertex(x, y, z, sediment(x, y, z, pond.waterY, smooth((t - .08 - .44 * exposure) / .36))));
    }
    rows.push(p); groundIds.push(gi); waterRows.push(wi);
  }
  const stitch = (a: number[], b: number[], ids: number[]) => {
    ids.push(a[0], b[1], a[1]);
    for (let j = 1; j + 1 < a.length; j++) ids.push(a[j], b[j], a[j + 1], b[j], b[j + 1], a[j + 1]);
  };
  for (let i = 0; i < spokes; i++) { const k = (i + 1) % spokes; stitch(groundIds[i], groundIds[k], terrain.indices); stitch(waterRows[i], waterRows[k], waterIds); }
  const bottom = new THREE.Mesh(terrain.geometry(true), earthFinish('pond/silt-shoal-and-bank')); bottom.name = 'estate-pond-bed'; bottom.receiveShadow = true; root.add(bottom);
  const water = new THREE.BufferGeometry(); water.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3)); water.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  water.setAttribute('waterColumn', new THREE.Float32BufferAttribute(depths, 1)); water.setAttribute('waterBreeze', new THREE.Float32BufferAttribute(breeze, 1));
  water.setIndex(waterIds); water.computeVertexNormals();
  const surface = new THREE.Mesh(water, riparianWaterMaterial().material); surface.name = 'estate-pond-water'; surface.receiveShadow = true; root.add(surface);
  // Sample the actual piecewise-planar faces, not the smooth profile that was
  // used to author their vertices. Stones, petals and exposed roots all use it.
  return (x, z) => {
    const theta = Math.atan2((z - pond.z) / pond.radiusZ, (x - pond.x) / pond.radiusX), i = Math.floor((theta + turn) / turn * spokes) % spokes;
    const a = rows[i], b = rows[(i + 1) % spokes], point = { x, z };
    let y = triHeight(point, source, b[1], a[1]);
    for (let j = 1; y === undefined && j + 1 < a.length; j++) y = triHeight(point, a[j], b[j], a[j + 1]) ?? triHeight(point, b[j], b[j + 1], a[j + 1]);
    // Where the rim overlaps the uncut grass, anchor to whichever is on top.
    const outside = ((x - pond.x) / pond.radiusX) ** 2 + ((z - pond.z) / pond.radiusZ) ** 2 > 1.001;
    const lawn = villaTerrainGroundHeight(x, z) - .022; return y === undefined ? lawn : outside ? Math.max(y, lawn) : y;
  };
}

export function addRiparianLilies(model: VillaModelBuilder, height: GroundHeight, leaf: THREE.Material, green: THREE.Material) {
  const art = new NaturePalette(), pad = art.get(green), random = riparianSeed(8421), centres: XZ[] = [];
  for (const sector of [2.31, 5.5]) for (let j = 0; j < 17; j++) {
    const angle = j ? sector + (random() - .5) * .65 : sector, r = j ? .59 + random() * .24 : .67, p = xy(angle, r);
    if (centres.some(c => Math.hypot(c.x - p.x, c.z - p.z) < .32)) continue; centres.push(p);
    const cy = pond.waterY + .013, top: P3 = [p.x, cy, p.z], fx = p.x - .09 - random() * .10, fz = p.z + .035;
    const foot: P3 = [fx, height(fx, fz) - .008, fz], mid = mix3(foot, top, .55); mid[2] -= .046;
    art.get(leaf).stem([collar(foot, .007), collar(mid, .005), collar(top, .004)], 4, 0, 0, true);
    const heart = pad.point(top), slit = j ? random() * turn : angle, radius = .085 + random() * .074; let previous = 0;
    pad.tone = .74 + random() * .27;
    for (let k = 0; k <= 14; k++) {
      const a = slit + .15 + k / 14 * (turn - .30), v = pad.point(add3(top, polar(a, radius * (1 + .07 * Math.cos(a * 3)), .005 + .006 * Math.sin(2 * a))));
      if (k) pad.tri(heart, v, previous); previous = v;
    }
  }
  art.finish(model);
}
