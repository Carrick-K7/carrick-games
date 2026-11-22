import * as THREE from 'three';
import { bent, board, casting, circleXY, loft, oval, rectRing, rectXY, sheet, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { vessel } from './villaFurnitureJoinery.js';
import { prunedPrivet } from './villaHedgePrivet.js';
import { teapot } from './villaInteriorKitchen.js';

export function woolRug(w: number, d: number, h: number) {
  const hem = .026, us = [-1, -1 + hem / w * 2, -.88, 0, .88, 1 - hem / w * 2, 1], vs = [-1, -1 + hem / d * 2, -.84, 0, .84, 1 - hem / d * 2, 1];
  return sheet(us, vs, (u, v, under) => {
    const edge = Math.abs(u) === 1 || Math.abs(v) === 1, tip = Math.abs(u * v) === 1 ? .016 : 0;
    const y = under ? -h * .46 : edge ? h * .14 : h * (.40 + .065 * Math.sin(u * 3.3 + v * 1.9));
    return [u * (w * .5 - tip), y, v * (d * .5 - tip)];
  });
}

/** Paired knotted warp ends. Baked into one small strip per short edge, not a
 * draw call or cylinder per thread. All tips end inside the inherited footprint. */
export function rugFringe(w: number, d: number, h: number) {
  const xyz: number[] = [], uv: number[] = [], ids: number[] = [], n = Math.min(42, Math.round(w / .135));
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = w * ((i + .5) / n - .5), z = side * (d / 2 - .061), base = xyz.length / 3;
    const reach = .050 + Math.sin(i * 2.41) * .006, tip = x + .008 * Math.sin(i * 1.4);
    const path = [[x - .014, h * .13, z - side * .003], [x + .013, h * .13, z - side * .003],
      [x - .009, -h * .01, z + side * .017], [x + .008, -h * .01, z + side * .017],
      [tip - .012, -h * .26, z + side * reach], [tip + .002, -h * .23, z + side * reach * .94], [tip + .010, -h * .27, z + side * reach * .89]];
    for (const [xx, yy, zz] of path) { xyz.push(xx, yy, zz); uv.push(xx * 3, zz * 3); }
    const tris = [[0, 2, 1], [1, 2, 3], [2, 4, 5], [3, 2, 5], [3, 5, 6]];
    for (const [a, b, c] of tris) ids.push(base + a, base + (side > 0 ? b : c), base + (side > 0 ? c : b));
  }
  const g = new THREE.BufferGeometry(); g.setIndex(ids); g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

export function pebble(w: number, h: number, d: number, seed: number) {
  const ring = (s: number, y: number, dx: number) => oval(w * s, d * s, y * h, 8).map(([x, yy, z], i): Point => {
    const a = i * .785 + seed, s = 1 + .105 * Math.cos(a * 3 + seed);
    return [x * s + dx * w, yy + .040 * h * Math.sin(a * 2), z * s];
  });
  return loft([ring(.54, -.45, -.044), ring(.94, -.19, -.037), ring(1, .05, .016), ring(.71, .38, .055), ring(.32, .48, .075)]);
}

export function topiary(k: FurnitureKit, halfWidth: number, height: number, variant: number, material: THREE.Material) {
  prunedPrivet(k, halfWidth, height, variant, material);
}

export function cueStand(k: FurnitureKit, mahogany: THREE.Material) {
  const { put, m } = k;
  for (const z of [-.444, .444]) put(casting([[-.048, .209], [.049, .209], [.056, 1.576], [.024, 1.642], [-.025, 1.642], [-.054, 1.574]], .072), mahogany, 16.838, 0, -12 + z, 0, Math.PI / 2);
  for (const [y, r, d] of [[.296, .025, .096], [1.518, .018, .041]]) {
    const apertures = Array.from({ length: 5 }, (_, i) => circleXY(-.055, -.4 + i * .20, r, 12));
    put(casting(rectXY(.249, 1.071, .031), d, apertures), mahogany, 16.728, y, -12, -Math.PI / 2);
  }
  put(board(.222, 1.030, .034, .037), m.oak, 16.728, .252, -12);
  for (let i = 0; i < 5; i++) {
    const z = -12.4 + i * .20;
    put(turn([[0, .265], [.019, .265], [.022, .278], [.021, .306], [.020, .521], [.017, .873], [.016, .937], [0, .937]], 8), mahogany, 16.673, 0, z);
    put(turn([[.016, .925], [.017, .932], [.016, .944], [.008, 1.568], [0, 1.568]], 8), m.oak, 16.673, 0, z);
    put(turn([[.008, 1.565], [.008, 1.588], [.007, 1.596], [0, 1.596]], 8), m.cream, 16.673, 0, z);
    put(turn([[.007, 1.594], [.007, 1.602], [.005, 1.605], [0, 1.606]], 8), m.blue, 16.673, 0, z);
  }
}

export function teaFurniture(k: FurnitureKit) {
  const { m, put, at } = k;
  // Low kang table: inward-sweeping feet and carved cloud brackets under its
  // floating top; the dark serving tray has a shallow continuous raised rim.
  for (const s of [-1, 1]) {
    const foot = [[-.510, .012], [-.372, .012], [-.292, .074], [-.272, .204], [-.210, .272], [-.135, .288], [.135, .288], [.210, .272], [.272, .204], [.292, .074], [.372, .012], [.510, .012], [.489, .048], [.38, .092], [.371, .211], [.439, .318], [.510, .354], [.510, .391], [-.510, .391], [-.510, .354], [-.439, .318], [-.371, .211], [-.38, .092], [-.489, .048]];
    put(casting(foot, .114), m.walnut, s * .688, 0, 0, 0, Math.PI / 2);
  }
  put(board(1.902, 1.241, .065, .070, .031), m.walnut, 0, .401, 0);
  put(loft([rectRing(1.492, .883, .046, .433), rectRing(1.55, .945, .054, .442), rectRing(1.552, .949, .054, .468),
    rectRing(1.492, .888, .043, .470), rectRing(1.465, .862, .042, .453)]), m.dark, 0, 0, 0);
  at(-.48, .453, -.18, .33, () => {
    // Cast iron brazier, with a trivet around the removable lidded kettle.
    put(turn([[0, 0], [.132, 0], [.152, .017], [.174, .083], [.163, .112], [.146, .117], [.13, .095], [.11, .045], [0, .033]], 16), m.black, 0, 0, 0);
    at(0, .098, 0, 0, () => teapot(k, m.black, .92));
  });
  at(.115, .453, -.210, -.25, () => teapot(k, m.terra, .79));
  for (const [x, z] of [[.34, .17], [.51, .27], [.57, .09], [.29, .33]]) put(vessel(.046, .056, .47, 12), m.cream, x, .454, z);
}
export function teaShelf(k: FurnitureKit) {
  const { put, m } = k;
  for (const z of [-1.446, 1.446]) {
    const side = [[-.15, 0], [-.088, 0], [-.065, .084], [.070, .084], [.097, 0], [.161, 0], [.161, 1.98], [.117, 2.07], [-.15, 2.07]];
    put(casting(side, .065), m.walnut, 0, 0, z);
  }
  // Three pierced back panels reveal the backing wall through moon windows.
  for (let i = -1; i <= 1; i++) put(casting(rectXY(.953, 1.937, .021, 0, 1.095), .033, [circleXY(0, 1.32, .302, 16)]), m.walnut, -.15, 0, i * .966, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const y = .331 + i * .52; put(board(.339, 2.857, .048, .030, .014), m.oak, .026, y, 0);
    for (let c = 0; c < 4; c++) put(vessel(.055 + .004 * ((c + i) % 3), i % 2 ? .079 : .099, .46, 12), i % 2 ? m.cream : m.sage, .072, y + .024, -1.10 + .724 * c);
  }
}

export function bonsai(k: FurnitureKit) {
  const { m, put } = k;
  put(turn([[0, 0], [.268, 0], [.290, .023], [.276, .043], [.179, .070], [.097, .134], [.081, .229], [.128, .301], [.219, .356], [.30, .382], [.308, .422], [.288, .44], [0, .44]], 16), m.walnut, 0, 0, 0);
  put(loft([oval(.37, .249, .441, 16), oval(.436, .289, .455, 16), oval(.502, .334, .536, 16), oval(.518, .350, .552, 16), oval(.513, .348, .566, 16), oval(.464, .301, .566, 16), oval(.451, .293, .529, 16)]), m.sage, 0, 0, 0);
  put(loft([oval(.444, .285, .536, 14), oval(.387, .249, .548, 14), oval(.150, .115, .550, 14)]), m.soil, 0, 0, 0);
  bent(k, m.walnut, [[-.060, .541, -.005, .044], [-.037, .593, -.012, .040], [.048, .632, -.008, .034], [.086, .697, .014, .028], [.035, .769, .038, .023], [-.009, .834, .023, .019], [.016, .902, .008, .013], [.082, .965, -.006, .009]], 9);
  for (const [x, y, z, w] of [[-.149, .738, -.027, .252], [.185, .796, -.016, .273], [-.102, .893, .057, .231], [.080, .983, -.016, .226]]) {
    bent(k, m.walnut, [[.035, y - .093, .012, .015], [x * .64, y - .042, z, .011], [x, y, z, .006]], 7);
    put(pebble(w, .076, w * .79, y * 13), m.leaf, x, y + .020, z);
    put(pebble(w * .75, .049, w * .63, x * 6), m.leafLight, x + w * .12, y + .051, z - .012);
  }
}

export function writingSet(k: FurnitureKit, guest = false) {
  const { put, m } = k;
  const width = guest ? .53 : .402, depth = guest ? .351 : .277;
  // Two sewn signatures curve back to the same gutter. A visible fore-edge
  // separates them from the leather case from the side and underneath.
  const panels = [-1, -.84, -.60, -.38, -.17, -.048, 0, .048, .17, .38, .60, .84, 1];
  put(board(width + .025, depth + .025, .010, .018, .005), m.walnut, 0, .005, 0);
  put(sheet(panels, [-1, -.7, .45, .88, 1], (u, v, under) => {
    const a = Math.abs(u), y = .019 + .034 * Math.sin(Math.PI * Math.sqrt(a)) + .007 * a + .005 * v * a;
    return [u * width / 2, under ? .011 : y, v * depth / 2 + .006 * (1 - a) * v];
  }), m.cream, 0, 0, 0);
  if (guest) return;
  k.at(.78, 0, -.03, 0, () => {
    put(turn([[0, .003], [.054, .003], [.064, .009], [.062, .031], [.052, .038], [.030, .042], [.027, .052], [.031, .057], [.023, .059], [.020, .046]], 14), m.brass, 0, 0, 0);
    put(stock([[0, .041, 0, .006], [.017, .083, -.01, .006], [.060, .19, -.034, .004], [.067, .205, -.041, .002]], 7), m.black, 0, 0, 0);
  });
}
