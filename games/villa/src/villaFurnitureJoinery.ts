import * as THREE from 'three';
import { bent, board, casting, fieldFrame, loft, rail, sheet, stock, turn, type FurnitureKit, type Ring } from './villaFurnitureForms.js';
import { seatPad } from './villaFurnitureTextiles.js';

/** Drawbored trestle, with an eased overhanging edge, shouldered feet and an
 * actual through-stretcher beneath the top. Small side tables get tripod feet. */
export function joineryTable(k: FurnitureKit, w: number, d: number, h: number, top: THREE.Material) {
  const { put, m, box } = k, thick = Math.min(.09, h * .15);
  put(board(w, d, thick, Math.min(.16, d * .15), .043), top, 0, h - thick / 2, 0);
  if (w < .8) {
    put(turn([[0, .025], [.062, .025], [.077, .065], [.055, .13], [.037, h * .65], [.068, h - thick], [0, h - thick]], 12), m.walnut, 0, 0, 0);
    for (let i = 0; i < 3; i++) k.at(0, 0, 0, i * 2 * Math.PI / 3, () => bent(k, m.walnut, [[0, .19, 0, .039], [0, .10, d * .22, .034], [0, .025, d * .43, .026]]));
  } else {
    const half = d * .414, leg = Math.min(.095, w * .12);
    for (const x of [-w * .34, w * .34]) {
      // End elevation sawn as one continuous fork. No fictitious solid apron between the sitter's knees.
      const outline = [[-half, 0], [-half + leg, 0], [-half * .38, h * .46], [half * .38, h * .46], [half - leg, 0], [half, 0],
        [half * .63, h * .55], [half * .84, h - thick], [half * .55, h - thick], [half * .31, h * .62], [-half * .31, h * .62],
        [-half * .55, h - thick], [-half * .84, h - thick], [-half * .63, h * .55]];
      put(casting(outline, leg), m.walnut, x, 0, 0, 0, Math.PI / 2);
      for (const z of [-half * .59, half * .59]) put(turn([[0, 0], [.015, 0], [.017, .008], [0, .012]], 8), m.oak, x + leg / 2, h * .54, z, 0, 0, -Math.PI / 2);
    }
    box(0, h * .54, 0, w * .74, .069, .087, m.oak, 0);
    for (const z of [-d * .28, d * .28]) box(0, h - thick - .029, z, w * .78, .061, .065, m.walnut, 0);
  }
}

export function diningChair(k: FurnitureKit, upholstery: THREE.Material, stool = false) {
  const { m, put } = k, h = stool ? .71 : .44, s = stool ? .82 : 1;
  // Rear legs continue into the back stiles; the shoulder blade is laminated
  // in two curves, a concave face on the sitter and a convex, finished rear.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const points: [number, number, number, number][] = [[sx * .246 * s, 0, sz * .238 * s, .025], [sx * .246 * s, .018, sz * .238 * s, .026],
      [sx * .243 * s, .065, sz * .232 * s, .029], [sx * .195 * s, h * .71, sz * .19 * s, .035], [sx * .216 * s, h, sz * .202 * s, .038]];
    if (sz === 1 && !stool) points.push([sx * .231, .68, .23, .029], [sx * .249, .92, .269, .027], [sx * .246, 1.012, .271, .026]);
    bent(k, m.walnut, points);
  }
  put(board(.590 * s, .588 * s, .056, .105, .023), m.oak, 0, h, 0);
  put(seatPad(.615 * s, .602 * s, stool ? .094 : .126, .23), upholstery, 0, h + .049, -.011);
  if (stool) {
    for (const sx of [-1, 1]) rail(k, [sx * .178, .28, -.176], [sx * .178, .28, .176], .014, m.brass);
    for (const sz of [-1, 1]) rail(k, [-.182, .28, sz * .176], [.182, .28, sz * .176], .014, m.brass);
  } else {
    const blade = sheet([-1, -.88, -.57, 0, .57, .88, 1], [-1, -.80, .12, .85, 1], (u, v, under) => {
      const edge = Math.abs(u), z = .286 - .119 * u * u - .010 * (1 - v) + (under ? .018 : -.018);
      return [u * (.30 - .013 * v * v), -z, .903 + .135 * v + .038 * (1 - edge * edge) - .026 * edge ** 4 * v];
    });
    put(blade, m.oak, 0, 0, 0, -Math.PI / 2);
    // A bifurcated bentwood splat rather than a filled rectangular back.
    for (const sx of [-1, 1]) bent(k, m.walnut, [[sx * .033, .474, .206, .018], [sx * .045, .566, .217, .018], [sx * .084, .696, .238, .016], [sx * .146, .85, .251, .015]]);
  }
}

