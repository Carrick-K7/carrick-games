import * as THREE from 'three';
import { formedTube, foldedLinen } from './villaFittingGeometry.js';
import { turn, type FurnitureKit } from './villaFurnitureForms.js';
import { pantryPart, type PantrySwatch } from './villaPantryFinish.js';

/** Thrown stoneware. The bare, recessed foot meets the glaze line; the lip
 * turns back into a usable well (not a coloured lid over a filled cylinder). */
export function thrownCup(k: FurnitureKit, x: number, y: number, z: number, r: number, h: number, glaze: PantrySwatch, n = 16) {
  const s = (profile: [number, number][]) => turn(profile.map(([a, b]) => [a * r, b * h]), n);
  pantryPart(k, s([[0, .047], [.38, .047], [.40, 0], [.52, 0], [.54, .116]]), 'biscuit', x, y, z, 0, 0, 0, 'turned');
  pantryPart(k, s([[.54, .116], [.66, .211], [.655, .229], [.69, .250], [.943, .876], [1, .947], [.99, .987],
    [.95, 1], [.909, .957], [.87, .80], [.56, .226], [.38, .179], [0, .172]]), glaze, x, y, z, 0, 0, 0, 'turned');
}
export function coupe(k: FurnitureKit, x: number, y: number, z: number, r: number, h: number, glaze: PantrySwatch, n = 20) {
  const g = turn([[0, h * .115], [.37 * r, h * .115], [.40 * r, 0], [.48 * r, 0], [.49 * r, h * .26],
    [.72 * r, h * .36], [r, h * .86], [.984 * r, h], [.928 * r, h * .95], [.62 * r, h * .458], [.54 * r, h * .413], [0, h * .413]], n);
  pantryPart(k, g, glaze, x, y, z, 0, 0, 0, 'turned');
}
export function indoorTeaSetting(k: FurnitureKit, x: number, y: number, z: number) {
  coupe(k, x, y, z, .140, .023, 'oatmeal', 14);
  const seat = y + .023 * .413;
  thrownCup(k, x, seat, z, .075, .121, 'celadon', 14);
  const handle = formedTube([[.063, .092, 0, .008, .012], [.086, .102, 0, .008, .010], [.104, .102, 0, .008, .009],
    [.118, .089, 0, .007, .009], [.115, .068, 0, .007, .009], [.100, .050, 0, .007, .010], [.072, .041, 0, .0075, .010], [.058, .048, 0, .009, .012]], 8);
  pantryPart(k, handle, 'celadon', x, seat, z, 0, 0, 0, 'face');
  // This stationary tea is inside its measured bowl wall; the drinking cup at
  // the brewing station uses the independently animated free-surface solver.
  pantryPart(k, turn([[.0614, .001], [.0588, .0007], [0, .0007]], 14), 'tenmoku', x, seat + .079, z);
}

/** A cast-iron tetsubin sits ON three pads. It has a high swinging bail with
 * a wrapped centre grip, and is clearly not another teapot pasted to a bowl. */
export function ironKettle(k: FurnitureKit) {
  const { put, m } = k;
  pantryPart(k, turn([[0, .004], [.117, .004], [.118, 0], [.136, 0], [.145, .009], [.156, .071], [.148, .083],
    [.130, .085], [.120, .078], [.116, .018], [0, .014]], 18), 'iron', 0, 0, 0, 0, 0, 0, 'turned');
  for (let i = 0; i < 3; i++) k.at(0, 0, 0, i * Math.PI * 2 / 3, () =>
    k.box(.104, .089, 0, .080, .018, .019, m.black, 0));
  const base = .098;
  const body = turn([[0, .005], [.071, .005], [.074, 0], [.095, 0], [.101, .010], [.128, .023], [.158, .070], [.161, .089],
    [.157, .103], [.145, .134], [.132, .145], [.129, .147], [.123, .147], [.118, .153], [.091, .165], [.081, .169], [.081, .174],
    [.075, .174], [.073, .167], [.086, .158], [.137, .124], [.145, .074], [.102, .030], [0, .021]], 22);
  pantryPart(k, body, 'iron', 0, base, 0, 0, 0, 0, 'turned');
  put(turn([[0, 0], [.083, 0], [.087, .003], [.086, .008], [.072, .012], [.034, .021], [.012, .023], [.011, .029],
    [.019, .034], [.017, .042], [.009, .047], [0, .047]], 16), m.black, 0, base + .173, 0);
  pantryPart(k, formedTube([[.121, .094, 0, .026, .041], [.157, .111, 0, .028, .034], [.182, .143, 0, .020, .025],
    [.210, .167, 0, .014, .019], [.228, .174, 0, .015, .020]], 11, .003), 'iron', 0, base, 0, 0, 0, 0, 'face');
  const bail = formedTube([[0, .13, -.133, .011], [0, .17, -.137, .008], [0, .259, -.118, .009], [0, .309, -.078, .010],
    [0, .328, -.035, .011], [0, .329, .034, .011], [0, .308, .077, .010], [0, .261, .116, .009], [0, .17, .137, .008], [0, .13, .133, .011]], 9, 0, [1, 0, 0]);
  pantryPart(k, bail, 'iron', 0, base, 0);
  const grip = formedTube([[0, .326, -.043, .012], [0, .329, -.035, .014], [0, .332, -.022, .013], [0, .332, .019, .014], [0, .327, .043, .012]], 9, 0, [1, 0, 0]);
  put(grip, m.walnut, 0, base, 0);
}
export function liddedCaddy(k: FurnitureKit, x: number, y: number, z: number, r: number, h: number, glaze: PantrySwatch) {
  // Closed storage pots: don't turn a hidden inner belly or bury two caps under a fitted lid.
  pantryPart(k, turn([[.77 * r, 0], [r, .023], [r, h * .77], [r * .91, h * .87], [r * .74, h * .93], [r * .75, h]], 12), glaze, x, y, z, 0, 0, 0, 'turned');
  k.put(turn([[r * .77, 0], [r * .80, .003], [r * .77, .011], [r * .17, .017], [0, .017]], 12), k.m.walnut, x, y + h, z);
}
export function teaCloth(k: FurnitureKit, w: number, d: number, h: number) {
  pantryPart(k, foldedLinen(w, d, h), 'indigo');
  // Dyed twin selvedge, following the top folded leaf, not a floating straight bar.
  const chart = (x: number, z: number) => h * (.865 + .029 * (1 - (2 * x / w) ** 2) + .024 * (z / d));
  for (const x of [-w * .34, -w * .30]) {
    const g = new THREE.BufferGeometry(), z = d * .35, a = .002;
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, chart(x, -z), -z, x, chart(x, z), z, x + a, chart(x + a, z), z, x + a, chart(x + a, -z), -z], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); k.put(g, k.m.linen, 0, 0, 0);
  }
}
