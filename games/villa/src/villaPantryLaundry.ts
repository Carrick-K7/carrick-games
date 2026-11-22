import { foldedLinen } from './villaFittingGeometry.js';
import { sheet, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { pantryPart } from './villaPantryFinish.js';

/** A loose shirt/towel falls onto the cylindrical drum, not a solid lump pasted
 * to the window. The front selvedge rolls back over the lower, compressed folds. */
export function drumLoad(k: FurnitureKit, r: number, cy: number, front: number, depth: number, dryer: boolean) {
  const xs = [-1, -.80, -.58, -.35, -.11, .15, .40, .65, .83, 1],
    zs = [-1, -.44, .17, .77, 1];
  const textile = (u: number, v: number, under: boolean, upper: boolean): Point => {
    const x = r * (upper ? .055 + u * .67 + .037 * Math.sin(3 * v) : u * .79),
      tray = -Math.sqrt(Math.max(.01 * r * r, (.92 * r) ** 2 - x * x)), t = (v + 1) / 2;
    const bulk = .10 + .21 * Math.sin((u + .17 * v) * 7.6) ** 2 + .15 * (1 - u * u) + .026 * Math.sin(v * 4 + u * 5);
    const hem = Math.exp(-(((v - .87) / .14) ** 2)) * .052;
    const y = cy + tray + r * (upper ? bulk + .08 + .10 * Math.cos(u * 7 - v * 1.4) : under ? .004 : bulk * .73)
      + (upper && under ? -.004 : 0);
    return [x, y + (under || !upper ? 0 : r * hem), front - .13 - depth * .14 * (1 - t) - depth * (upper ? .019 : .14) * (1 - t) + .018 * Math.sin(u * 4.6 + v * .64)];
  };
  for (const upper of [false, true]) {
    const g = sheet(xs, zs, (u, v, under) => textile(u, v, under, upper));
    pantryPart(k, g, upper ? dryer ? 'linen' : 'indigo' : dryer ? 'indigo' : 'linen');
  }
  for (const v of [.86, .93]) {
    const g = sheet(xs, [v, v + .031], (u, vv) => { const [x, y, z] = textile(u, vv, false, true); return [x, y + .0007, z]; }, true);
    pantryPart(k, g, dryer ? 'indigo' : 'linen');
  }
}

export function laundryDressings(k: FurnitureKit) {
  const { m, put } = k;
  // Folded work waiting on the dryer. Tinted binding traces the actual folds;
  // no props bridge the visitors' aisle or cover the window behind the machines.
  k.at(-1.52, .94, -3.34, -.05, () => {
    put(foldedLinen(.34, .33, .057), m.linen, 0, 0, 0);
    pantryPart(k, foldedLinen(.313, .301, .051), 'indigo', -.010, .0505, -.004, 0, .05);
  });
  // Refillable detergent and a measuring beaker on the low oak utility shelf.
  for (const [z, r, h] of [[1.30, .081, .238], [1.49, .066, .186]]) {
    pantryPart(k, turn([[r * .84, 0], [r, .010], [r, h * .76], [r * .65, h * .92], [r * .65, h]], 12), 'oatmeal', -3.90, .5215, z, 0, 0, 0, 'turned');
    put(turn([[r * .69, 0], [r * .71, .004], [r * .68, .024], [0, .026]], 12), m.walnut, -3.90, .5215 + h, z);
  }
  put(foldedLinen(.22, .325, .045), m.linen, -3.90, 1.1215, 2.43, 0, .04);
}
