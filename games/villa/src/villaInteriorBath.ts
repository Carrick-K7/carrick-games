import * as THREE from 'three';
import { bent, board, casting, loft, oval, rail, rectRing, rectXY, sheet, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { cabinet, pull, teaSetting, vessel } from './villaFurnitureJoinery.js';
import { seatPad, towelRoll } from './villaFurnitureTextiles.js';
import { frontLoader } from './villaInteriorKitchen.js';

export function foldedTowel(w: number, d: number, h: number) {
  // Side view of a single terry piece doubled back on itself. The fold bulges
  // on the closed side, the opposite side exposes the hollow between its hems.
  const p = [[-.47, 0], [.43, 0], [.49, .10], [.5, .26], [.46, .39], [-.35, .41], [-.37, .46], [-.35, .52], [.38, .53], [.44, .6], [.45, .74], [.39, .81], [-.39, .82], [-.42, .87], [-.37, .92], [.385, .92], [.385, 1], [-.43, 1], [-.49, .93], [-.495, .80], [-.445, .704], [.33, .69], [.34, .65], [-.408, .64], [-.482, .56], [-.48, .405], [-.407, .31], [.39, .295], [.411, .23], [.383, .163], [-.47, .157]];
  return casting(p.map(([z, y]) => [z * d, y * h]), w).rotateY(Math.PI / 2);
}

export function tubShell() {
  const station = (w: number, d: number, y: number, rise: number) => oval(w, d, y, 32, .76).map(([x, yy, z]): Point => {
    const t = z / (d / 2);
    return [x * (1 - .034 * t), yy + rise * Math.abs(t) ** 3 * (1 + .16 * t), z];
  });
  return loft([station(1.38, 2.79, .022, 0), station(1.54, 3.02, .049, 0), station(1.65, 3.17, .129, .009), station(1.91, 3.72, .32, .018),
    station(2.22, 4.10, .60, .054), station(2.343, 4.27, .674, .067), station(2.35, 4.277, .706, .069), station(2.319, 4.25, .725, .064),
    station(2.216, 4.131, .724, .063), station(2.159, 4.065, .690, .058), station(1.97, 3.78, .49, .030), station(1.76, 3.40, .323, 0),
    station(1.54, 3.04, .218, 0), station(1.23, 2.56, .170, 0), station(.86, 1.84, .157, 0)]);
}

export function bathFittings(k: FurnitureKit, water: THREE.Material, screen: THREE.Material, glass: THREE.Material) {
  const { at, put, box, m, hit } = k;
  at(11.4, 3.6, -4.4, 0, () => {
    put(tubShell(), m.white, 0, 0, 0);
    put(loft([oval(1.744, 3.37, .317, 32, .76), oval(1.757, 3.392, .3225, 32, .76)]), water, 0, 0, 0);
    put(turn([[0, 0], [.052, 0], [.058, .008], [.05, .013], [.031, .015], [0, .013]], 16), m.steel, 0, .157, -.71);
    put(turn([[0, 0], [.09, 0], [.091, .022], [.071, .039], [.044, .045], [0, .045]], 16), m.brass, 1.03, .003, -1.68);
    bent(k, m.brass, [[1.03, .043, -1.68, .040], [1.03, .17, -1.68, .034], [1.03, .97, -1.68, .031], [1.016, 1.065, -1.68, .031], [.972, 1.115, -1.68, .031], [.902, 1.139, -1.68, .029], [.652, 1.139, -1.68, .027], [.607, 1.124, -1.68, .027], [.580, 1.091, -1.68, .027], [.578, 1.058, -1.68, .029]]);
    for (const z of [-1.77, -1.59]) { rail(k, [1.03, .894, -1.68], [1.03, .894, z], .026, m.brass); rail(k, [.986, .894, z], [1.075, .894, z], .012, m.white); }
    // End blocks grip the tub lip; spaced oak strips bridge over the water.
    for (const x of [-1.069, 1.069]) put(board(.116, .383, .077, .022), m.walnut, x, .743, .9);
    for (let i = 0; i < 5; i++) put(board(2.214, .056, .036, .014, .007), m.oak, 0, .787, .752 + .075 * i);
    teaSetting(k, .30, .807, .90); hit(0, 0, 0, 2.45, .8, 4.4);
  });
  at(15.85, 3.6, -7.85, 0, () => {
    put(loft([rectRing(1.88, 1.88, .033, .003), rectRing(1.90, 1.90, .040, .099), rectRing(1.886, 1.886, .038, .128),
      rectRing(1.809, 1.809, .05, .129), rectRing(1.77, 1.77, .060, .109), rectRing(.692, .124, .031, .068, .188, -.538), rectRing(.647, .078, .02, .058, .188, -.538)]), m.stone, 0, 0, 0);
    put(board(.625, .068, .014, .016), m.dark, .188, .068, -.538);
    for (let i = 0; i < 12; i++) rail(k, [-.092 + i * .051, .078, -.572], [-.092 + i * .051, .078, -.506], .003, m.steel, 5);
    box(-.925, 1.2, 0, .018, 2.15, 1.9, screen, 0); box(-.475, 1.2, .925, .93, 2.15, .018, screen, 0);
    for (const z of [-.849, .866]) for (const y of [.194, 2.246]) put(board(.060, .082, .056, .01), m.steel, -.925, y, z);
    rail(k, [-.925, 2.298, -.946], [-.925, 2.298, .945], .013, m.steel);
    rail(k, [-.925, 2.298, .925], [-.005, 2.298, .925], .013, m.steel);
    for (const y of [.786, 1.91]) rail(k, [.937, y, 0], [.937, y, -.073], .036, m.steel);
    bent(k, m.steel, [[.937, .737, 0, .021], [.937, 2.185, 0, .021], [.919, 2.248, 0, .022], [.875, 2.28, 0, .022], [.248, 2.28, 0, .021], [.208, 2.268, 0, .021], [.200, 2.246, 0, .023]]);
    put(turn([[0, -.016], [.139, -.016], [.167, -.014], [.172, -.005], [.171, .006], [.149, .014], [.055, .031], [.029, .036], [0, .036]], 22), m.steel, .2, 2.245, 0);
    for (let i = 0; i < 13; i++) {
      const a = i * 2.4, r = i ? .129 * Math.sqrt(i / 12) : 0;
      put(turn([[0, 0], [.005, 0], [.008, .009], [0, .009]], 6), m.black, .20 + Math.cos(a) * r, 2.222, Math.sin(a) * r);
    }
    hit(-.925, 0, 0, .1, 2.4, 1.9); hit(-.475, 0, .925, .95, 2.4, .1);
  });
  at(13.7, 3.6, .42, Math.PI, () => {
    cabinet(k, 1.90, .85, .865, 2, m.oak, m.walnut);
    put(board(2, .94, .075, .050, .021), m.white, 0, .9025, 0);
    put(vessel(.305, .178, .48, 24).scale(1.05, 1, .83), m.white, 0, .94, .031);
    put(turn([[0, 0], [.025, 0], [.022, .005], [0, .006]], 12), m.steel, 0, .966, .031);
    bent(k, m.brass, [[0, .94, -.306, .040], [0, .969, -.306, .040], [0, .980, -.306, .028], [0, 1.25, -.306, .027], [0, 1.292, -.290, .024], [0, 1.306, -.260, .023], [0, 1.306, -.144, .023], [0, 1.292, -.126, .022], [0, 1.277, -.126, .022]]);
    pull(k, .042, 1.078, -.306, .087, .013, m.brass, true);
    const mirror = rectXY(1.48, 1.38, .242);
    put(casting(mirror, .046, [rectXY(1.429, 1.329, .223)]), m.brass, 0, 1.96, -.372);
    put(casting(rectXY(1.440, 1.340, .227), .015), m.steel, 0, 1.96, -.367);
    for (let i = 0; i < 3; i++) put(towelRoll(.285, .061), m.linen, -.73 + (i === 2 ? .063 : i * .126), .999 + (i === 2 ? .105 : 0), .076);
    hit(0, 0, 0, 2, .97, .94);
  });
  at(9.4, 3.6, -8.08, 0, () => {
    frontLoader(k, 1.09, .991, .946, glass, false, m.blue);
    put(board(1.22, 1.08, .090, .035, .023), m.oak, 0, 1.01, 0);
    for (let i = 0; i < 3; i++) put(foldedTowel(.64 - i * .027, .49, .080), i % 2 ? m.sage : m.linen, .1 + i * .009, 1.055 + i * .080, 0, 0, i * .02);
    hit(0, 0, 0, 1.22, 1.06, 1.1);
  });
}

export function treatmentTable(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const z of [-.73, .73]) {
    for (const x of [-.342, .342]) bent(k, m.walnut, [[x, .009, z * 1.08, .035], [x * .98, .10, z * 1.04, .038], [x * .85, .41, z, .049], [x * .93, .715, z * .96, .046]]);
    box(0, .308, z, .644, .056, .056, m.oak, 0);
  }
  for (const x of [-.286, .286]) {
    box(x, .287, 0, .055, .06, 1.51, m.oak, 0);
    rail(k, [x, .326, -.64], [x, .685, -.25], .012, m.brass);
    rail(k, [x, .326, .64], [x, .685, .25], .012, m.brass);
  }
  put(board(.862, 2.055, .095, .116), m.walnut, 0, .732, 0);
  put(seatPad(.918, 2.139, .144, .054), m.cream, 0, .841, 0);
  put(sheet([-1, -.83, 0, .83, 1], [-1, -.94, .72, .93, 1], (u, v, under) => [u * .446, .926 - .051 * Math.abs(u) ** 6 - .020 * Math.abs(v) ** 5 - (under ? .013 : 0), .325 + v * .341]), m.sage, 0, 0, 0);
  put(towelRoll(.572, .074), m.linen, 0, .985, .776, 0, Math.PI / 2);
  for (const x of [-.123, .123]) bent(k, m.steel, [[x, .766, -.945, .011], [x, .77, -1.108, .011], [x * .94, .82, -1.195, .012]]);
  // Padded crescent with a genuine breathing aperture *and* throat opening.
  const ring = Array.from({ length: 17 }, (_, i) => {
    const a = (-.32 + i / 16 * 1.64) * Math.PI, c = Math.cos(a), s = Math.sin(a), r = .042 * (.70 + .30 * Math.sin(i / 16 * Math.PI));
    return Array.from({ length: 8 }, (_, j): Point => {
      const b = j / 8 * Math.PI * 2;
      return [c * (.121 + r * Math.cos(b)), .853 + .047 * Math.sin(b), -1.189 - s * (.133 + r * Math.cos(b))];
    });
  });
  put(loft(ring), m.cream, 0, 0, 0);
}

export function spaStorage(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const x of [-.85, .85]) put(board(.058, .458, 1.96, .018, .007), m.walnut, x, .98, -.016);
  for (let i = 0; i < 6; i++) box(-.716 + i * .288, .98, -.217, .275, 1.92, .044, m.oak, 0);
  for (let i = 0; i < 3; i++) {
    const y = .42 + .58 * i;
    put(board(1.70, .444, .045, .022), m.oak, 0, y, 0);
    for (let t = 0; t < 2; t++) put(foldedTowel(.55 - t * .025, .357, .078), i % 2 ? m.sage : m.linen, -.31 + .016 * t, y + .023 + .078 * t, 0);
    if (i < 2) put(vessel(.103, .073, .47, 14), m.brass, .52, y + .022, .042);
    else put(towelRoll(.29, .066), m.linen, .508, y + .086, .015);
  }
}
