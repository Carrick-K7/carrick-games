import * as THREE from 'three';
import { type VillaModelBuilder } from './villaModel.js';
import { VILLA_POND } from './villaEstateLayout.js';
import { VILLA_STREAM, VILLA_STREAM_BRIDGE, villaStreamSectionAt, villaStreamTerrainHeight } from './villaStream.js';
import { pondShorePoint } from './villaRiparianPond.js';
import { RiparianMesh, addGrit, earthFinish, mix, riparianSeed, sediment, smooth, type GroundHeight, type XZ } from './villaRiparianGround.js';

const turn = Math.PI * 2;
const lichen = new THREE.Color('#a59d82'), flint = new THREE.Color('#777a70'), dark = new THREE.Color('#494936'), gravel = new THREE.Color('#b5a78d');
const rootLeaf = new THREE.Color('#485b38'), sedge = new THREE.Color('#849153'), reed = new THREE.Color('#83916a'), straw = new THREE.Color('#b2a36b'), catkin = new THREE.Color('#795f43');
type Station = (along: number, across: number) => XZ;

/** Split the shoulder of each stream-washed stone at the actual high-water
 * mark. Damp undersides never become pale caps just because a rock was moved.
 * Different feet sample the bank separately, burying the uphill side. */
function cobble(mesh: RiparianMesh, point: XZ, height: GroundHeight, level: number, radius: number, relief: number, yaw: number, random: () => number) {
  const { x, z } = point, floor = height(x, z), mineral = lichen.clone().lerp(flint, random() * .92), aspect = .43 + random() * .41;
  const cx = Math.cos(yaw), cz = Math.sin(yaw), n = 5 + Math.floor(random() * 3), foot: number[] = [], collar: number[] = [], lip: number[] = [];
  const stoneColor = (y: number) => mineral.clone().lerp(dark, .72 * (1 - smooth((y - level - .007) / .040)));
  const peakY = floor + relief, top = mesh.vertex(x + cx * radius * .17, peakY, z + cz * radius * .17, stoneColor(peakY), 1.05);
  for (let i = 0; i < n; i++) {
    const a = (i + (random() - .5) * .29) / n * turn, u = Math.cos(a) * radius * (.80 + .23 * random()), v = Math.sin(a) * radius * aspect;
    const dx = cx * u - cz * v, dz = cz * u + cx * v, base = Math.min(height(x + dx, z + dz) - .009, floor - .013);
    const crown = floor + relief * (.49 + .28 * random()), t = Math.max(.10, Math.min(.90, (level + .012 - base) / (crown - base)));
    foot.push(mesh.vertex(x + dx, base, z + dz, stoneColor(base), .77));
    const y = mix(base, crown, t); collar.push(mesh.vertex(x + dx * (1 - .085 * t), y, z + dz * (1 - .085 * t), stoneColor(y), .90));
    lip.push(mesh.vertex(x + dx * .73 + cx * radius * .10, crown, z + dz * .73 + cz * radius * .10, stoneColor(crown), .96 + .06 * random()));
  }
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n; mesh.tri(foot[i], collar[i], foot[k]); mesh.tri(foot[k], collar[i], collar[k]);
    mesh.tri(collar[i], lip[i], collar[k]); mesh.tri(collar[k], lip[i], lip[k]); mesh.tri(top, lip[k], lip[i]);
  }
}

/** Low slumped gravel bars and turf toes. Rows run along the shoreline and
 * feather to zero relief; the lower edge disappears under water rather than
 * sitting on its surface. No new support/collision surface is introduced. */