export function bench(k: FurnitureKit, w: number, d: number, seatY: number, fabric: THREE.Material) {
  const { m, put } = k;
  for (const x of [-w * .37, w * .37]) {
    const p = [[-d * .44, 0], [-d * .30, 0], [-d * .20, seatY * .55], [d * .20, seatY * .55], [d * .30, 0], [d * .44, 0],
      [d * .31, seatY * .76], [d * .37, seatY - .065], [-d * .37, seatY - .065], [-d * .31, seatY * .76]];
    put(casting(p, .083), m.oak, x, 0, 0, 0, Math.PI / 2);
  }
  k.box(0, seatY * .63, 0, w * .81, .062, .073, m.walnut, 0);
  put(board(w, d, .064, .065), m.walnut, 0, seatY - .085, 0);
  put(seatPad(w - .012, d, .145), fabric, 0, seatY, 0);
}

export function pull(k: FurnitureKit, x: number, y: number, z: number, span: number, projection: number, metal: THREE.Material, vertical = false) {
  const g = stock([[-span / 2, 0, 0, .009], [-span / 2, 0, projection * .68, .011], [-span * .43, 0, projection, .014], [span * .43, 0, projection, .014], [span / 2, 0, projection * .68, .011], [span / 2, 0, 0, .009]], 8);
  k.put(g, metal, x, y, z, 0, 0, vertical ? Math.PI / 2 : 0);
}
/** A breakfront with actual carcase panels and feet, not a cabinet-sized solid.
 * Its front is +Z; keep handles within the caller's allowed depth. */
export function cabinet(k: FurnitureKit, w: number, d: number, h: number, count: number, face: THREE.Material, top: THREE.Material) {
  const { m, put, box } = k, t = .035, front = d / 2 - .065;
  for (const x of [-w / 2 + .08, w / 2 - .08]) for (const z of [-d / 2 + .075, d / 2 - .075])
    put(turn([[0, 0], [.037, 0], [.041, .016], [.049, .076], [.055, .11], [0, .11]], 8), m.walnut, x, 0, z);
  box(0, h / 2 + .035, -d / 2 + .012, w - .04, h - .105, .024, m.walnut, 0);
  for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) box(x, h / 2 + .035, -.018, t, h - .11, d - .04, m.oak, 0);
  put(board(w - .012, d - .03, .048, .022), m.oak, 0, .107, -.012);
  put(board(w, d, .045, .027, .015), top, 0, h - .0225, 0);
  for (let i = 0; i < count; i++) {
    const cell = (w - .075) / count, x = cell * (i - (count - 1) / 2);
    put(fieldFrame(cell - .014, h - .191, .036, Math.min(.065, cell * .11)), face, x, h / 2 + .042, front);
    pull(k, x, h * .68, front + .018, Math.min(cell * .40, .18), .027, m.brass);
  }
}

/** Cloth case wraps continuously around the convex spine and returns along
 * both boards. A narrower, shorter page block exposes head, tail and fore-edge. */
export function boundBook(k: FurnitureKit, x: number, y: number, z: number, w: number, h: number, d: number, cover: THREE.Material, lying = false, lean = 0) {
  const { put, m } = k, t = Math.min(.005, w * .12), a = w / 2, b = d / 2;
  const wrap = [[-a, b], [-a, -b + .012], [-a * .86, -b], [0, -b - .006], [a * .86, -b], [a, -b + .012], [a, b],
    [a - t, b], [a - t, -b + .013], [a * .70, -b + .007], [0, -b + .005], [-a * .70, -b + .007], [-a + t, -b + .013], [-a + t, b]];
  const rotation = lying ? Math.PI / 2 : lean;
  const cy = y + (lying ? w / 2 : Math.abs(Math.cos(lean)) * h / 2 + Math.abs(Math.sin(lean)) * w / 2);
  const draw = (g: THREE.BufferGeometry, material: THREE.Material) => put(g.rotateX(-Math.PI / 2), material, x, cy, z, 0, 0, rotation);
  draw(casting(wrap, h), cover);
  draw(casting([[-a + t, b - .008], [0, b - .013], [a - t, b - .008], [a - t, -b + .014], [-a + t, -b + .014]], h - .012), m.cream);
  // Hot-stamped band follows the projecting spine, not a floating gold bar.
  const band = new THREE.PlaneGeometry(w * .61, h * .037, 2, 1), pos = band.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, b + .0068 - .006 * Math.abs(pos.getX(i)) / (w * .43));
  band.translate(0, h * .23, 0); put(band, m.brass, x, cy, z, 0, 0, rotation);
}

