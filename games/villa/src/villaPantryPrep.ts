import { formedTube } from './villaFittingGeometry.js';
import { board, casting, loft, rectRing, sheet, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { pantryPart, type PantrySwatch } from './villaPantryFinish.js';

function dryJar(k: FurnitureKit, x: number, y: number, z: number, r: number, h: number, glaze: PantrySwatch) {
  const g = turn([[r * .86, 0], [r, .007], [r, h * .74], [r * .94, h * .80], [r * .67, h * .90], [r * .67, h]], 12);
  pantryPart(k, g, glaze, x, y, z, 0, 0, 0, 'turned');
  k.put(turn([[r * .69, 0], [r * .73, .003], [r * .69, .015], [0, .017]], 12), k.m.walnut, x, y + h, z);
}
export function westLarder(k: FurnitureKit) {
  const { put, m, box } = k;
  k.at(-12.55, 0, -8.884, 0, () => {
    // A narrow wall dresser bears on the solid partition. Its entire depth lies
    // inside the wall standoff; neither the floor nor the kitchen doorway changes.
    for (const side of [-1, 1]) {
      const cheek = [[.003, 1.326], [.050, 1.326], [.064, 1.382], [.167, 1.433], [.202, 1.460], [.202, 2.280],
        [.169, 2.317], [.121, 2.331], [.058, 2.367], [.003, 2.367]];
      put(casting(cheek, .032), m.oak, side * .955, 0, 0, 0, -Math.PI / 2);
    }
    for (const y of [1.492, 2.034]) put(board(1.909, .205, .032, .013, .003), m.oak, 0, y, .105);
    for (const y of [1.67, 2.207]) box(0, y, .020, 1.898, .084, .032, m.walnut, 0);
    for (const x of [-.37, .161]) box(x, 1.762, .039, .023, .513, .052, m.oak, 0);
    // Slip-decorated plates slant back onto a stay. The deepest point on the
    // rim lands on the shelf, while keeper pegs catch the lower edge.
    for (const [i, x, r] of [[0, -.664, .165], [1, -.294, .133], [2, .027, .149]]) {
      const pitch = 1.29, high = .021;
      const disk = turn([[0, .003], [r * .44, .003], [r * .46, 0], [r * .54, 0], [r * .56, .005], [r * .84, .011],
        [r, .019], [r, high], [r * .975, .022], [r * .80, .014], [r * .65, .007], [0, .007]], 18);
      const cy = 1.508 + r * Math.sin(pitch) - .019 * Math.cos(pitch);
      pantryPart(k, disk, i % 2 ? 'oatmeal' : 'celadon', x, cy, .079, pitch, 0, 0, 'turned', i);
      for (const side of [-1, 1]) box(x + side * .048, 1.522, .151, .013, .030, .016, m.walnut, 0);
    }
    dryJar(k, .442, 1.508, .101, .073, .155, 'oatmeal'); dryJar(k, .659, 1.508, .102, .078, .184, 'ochre');
    for (const [i, x, r, h] of [[0, -.642, .080, .185], [1, -.440, .073, .161], [2, .409, .070, .188], [3, .615, .084, .210]])
      dryJar(k, x, 2.050, .105, r, h, i % 3 ? 'oatmeal' : 'tenmoku');
    // A linen drying loop over the lower rod; cloth comes down in two leaves.
    for (const x of [-.813, -.250]) box(x, 1.377, .065, .016, .026, .110, m.walnut, 0);
    k.put(formedTube([[-.822, 1.377, .121, .008], [-.242, 1.377, .121, .008]], 8, 0, [0, 0, 1]), m.brass, 0, 0, 0);
    const cloth = sheet([-1, -.72, -.39, -.12, .27, .54, .80, 1], [-1, -.45, .02, .12, .20, .29, .38, .65, 1], (u, v, under) => {
      const drape = Math.sin(u * 9 + .55 * v), fold = Math.min(1, Math.max(0, (v - .02) / .36)) * Math.PI;
      const y = v < .02 ? 1.378 + (v - .02) * .322 : v > .38 ? 1.378 - (v - .38) * .389 : 1.378 + Math.sin(fold) * .010;
      const z = .121 - .010 * Math.cos(fold) + drape * (.001 + .010 * Math.max(0, 1.373 - y) / .32);
      return [u * .107 - .565, y + .004 * drape * Math.min(1, Math.abs(v - .15)), z + (under ? -.0012 : 0)];
    });
    pantryPart(k, cloth, 'indigo', 0, 0, 0, 0, 0, 0, 'face');
  });
}
export function prepCounter(k: FurnitureKit) {
  // Olive oil and a salt cellar near the hob, with a resting prep spoon. Keep
  // the faucet clearance and all hot-zone apertures available.
  k.at(-7.13, .99, -8.58, .09, () => {
    pantryPart(k, turn([[0, .003], [.030, .003], [.034, 0], [.045, 0], [.048, .007], [.048, .174], [.044, .192],
      [.023, .217], [.017, .225], [.016, .270], [.019, .272], [.019, .276], [.014, .277], [.012, .269]], 14), 'oil', 0, 0, 0, 0, 0, 0, 'turned');
    k.put(turn([[0, 0], [.014, 0], [.0155, .016], [.014, .023], [0, .023]], 10), k.m.oak, 0, .270, 0);
    dryJar(k, .134, 0, .038, .058, .082, 'oatmeal');
  });
  k.at(-9.47, 1.0255, -8.20, .12, () => {
    const lemon = turn([[.044, 0], [.046, .004], [.0425, .019], [.029, .039], [.012, .046], [0, .047]], 14);
    pantryPart(k, lemon, 'pear', -.093, 0, .025, 0, 0, 0, 'turned');
    const half = turn([[0, 0], [.023, 0], [.038, .006], [.046, .018], [.046, .022], [.042, .023], [0, .023]], 14);
    pantryPart(k, half, 'pear', .040, 0, -.017, 0, 0, 0, 'turned');
    const wedges = 8;
    for (let j = 0; j < wedges; j++) {
      const a = j * 2 * Math.PI / wedges, b = a + .67;
      const section = [[.004 * Math.cos(a), .004 * Math.sin(a)], [.038 * Math.cos(a), .038 * Math.sin(a)],
        [.040 * Math.cos((a + b) / 2), .040 * Math.sin((a + b) / 2)], [.038 * Math.cos(b), .038 * Math.sin(b)]];
      k.put(casting(section, .0006), k.m.coral, .040, .0234, -.017, -Math.PI / 2);
    }
  });
  // A working soap pump, in the visual sense only: no interaction beyond the tap.
  k.at(-5.136, .99, -8.666, -.20, () => {
    const rim = (w: number, d: number, y: number) => rectRing(w, d, .019, y, 0, 0, 2);
    pantryPart(k, loft([rim(.135, .132, 0), rim(.149, .146, .004), rim(.155, .152, .015), rim(.145, .142, .017), rim(.132, .129, .007)]), 'celadon');
    pantryPart(k, turn([[0, 0], [.029, 0], [.033, .004], [.036, .086], [.034, .106], [.021, .122], [.017, .124], [.017, .134], [0, .134]], 14), 'oatmeal', .003, .007, 0, 0, 0, 0, 'turned');
    pantryPart(k, formedTube([[0, .137, 0, .013], [0, .150, 0, .012], [0, .150, .020, .006], [0, .148, .044, .006]], 8, 0, [1, 0, 0]), 'nickel', .003, 0, 0, 0, 0, 0, 'face');
  });
  // The two sides of a folded dish cloth follow the nosing and vertical front.
  k.at(-6.28, .990, -7.81, 0, () => {
    const garment = (u: number, v: number, under: boolean): Point => {
      const bend = Math.max(0, Math.min(1, (v - .44) / .12)), a = bend * Math.PI / 2;
      const x = u * .088 + .004 * v, height = v < .44 ? .002 : .002 - .006 * (1 - Math.cos(a)) - .225 * Math.max(0, v - .56);
      const z = v < .44 ? -.006 + .108 * (v - .44) : -.006 + .006 * Math.sin(a) + .010 * Math.max(0, v - .56);
      return [x, height + .002 * Math.cos(5 * u) - (under ? .0012 : 0), z + .006 * Math.cos(9 * u + v) * bend * Math.max(0, v - .56)];
    };
    pantryPart(k, sheet([-1, -.72, -.4, 0, .37, .72, 1], [-1, -.6, 0, .44, .49, .53, .56, .79, 1], garment), 'linen');
  });
}
