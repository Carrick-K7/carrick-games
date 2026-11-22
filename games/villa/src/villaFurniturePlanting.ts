import * as THREE from 'three';
import { sheet, stock, turn, type FurnitureKit, type Point, type PutSurface } from './villaFurnitureForms.js';
import { outdoorPlanter } from './villaHedgePlanters.js';

/** Thin folded lamina; its reverse is the underside of the same leaf. */
export function leafBlade(width: number, length: number, arch: number) {
  return sheet([-1, 0, 1], width < .046 ? [-1, -.50, .14, .70, 1] : [-1, -.63, -.14, .38, .81, 1], (u, v) => {
    const t = (v + 1) / 2, span = width * (.016 + .984 * Math.sin(t * Math.PI) ** .80) * (1.16 - t * .34);
    return [u * span + .11 * width * Math.sin(t * Math.PI), length * (.60 * t + arch * Math.sin(t * Math.PI)) + .16 * span * (1 - Math.abs(u)) + u * span * t * .21, length * (.62 * t + .32 * t * t)];
  }, true);
}
type Station = [number, number, number, number];
interface Grow {
  put: PutSurface;
  at: FurnitureKit['at'];
  m: FurnitureKit['m'];
  twig(stations: Station[], m: THREE.Material): void;
  random(): number;
}
/** Wax-leaved ZZ plant. Each bowed rachis carries opposite, diminishing pinnae;
 * their sockets coincide with real stations on that stem, not points in space. */
function compoundFronds({ put, at, m, twig, random }: Grow) {
  const turn = random() * .8;
  for (let f = 0; f < 5; f++) at(0, 0, 0, turn + f * 2.4, () => {
    const height = .49 + .34 * random(), reach = .205 + .14 * random();
    const ts = [0, .22, .42, .59, .74, .88, 1];
    const shaft: Station[] = ts.map(t => [.022 * Math.sin(Math.PI * t + f) * t, height * t, .045 + reach * t ** 1.56, .0041 + .010 * (1 - t) ** 1.6]);
    twig(shaft, m.leaf);
    for (let j = 2; j < shaft.length - 1; j++) {
      const [x, y, z] = shaft[j], t = ts[j];
      for (const side of [-1, 1]) {
        const len = (.221 - .091 * t) * (.92 + .13 * random()), width = .052 - .021 * t;
        put(leafBlade(width, len, .14), j === 5 || (j + f) % 5 === 0 ? m.leafLight : m.leaf,
          x, y, z, .53 - t * .25, side * (1.08 - t * .26), side * .13);
      }
    }
    const tip = shaft[shaft.length - 1]; put(leafBlade(.027, .119, .11), m.leafLight, tip[0], tip[1], tip[2], -.12);
  });
}
/** Broad paired lobes attach at the basal notch of each heart leaf. The pointed
 * drip tip turns down; the leaf blade doesn't stand vertically on its petiole. */