function shelf(mesh: RiparianMesh, at: Station, height: GroundHeight, level: number, length: number, turf: boolean, random: () => number) {
  // Keep a complete submerged shoal underwater, even along a concave inlet.
  const shift = turf ? .91 : -.64 - .14 * random(), width = turf ? .53 : .28 + random() * .17, relief = .018 + .022 * random();
  const rows: number[][] = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, taper = .12 + .88 * Math.sin(Math.PI * t), mid = shift + .14 * Math.sin(t * 6 + .4), row: number[] = [];
    for (const side of [-1, -.21, .38, 1]) {
      const { x, z } = at((t - .5) * length, mid + side * width * (.74 + random() * .33) * taper), ground = height(x, z);
      const lift = (1 - Math.abs(side)) * relief * taper;
      // A depositional shelf stays below the water where its real bank is
      // submerged. Avoid a triangle island appearing in the last 5mm of water.
      const y = ground - .004 + (ground < level ? Math.min(lift, (level - ground) * .40) : lift);
      row.push(mesh.vertex(x, y, z, sediment(x, ground, z, level, turf ? .75 + .22 * random() : 0, turf ? 0 : .81), .93 + .12 * random()));
    }
    if (i) {
      const a = rows[i - 1]; for (let j = 0; j < 3; j++) {
        const p = a[j] * 3, b = row[j] * 3, c = (a[j + 1]) * 3;
        const handed = (mesh.positions[b + 2] - mesh.positions[p + 2]) * (mesh.positions[c] - mesh.positions[p]) - (mesh.positions[b] - mesh.positions[p]) * (mesh.positions[c + 2] - mesh.positions[p + 2]);
        if (handed > 0) { mesh.tri(a[j], row[j], a[j + 1]); mesh.tri(a[j + 1], row[j], row[j + 1]); }
        else { mesh.tri(a[j], a[j + 1], row[j]); mesh.tri(a[j + 1], row[j + 1], row[j]); }
      }
    }
    rows.push(row);
  }
}

type Plant = 'flag' | 'dock' | 'sedge';
const dockLeaf = new THREE.Color('#638448'), sunLeaf = new THREE.Color('#a6ae65');
/** Three different silhouettes within one colony: flag iris in two ranks,
 * broad low water-dock blades on raised petioles, and fountain-like sedge.
 * Each leaf has a lit rib; no painted cutouts or uniformly upright wands. */
function tuft(mesh: RiparianMesh, p: XZ, height: GroundHeight, size: number, form: Plant, heads: boolean, random: () => number) {
  const dock = form === 'dock', flag = form === 'flag', phase = random() * turn;
  const base = (dock ? dockLeaf : flag ? reed : sedge).clone().lerp(sunLeaf, .24 * random()).multiplyScalar(.79 + .22 * random());
  const leaves = (dock ? 4 : 5) + Math.floor(random() * 3);
  for (let i = 0; i < leaves; i++) {
    const a = phase + (flag ? (i % 2) * Math.PI + (random() - .5) * .97 : i * 2.399 + .64 * random());
    const c = Math.cos(a), s = Math.sin(a), x = p.x + c * .058, z = p.z + s * .058, foot = height(x, z) - .028;
    const h = size * (dock ? .22 + .19 * random() : flag ? .54 + .49 * random() : .29 + .33 * random());
    const lean = size * (dock ? .29 + .20 * random() : flag ? .14 + .31 * random() : .33 + .32 * random());
    const w = size * (dock ? .064 + .032 * random() : flag ? .038 + .017 * random() : .018 + .013 * random());
    const point = (u: number, v: number, lift: number, col: THREE.Color, tone: number) => mesh.vertex(x + c * lean * u - s * w * v, foot + h * lift, z + s * lean * u + c * w * v, col, tone);
    const origin = mesh.vertex(x, foot, z, rootLeaf);
    if (dock) {
      const neck = point(.28, .08, .68, base, .91), left = point(.48, -.97, .83, base, .95), right = point(.51, .94, .85, base, .87);
      const rib = point(.61, .02, .91, base, 1.09), side = point(.77, -.64, .93, base, 1.01), tip = point(1, .16, .90, base, 1.04);
      // The lamina opens into a shallow rolled blade above a narrow petiole,
      // not a three-sided peak with a vertical face at the tip.
      const heel = point(.25, -.08, .64, base, .80); mesh.tri(origin, neck, heel); mesh.tri(heel, neck, left);
      mesh.tri(neck, rib, left); mesh.tri(left, rib, side); mesh.tri(side, rib, tip); mesh.tri(tip, rib, right); mesh.tri(right, rib, neck);
    } else {
      // Two cross-sections turn the growing blade tangentially over its arch.
      // Spending the same four triangles on one V hinge made square elbows.
      const l0 = point(.17, -.88, .50, base, .89), r0 = point(.18, .99, .47, base, .99);
      const l1 = point(.56, -.67, flag ? .82 : .78, base, .96), r1 = point(.58, .70, flag ? .80 : .77, base, 1.06);
      const tip = point(1, .18, flag ? .97 : .51 + .16 * random(), base, 1.03);
      mesh.tri(origin, l0, r0); mesh.tri(r0, l0, l1); mesh.tri(r0, l1, r1); mesh.tri(r1, l1, tip);
    }
  }
  if (!heads) return;
  const x = p.x, z = p.z, y = height(x, z) - .025, h = size * (.89 + .25 * random()), dx = Math.cos(phase) * .12, dz = Math.sin(phase) * .12;
  const collars: number[][] = []; // Tapered three-dimensional culm and brown spike, on the SAME axis.
  for (const [t, r, color] of [[0, .010, rootLeaf], [.67, .007, base], [.71, .021, catkin], [.91, .018, catkin], [.94, .005, base]] as const) {
    const ring: number[] = []; for (let j = 0; j < 4; j++) { const a = phase + j * turn / 4; ring.push(mesh.vertex(x + dx * t + r * Math.cos(a), y + h * t, z + dz * t + r * Math.sin(a), color)); }
    if (collars.length) { const lower = collars[collars.length - 1]; for (let j = 0; j < 4; j++) { const k = (j + 1) % 4; mesh.tri(lower[j], ring[j], lower[k]); mesh.tri(lower[k], ring[j], ring[k]); } }
    collars.push(ring);
  }
  const tip = mesh.vertex(x + dx, y + h, z + dz, straw); for (let j = 0; j < 4; j++) mesh.tri(collars[4][j], tip, collars[4][(j + 1) % 4]);
}