export function bookcase(k: FurnitureKit, w: number, books: (x: number, y: number, z: number, count: number) => void) {
  const { box, put, m } = k;
  for (const x of [-w / 2, w / 2]) {
    const side = [[-.185, 0], [-.115, 0], [-.08, .09], [.097, .09], [.13, 0], [.185, 0], [.19, 2.21], [.155, 2.27], [.155, 2.32], [-.185, 2.32]];
    put(casting(side, .062), m.oak, x, 0, 0, 0, Math.PI / 2);
  }
  const panels = Math.ceil(w / .55);
  for (let j = 0; j < panels; j++) box((j - (panels - 1) / 2) * w / panels, 1.205, -.173, w / panels - .006, 2.2, .025, m.walnut, 0);
  for (let i = 0; i < 5; i++) {
    put(board(w, .384, .054, .020, .016), m.oak, 0, .157 + i * .48, 0);
    const base = .184 + i * .48, titles = Math.max(3, Math.floor(w * (i % 2 ? 2.4 : 3.1)));
    const left = i % 2 === 0;
    books(left ? -w / 2 + .11 : w / 2 - titles * .097 - .12, base, .004, titles);
    if (i === 1 || i === 3) {
      const x = left ? w / 2 - .31 : -w / 2 + .32;
      boundBook(k, x, base, .018, .052, .376, .246, m.terra, true);
      k.at(x + .012, base + .052, .013, .09, () => boundBook(k, 0, 0, 0, .041, .319, .224, m.blue, true));
    }
  }
  put(board(w + .074, .405, .067, .030, .025), m.oak, 0, 2.303, 0);
}

export function shade(top: number, bottom: number, h: number) {
  const ring = (r: number, y: number, pleat: number): Ring => Array.from({ length: 28 }, (_, i) => {
    const a = -i * 2 * Math.PI / 28, rad = r + (i % 2 ? -.5 : .5) * pleat;
    return [Math.cos(a) * rad, y, Math.sin(a) * rad];
  });
  return loft([ring(bottom - .007, -h / 2, .004), ring(bottom, -h / 2 + .005, .007), ring(bottom * .991, -h / 2 + .018, .014),
    ring(top, h / 2, .008), ring(top - .007, h / 2, .005), ring(bottom - .013, -h / 2 + .014, .008), ring(bottom - .007, -h / 2, .004)], false, false);
}
export function lightFixture(k: FurnitureKit, tall: boolean) {
  const { put, m } = k, h = tall ? 1.65 : .52, t = tall ? .22 : .147, b = tall ? .34 : .223, depth = tall ? .44 : .29;
  put(turn(tall ? [[0, .007], [.186, .007], [.190, 0], [.216, 0], [.222, .014], [.232, .034], [.216, .053], [.115, .068], [.069, .088], [.049, .116], [0, .116]] :
    [[0, 0], [.106, 0], [.126, .012], [.126, .023], [.111, .034], [0, .034]], 12), m.brass, 0, 0, 0);
  put(turn(tall ? [[.045, .08], [.054, .11], [.055, .17], [.034, .24], [.018, 1.13], [.027, 1.32], [.042, 1.39], [.030, 1.44], [.021, 1.50]] :
    [[.073, .021], [.101, .054], [.113, .095], [.110, .143], [.084, .18], [.052, .205], [.037, .25], [.034, .31], [.045, .33], [.042, .347]], 12), tall ? m.walnut : m.sage, 0, 0, 0);
  put(turn([[.038, 0], [.040, .026], [.029, .037], [.026, .093], [0, .093]], 12), m.brass, 0, h - depth * .65, 0);
  put(shade(t, b, depth), m.linen, 0, h, 0);
  const bulb = new THREE.SphereGeometry(tall ? .060 : .040, 10, 6); bulb.scale(1, 1.25, 1);
  put(bulb, m.lampGlow, 0, h - depth * .22, 0);
  for (let i = 0; i < 3; i++) { const a = i * 2.094; rail(k, [0, h - depth * .42, 0], [Math.cos(a) * b * .88, h - depth * .36, Math.sin(a) * b * .88], .0038, m.brass, 5); }
}

export function vessel(radius: number, h: number, foot = .45, n = radius < .10 ? 14 : radius < .20 ? 18 : 24) {
  const r = radius;
  return turn([[0, h * .046], [r * foot * .74, h * .046], [r * foot * .78, 0], [r * foot, 0],
    [r * foot, h * .105], [r * .71, h * .29], [r * .92, h * .65], [r, h * .955], [r * .980, h],
    [r * .925, h * .949], [r * .81, h * .57], [r * .43, h * .197], [0, h * .143]], n);
}
export function teaSetting(k: FurnitureKit, x: number, y: number, z: number) {
  const { put, m } = k;
  put(vessel(.14, .026, .48), m.white, x, y, z);
  put(vessel(.075, .121, .56), m.white, x, y + .0048, z);
  put(stock([[.064, .098, 0, .010], [.087, .110, 0, .010], [.111, .108, 0, .009], [.122, .093, 0, .009], [.120, .072, 0, .009], [.103, .052, 0, .009], [.078, .043, 0, .010], [.057, .050, 0, .010]], 8), m.white, x, y + .0048, z);
  // A low tea level leaves the glaze and lip visible from above and across the table.
  put(turn([[0, 0], [.060, 0], [.060, .002], [0, .002]], 20), m.walnut, x, y + .0838, z);
}