function heartLeaf(width: number, length: number) {
  return sheet(width < .05 ? [-1, 0, 1] : [-1, -.42, 0, .42, 1], width < .05 ? [-1, -.69, -.25, .41, 1] : [-1, -.79, -.46, -.09, .34, .72, 1], (u, v) => {
    const t = (v + 1) / 2, belly = Math.sin(Math.PI * t) ** .63 * (1.52 - .94 * t);
    const lobe = Math.abs(u) ** 1.3 * Math.exp(-(((t - .16) / .19) ** 2));
    return [u * width * (.015 + belly), length * (.19 * Math.sin(t * Math.PI) - .23 * t * t) - .19 * width * u * u * belly,
      length * (t - .21 * lobe)];
  }, true);
}
function canePlant({ put, at, m, twig, random }: Grow, herb: boolean) {
  const stems = herb ? 3 : 2, turn = random();
  for (let f = 0; f < stems; f++) at(0, 0, 0, f * 2.4 + turn, () => {
    const h = (herb ? .266 : .622) * (1 + .16 * random() - .15 * f), reach = herb ? .123 : .203;
    const nodes: Station[] = [[0, 0, .024, herb ? .010 : .020], [.012, h * .24, .042, .011], [-.007, h * .51, reach * .39, .009], [.024, h * .75, reach * .67, .007], [.034, h, reach, .004]];
    twig(nodes, herb ? m.leaf : m.walnut);
    for (let j = 1; j < nodes.length; j++) {
      const [x, y, z] = nodes[j];
      at(x, y, z, (j % 2 ? -.98 : .90) + .24 * j, () => {
        const length = herb ? .117 - j * .008 : .258 - .023 * j, offset = herb ? .046 : .091;
        twig([[0, 0, 0, .006], [0, .027, offset * .48, .004], [0, .044, offset, .0035]], m.leaf);
        put(heartLeaf(herb ? .046 : .089, length), j === 4 ? m.leafLight : m.leaf, 0, .044, offset, j === 4 ? -.42 : .03, 0, (f % 2 ? -.11 : .14));
        if (herb && j < 4) put(heartLeaf(.038, length * .81), m.leafLight, 0, .006, .009, -.25, Math.PI, -.13);
      });
    }
  });
}
function blossom(radius: number, opening: number) {
  // Five individually cupped petals with open notches. The petal is a thin
  // membrane, not a solid of revolution; opposite windings finish both faces.
  const xyz: number[] = [], uv: number[] = [], ids: number[] = [];
  const petal: Point[] = [[0, -.11, .51], [-.078, -.37, .032], [-.397, -.054, .54], [-.216, .304, .95], [.207, .318, 1], [.406, -.063, .58], [.073, -.37, .032]];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4, s = Math.sin(a), c = Math.cos(a);
    for (const under of [false, true]) {
      const base = xyz.length / 3;
      for (const [x, y, z] of petal) {
        xyz.push((x * c + z * s) * radius * opening, (y + (1 - opening) * z - (under ? .008 : 0)) * radius, (-x * s + z * c) * radius * opening);
        uv.push(.5 + x, z);
      }
      for (let j = 1; j <= 6; j++) { const n = j % 6 + 1; ids.push(base, base + (under ? n : j), base + (under ? j : n)); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ids); g.computeVertexNormals(); return g;
}
function floweringSpray({ put, at, m, twig, random }: Grow, floor: boolean) {
  // Floor sprays rise in slender wands. On a table the woody twigs instead fan
  // out, dip over the rim, then turn their flowering tips back into the light.
  const offset = random() * .97;
  for (let f = 0; f < (floor ? 4 : 3); f++) at(0, 0, 0, f * 2.4 + offset, () => {
    const reach = (floor ? .199 : .343) * (.92 + random() * .18), h = (floor ? .579 : .232) * (.80 + random() * .42);
    const j: Point = [-.019, h * .57, reach * .55], tip: Point = [.041, h, reach];
    twig([[0, 0, .029, .011], [.008, h * .35, reach * .24, .009], [...j, .007], [.011, h * .71, reach * .81, .005], [...tip, .003]], m.walnut);
    for (const side of [-1, 1]) {
      const end: Point = [j[0] + side * (.080 + .06 * random()), h * (.69 + .15 * random()), reach * .88];
      twig([[...j, .005], [j[0] + side * .065, h * .59, reach * .80, .004], [...end, .0026]], m.leaf);
      put(leafBlade(.028, floor ? .128 : .092, .19), side > 0 ? m.leaf : m.leafLight, j[0] + side * .061, h * .59, reach * .80, .52, side * .82, side * .12);
      const size = .038 + .007 * random(), tilt = .15 + .30 * random();
      const bloom = side > 0 && f % 2 ? turn([[.004, -.007], [.015, .005], [.016, .014], [.009, .024], [0, .027]], 7) : blossom(size, side > 0 ? .79 : .99);
      put(bloom, (f + side) % 3 === 0 ? m.cream : m.coral, ...end, tilt, side * .45, side * .49);
    }
    put(leafBlade(.035, .141, .2), m.leaf, -.010, h * .49, reach * .44, .45, -.79);
    put(blossom(.043, 1), f % 2 ? m.coral : m.cream, ...tip, .18, .13, -.26);
  });
}
export function planter(k: FurnitureKit, s: number, flowering: boolean, random: () => number, outdoor = false) {
  if (outdoor && flowering) { outdoorPlanter(k, s, random); return; }
  const put: PutSurface = (g, m, x, y, z, rx, ry, rz) => k.put(g.scale(s, s, s), m, x * s, y * s, z * s, rx, ry, rz);
  const at: FurnitureKit['at'] = (x, y, z, a, make) => k.at(x * s, y * s, z * s, a, make);
  const grow: Grow = { put, at, m: k.m, random, twig: (p, m) => put(stock(p, 5), m, 0, 0, 0) };
  const table = s < .8, m = k.m;
  // A low belly and inturned mouth hold the cut sprays; larger rooted plants
  // have straight nursery sides and a sturdy projecting hand-thrown rim.
  const profile: [number, number][] = table && flowering ? [[0, .010], [.110, .010], [.120, 0], [.143, 0], [.153, .029], [.205, .066], [.239, .137], [.246, .212], [.231, .264], [.181, .304], [.166, .325], [.179, .340], [.181, .355], [.165, .362], [.148, .348], [.145, .316]] :
    [[0, .012], [.136, .012], [.146, 0], [.168, 0], [.171, .034], [.183, .071], [.222, .233], [.231, .313], [.247, .331], [.251, .361], [.241, .382], [.222, .383], [.211, .368], [.205, .327]];
  put(turn(profile, table ? 12 : 16), m.terra, 0, 0, 0);
  const mouth = table && flowering ? .148 : .210, base = table && flowering ? .319 : .335;
  put(turn([[mouth, 0], [mouth * .72, .009], [0, .006]], 12), m.soil, 0, base, 0);
  at(0, base + .005, 0, 0, () => {
    if (flowering) floweringSpray(grow, !table);
    else if (s >= 1.32) compoundFronds(grow);
    else canePlant(grow, table);
  });
}