type Pocket = { at: Station; form: Plant | 'shingle'; spread: number; dense: boolean };
function habitat(model: VillaModelBuilder, level: number, height: GroundHeight, pockets: Pocket[], seed: number, pond: boolean) {
  const ground = new RiparianMesh(), shoots = new RiparianMesh(), random = riparianSeed(seed);
  pockets.forEach(({ at, form, spread, dense }, i) => {
    const plants = form !== 'shingle';
    if (dense || !plants) shelf(ground, at, height, level, spread, plants, random);
    if (plants) {
      // Clonal patches: crowded overlapping crowns in two or three unequal
      // lobes, with lower broad dock facing the water and dry sedge trailing
      // onto the meadow. Leave long, completely unplanted shingle reaches.
      const count = dense ? (pond ? 31 : 20) : (pond ? 9 : 6), direction = random() < .5 ? -1 : 1;
      for (let j = 0; j < count; j++) {
        const core = j < count * .51, tail = !core && j > count * .82;
        const along = direction * spread * ((core ? -.16 : tail ? .41 : .12) + (random() + random() - 1) * (core ? .25 : .20));
        const across = core ? .16 + (random() + random() - 1) * .72 : tail ? .52 + random() * .65 : -.11 - random() * .26;
        let p = at(along, across), depth = level - height(p.x, p.z);
        // Water dock advances farther out over a gently silted pond inlet
        // than over the steep brook shelf. Find actual rooting depth, not a
        // nominal distance from a shoreline that happens to work on one bank.
        if (!core && !tail) for (let k = 1; k <= 8 && depth < .09; k++) {
          p = at(along, across - k * .13); depth = level - height(p.x, p.z);
        }
        if (depth > .27) continue;
        const kind = core ? form : tail ? 'sedge' : 'dock', scale = (core ? .99 : .78) + .55 * random();
        tuft(shoots, p, height, scale, kind, core && form === 'flag' && j < (pond ? 5 : 3) && depth > -.07, random);
      }
    }
    const rocks = plants ? (dense ? 1 : 0) : 3 + Math.floor(random() * (pond ? 7 : 3));
    for (let j = 0; j < rocks; j++) {
      const across = -.70 + random() * 1.17, p = at((random() - .5) * spread * .82, across), wet = height(p.x, p.z) < level - .025;
      const r = .089 + (wet ? .39 : .15) * random(), h = across < -.12 ? r * (.65 + .37 * random()) : Math.min(.085, r * .39);
      cobble(ground, p, height, level, r, h, i * .63 + random(), random);
    }
    for (let j = 0; j < (plants ? 2 : pond ? 24 : 10); j++) {
      const p = at((random() - .5) * spread, -.91 + random() * 1.54), y = height(p.x, p.z), col = gravel.clone().lerp(flint, random()).multiplyScalar(y < level + .014 ? .60 : .89);
      addGrit(ground, p.x, p.z, y + .002, .018 + random() * .049, random() * turn, col, random);
    }
  });
  const prefix = pond ? 'pond' : 'stream', leaf = earthFinish(`${prefix}/sedge-flags-and-rush`); leaf.side = THREE.DoubleSide;
  model.geometry(ground.geometry(), earthFinish(`${prefix}/eroded-bars-and-stone`, .84)); model.geometry(shoots.geometry(), leaf);
}

