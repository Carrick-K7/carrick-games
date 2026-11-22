import { bent, casting, sheet, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { pantryGlass, pantryPart } from './villaPantryFinish.js';
import { coupe } from './villaKilnTable.js';

export function breakfastSetting(k: FurnitureKit) {
  const { m, put } = k, top = .0032;
  // Flat-folded linen mat; the short ends actually turn under rather than being
  // thick table boards. Glass is on the wood, outside its folded edge.
  const mat = sheet([-1, -.975, -.65, 0, .64, .975, 1], [-1, -.957, 0, .955, 1], (u, v, under) => {
    const edge = Math.abs(u) === 1 || Math.abs(v) === 1, xx = .266 * u + .0017 * Math.sin(v * 5) * u;
    return [xx, under ? 0 : edge ? .0019 : top, .181 * v + .027];
  });
  pantryPart(k, mat, 'linen');
  for (const x of [-.240, -.231]) {
    const ribbon = sheet([-1, 1], [-1, .02, 1], (u, v) => [x + u * .0018, top + .00025, v * .174 + .027], true);
    pantryPart(k, ribbon, 'indigo');
  }
  coupe(k, -.006, top, .024, .138, .021, 'oatmeal', 16);
  // A napkin's lower leaf lies in the flat well, with a free upper corner.
  // r<=72 mm all the way around, so its underside doesn't slice the sloping rim.
  const support = top + .021 * .413;
  k.at(-.006, support, .024, -.16, () => {
    const cloth = sheet([-1, -.91, 0, .86, 1], [-1, -.85, 0, .80, 1], (u, v, under) => {
      const fold = .0049 * Math.max(0, (v + .75) / 1.75) + .0013 * Math.sin(v * 2.8 + .4) * (1 - u * u);
      return [u * .039 + .003 * v, under ? .00015 : .0035 + fold, .056 * v];
    });
    pantryPart(k, cloth, 'indigo');
    const returnFold = sheet([-1, -.86, 0, .86, 1], [-1, -.88, 0, 1], (u, v, under) => [u * .037 + .003, .0093 + .0015 * (1 - u * u) + (under ? -.001 : 0), v * .037 - .011 + u * .002]);
    pantryPart(k, returnFold, 'indigo');
  });
  // Four tines in a forged head, with a palm-sized, rounded handle. Spoon is
  // stamped from sheet — no arbitrary round toe under the bowl.
  const fork = [[-.006, -.098], [.007, -.098], [.006, .016], [.014, .037], [.014, .093], [.010, .093], [.0089, .056], [.0064, .056], [.0054, .095],
    [.0025, .095], [.001, .055], [-.0014, .055], [-.003, .095], [-.0058, .095], [-.0068, .056], [-.0092, .056], [-.0105, .093], [-.014, .093], [-.014, .037], [-.0056, .016]];
  pantryPart(k, casting(fork, .003), 'nickel', -.188, top + .0015, .039, -Math.PI / 2);
  const spoon = turn([[0, 0], [.010, .0008], [.018, .003], [.024, .008], [.0235, .010], [.018, .0055], [.010, .0035], [0, .003]], 12).scale(.86, 1, 1.37);
  pantryPart(k, spoon, 'nickel', .177, top, -.038);
  bent(k, m.steel, [[.177, top + .008, -.014, .0031], [.177, top + .009, .011, .004], [.177, top + .007, .100, .004],
    [.177, top + .0053, .137, .0053], [.177, top + .0048, .146, .0048]], 6);
  const tumble = turn([[0, .002], [.023, .002], [.025, 0], [.033, 0], [.035, .006], [.040, .097],
    [.0392, .099], [.037, .0994], [.0325, .015], [.029, .011], [0, .011]], 14);
  put(tumble, pantryGlass(k), .188, 0, -.200);
}

export function orchardBowl(k: FurnitureKit, x: number, y: number) {
  // Flatten the central food-contact bed; fruit feet really bear on its glaze.
  const bowl = turn([[0, .003], [.075, .003], [.080, 0], [.091, 0], [.095, .010], [.159, .016], [.192, .025], [.216, .045],
    [.230, .066], [.232, .075], [.229, .080], [.222, .081], [.218, .077], [.210, .059], [.189, .037], [.167, .022], [.152, .020], [0, .020]], 22);
  pantryPart(k, bowl, 'celadon', x, y, 0, 0, 0, 0, 'turned');
  for (const [i, dx, dz] of [[0, -.066, -.059], [1, .060, .059], [2, .074, -.066], [3, -.062, .073]]) {
    const r = i === 1 ? .064 : .059, pear = turn([[0, .0018], [r * .24, 0], [r * .54, .004], [r * .85, .018], [r, .039], [r * .97, .063],
      [r * .75, .081], [r * .53, .101], [r * .37, .125], [r * .23, .132], [0, .128]], 12);
    const a = pear.getAttribute('position');
    for (let j = 0; j < a.count; j++) { const bend = (a.getY(j) / .132) ** 2; a.setX(j, a.getX(j) + (i % 2 ? .012 : -.010) * bend); }
    pear.computeVertexNormals();
    pantryPart(k, pear, i === 1 || i === 3 ? 'pear' : 'russet', x + dx, y + .020, dz, 0, 0, 0, 'turned', i);
    const sx = x + dx + (i % 2 ? .012 : -.010);
    bent(k, k.m.walnut, [[sx, y + .149, dz, .0026], [sx + .003, y + .162, dz + .001, .003], [sx + .006, y + .168, dz, .002]], 5);
  }
}
