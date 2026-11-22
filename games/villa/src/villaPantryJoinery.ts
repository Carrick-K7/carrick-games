import * as THREE from 'three';
import { casting, circleXY, loft, rectRing, turn, type FurnitureKit, type Ring } from './villaFurnitureForms.js';
import { pantryPart } from './villaPantryFinish.js';

/** A 38 mm honed slab, pencil round over the nosing. On the sink slab the
 * top, lower chamfer and underside all return into the same rounded cutout. */
export function counterSlab(width: number, sinkX?: number) {
  const outside = (w: number, d: number, y: number) => rectRing(w, d, .009, y, 0, 0, 3);
  const deck = [outside(width - .007, 1.073, .952), outside(width - .002, 1.078, .954), outside(width, 1.080, .958),
    outside(width, 1.080, .986), outside(width - .002, 1.078, .989), outside(width - .006, 1.074, .990)];
  if (sinkX === undefined) return loft(deck);
  const eye = (w: number, d: number, y: number) => rectRing(w, d, .061, y, sinkX, 0, 3);
  const back = eye(.760, .619, .952);
  return loft([back, ...deck, eye(.770, .629, .990), eye(.765, .624, .989), eye(.760, .619, .986), eye(.758, .617, .982), eye(.758, .617, .955), back], false, false);
}
export function undermount(k: FurnitureKit) {
  const rim = (w: number, d: number, y: number) => rectRing(w, d, .061, y, 0, 0, 3);
  // Wet ledge behind the well receives the live stream at its original y=.927.
  // Ahead of it the pressing is much deeper, with its low point at the strainer.
  const draw = (w: number, d: number, cz: number, rear: number, front: number, radius: number): Ring =>
    rectRing(w, d, radius, 0, 0, cz, 3).map(([x, , z]) => [x, THREE.MathUtils.lerp(rear, front, (z - cz) / d + .5), z]);
  const throat = (r: number, y: number): Ring => Array.from({ length: 16 }, (_, i) => {
    const a = -(i / 16 + .122) * 2 * Math.PI; return [r * Math.cos(a), y, .109 + r * Math.sin(a)];
  });
  const g = loft([rim(.800, .657, .9515), rim(.756, .616, .9515), rim(.748, .607, .947),
    draw(.720, .541, .012, .9305, .849, .061), draw(.681, .405, .058, .9269, .834, .066),
    draw(.625, .300, .067, .880, .825, .067), draw(.18, .141, .105, .817, .816, .045),
    throat(.047, .815), throat(.042, .813), throat(.041, .800)], false, false);
  pantryPart(k, g, 'nickel');
  // Stamped basket, not a black disk. Its through-holes reveal the trap shadow.
  const holes = Array.from({ length: 7 }, (_, i) => { const a = 2 * Math.PI * i / 7; return circleXY(.026 * Math.cos(a), .026 * Math.sin(a), .0054, 6); });
  k.put(casting(circleXY(0, 0, .0408, 20), .0024, holes), k.m.steel, 0, .8035, .109, -Math.PI / 2);
  k.put(turn([[.041, .799], [.039, .793], [.039, .772], [0, .770]], 16), k.m.dark, 0, 0, .109);
  k.put(turn([[0, 0], [.007, 0], [.009, .006], [.005, .009], [0, .009]], 10), k.m.steel, 0, .8047, .109);
}

/** Milky glaze breaks on the two eased arrises. The mortar is continuous,
 * independently behind the tiles (including the cut ends at the pier). */
function handmadeTile(width: number, height: number, variation: number) {
  const w = width / 2, h = height / 2, ring = (inset: number, depth: number) => [
    [-w + inset, -h + inset, depth], [w - inset, -h + inset, depth], [w - inset, h - inset, depth], [-w + inset, h - inset, depth],
  ];
  // Mortar conceals the back. A single bevel from grout to glaze describes
  // the cut arris; four broad facets retain the shallow hand-pressed crown.
  const vertices = [...ring(0, -.003), ...ring(.0026, .0058), [.06 * w, -.08 * h, .0063 + .00065 * Math.sin(variation)]].flat();
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4;
    ids.push(i, j, 4 + j, i, 4 + j, 4 + i, 4 + i, 4 + j, 8);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(ids); g.computeVertexNormals(); return g;
}
export function splashback(k: FurnitureKit) {
  const course = .108, module = .248, joint = .0038;
  const lay = (left: number, right: number, bottom: number, rows: number, start: number) => {
    k.box((left + right) / 2, bottom + course * rows / 2, -8.889, right - left, course * rows, .011, k.m.stone, 0);
    for (let row = 0; row < rows; row++) {
      const odd = (start + row) % 2;
      for (let i = odd ? -1 : 0; left + module * (i + odd / 2) < right; i++) {
        const a = Math.max(left, left + module * (i + odd / 2)), b = Math.min(right, left + module * (i + 1 + odd / 2));
        if (b - a < .016) continue;
        const variation = (start + row) * 31 + i + 7;
        pantryPart(k, handmadeTile(b - a - joint, course - joint, variation), 'tile', (a + b) / 2, bottom + course * (row + .5), -8.881, 0, 0, 0, 'face', variation);
      }
    }
  };
  lay(-11.157, -3.842, .990, 3, 0); lay(-8.987, -6.407, 1.314, 8, 3);
}
/** Cabinet fronts share milled outer and panel-edge profiles. Square fields with
 * a 6 mm setback, not a swollen bevel over the entire painted face. */
export function pantryFront(w: number, h: number, framed = true) {
  const outline = (ww: number, hh: number, z: number) => rectRing(ww, hh, .005, z, 0, 0, 1);
  const rings = [outline(w - .003, h - .003, -.010), outline(w, h, -.008), outline(w, h, .008), outline(w - .003, h - .003, .010)];
  if (framed) rings.push(outline(w - .098, h - .098, .010), outline(w - .103, h - .103, .0095), outline(w - .111, h - .111, .003), outline(w - .116, h - .116, .002));
  return loft(rings).rotateX(Math.PI / 2);
}