export function addPondHabitat(model: VillaModelBuilder, height: GroundHeight) {
  // Sheltered coves and alternate exposed shelves. Asymmetry leaves stretches
  // of unplanted bank between drifts rather than a wreath around the pond.
  const coves: [number, Pocket['form'], number, boolean][] = [
    [.16, 'flag', 4.8, true], [.56, 'dock', 2.2, false], [1.16, 'shingle', 3.4, false], [1.69, 'sedge', 2.8, false],
    [2.24, 'dock', 4.3, true], [2.92, 'shingle', 3.7, false], [3.72, 'flag', 4.0, true], [4.17, 'sedge', 2.2, false],
    [4.69, 'dock', 2.6, false], [5.18, 'shingle', 3.6, false], [5.73, 'sedge', 5.2, true], [6.00, 'dock', 2.1, false],
  ];
  const pockets = coves.map(([a, form, spread, dense]): Pocket => ({ form, spread, dense,
    at: (metres, across) => pondShorePoint(a + metres / Math.hypot(VILLA_POND.radiusX * Math.sin(a), VILLA_POND.radiusZ * Math.cos(a)), across) }));
  habitat(model, VILLA_POND.waterY, height, pockets, 19256, true);
}
export function addStreamHabitat(model: VillaModelBuilder) {
  const random = riparianSeed(56731), pockets: Pocket[] = [];
  for (const side of [-1, 1]) {
    const starts: [number, Pocket['form'], number, boolean][] = side > 0
      ? [[-6.0, 'flag', 4.1, true], [4.7, 'dock', 3.1, true], [8.9, 'shingle', 2.7, false]]
      : [[-4.8, 'shingle', 2.7, false], [6.3, 'sedge', 4.5, true]];
    for (let x = VILLA_STREAM.minX + 3 + random() * 5; x < VILLA_STREAM.maxX - 3; x += 7 + random() * 9) if (Math.abs(x) > 11) {
      const r = random(); starts.push([x, r < .34 ? 'shingle' : r < .63 ? 'sedge' : r < .86 ? 'dock' : 'flag', 2.1 + random() * 2, false]);
    }
    for (const [start, form, spread, dense] of starts) pockets.push({ form, spread, dense, at(along, across) {
      const x = Math.sign(start) * Math.max(VILLA_STREAM_BRIDGE.maxX + 1.15, Math.abs(start + along)), s = villaStreamSectionAt(x)!;
      return { x, z: s.z + side * (s.halfWidth + across) };
    } });
  }
  habitat(model, VILLA_STREAM.waterY, (x, z) => villaStreamTerrainHeight(x, z) ?? 0, pockets, 89163, false);
}
