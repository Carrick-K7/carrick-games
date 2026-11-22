import * as THREE from 'three';
import { IndexedFittingBuilder, vessel, type XYZ } from './villaFittingGeometry.js';
import { board, casting, loft, rectRing, rectXY, sheet } from './villaFurnitureForms.js';

// One food pigment batch for the fixed contents. Moving food uses the existing
// liner batch: adding another jar does not add another draw at either hinge.
export class PantryBuilder extends IndexedFittingBuilder {
  override geometry(g: THREE.BufferGeometry, mat: THREE.Material, pos?: XYZ, rot?: XYZ) {
    if (mat.vertexColors && !g.hasAttribute('color')) pigment(g, 0xffffff);
    super.geometry(g, mat, pos, rot);
  }
}
function pigment(g: THREE.BufferGeometry, hex: number, mottling = 0) {
  const p = g.getAttribute('position'), rgb = new Float32Array(p.count * 3), c = new THREE.Color(hex);
  for (let i = 0; i < p.count; i++) {
    const n = 1 + mottling * (.55 * Math.sin(p.getX(i) * 111 + p.getY(i) * 60) + .45 * Math.sin(p.getZ(i) * 92 - p.getY(i) * 81));
    rgb[3 * i] = c.r * n; rgb[3 * i + 1] = c.g * n; rgb[3 * i + 2] = c.b * n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); return g;
}
export function coldLiner(b: PantryBuilder, liner: THREE.Material, seal: THREE.Material) {
  // The insulated outer shell partly nests into the solid plaster partition
  // (wall's room face is z=-.310 here). The formed INSIDE of the refrigerator
  // must be in front of that face, including the rear air plenum behind the grille.
  b.geometry(loft([rectRing(.714, .735, .014, .294, 0, 0, 2), rectRing(.714, .735, .014, -.247, 0, 0, 2),
    rectRing(.698, .720, .027, -.265, 0, 0, 2), rectRing(.673, .695, .032, -.284, 0, 0, 2)], false, true), liner, [0, 1.533, 0], [Math.PI / 2, 0, 0]);
  b.box(0, .559, -.284, .710, .971, .013, liner, 0);
  b.box(0, 1.790, -.274, .443, .054, .012, seal, 0);
  const vents = Array.from({ length: 9 }, (_, i) => { const x = (i - 4) * .045; return [[x - .015, -.005], [x + .011, -.005], [x + .015, .005], [x - .011, .005]]; });
  b.geometry(casting(rectXY(.449, .056, .012), .005, vents), liner, [0, 1.790, -.258]);
}
export function glassLedge(b: PantryBuilder, y: number, glass: THREE.Material, liner: THREE.Material) {
  // A thin green edge remains legible even when the shelf face transmits.
  b.geometry(board(.681, .431, .012, .010, .002), glass, [0, y, -.0575]);
  b.geometry(board(.684, .013, .020, .004, .002), liner, [0, y - .004, .157]);
  for (const x of [-.341, .341]) b.box(x, y - .012, -.054, .021, .023, .435, liner, 0);
}
function groceryBottle(b: PantryBuilder, m: THREE.Material, x: number, y: number, z: number, r: number, color: number, height = 1) {
  const form = vessel([[0, .002], [r * .74, .002], [r * .78, 0], [r * .90, 0], [r, .007], [r, .127],
    [r * .92, .145], [r * .51, .165], [r * .43, .174], [r * .43, .192], [0, .192]], 16).scale(1, height, 1);
  b.geometry(pigment(form, color, .04), m, [x, y, z]);
  b.geometry(pigment(vessel([[r * .48, 0], [r * .5, .002], [r * .5, .012], [r * .45, .014], [0, .014]], 16), 0x7f796a), m, [x, y + .188 * height, z]);
  // A cream paper band with a narrow ink rule — no floating logo plane.
  for (const [h, thickness, tint] of [[.056, .047, 0xeee2bf], [.061, .004, color], [.091, .002, 0x8e784f]])
    b.geometry(pigment(vessel([[r + .0006, 0], [r + .0006, thickness * height]], 16), tint), m, [x, y + h * height, z]);
}
function preserves(b: PantryBuilder, m: THREE.Material, x: number, y: number, z: number, r: number, tint: number) {
  b.geometry(pigment(vessel([[0, 0], [r * .86, 0], [r, .006], [r, .060], [r * .90, .069], [r * .87, .077], [0, .077]], 14), tint, .085), m, [x, y, z]);
  b.geometry(pigment(vessel([[r * .91, 0], [r * .98, .0014], [r * .98, .010], [r * .91, .012], [0, .012]], 14), 0xb0a17b), m, [x, y + .073, z]);
  b.geometry(pigment(vessel([[r + .0005, 0], [r + .0005, .024]], 14), 0xe9d9b2), m, [x, y + .023, z]);
}
function eggCarton(b: PantryBuilder, m: THREE.Material) {
  const eggs = [[-.073, -.034], [0, -.034], [.073, -.034], [-.073, .034], [.073, .034]];
  // A moulded pulp floor rises between the six cells; one empty pocket reveals its shape.
  const cx = [-1, -.91, -.71, -.585, -.46, -.29, -.14, 0, .14, .29, .46, .585, .71, .91, 1],
    cz = [-1, -.86, -.64, -.44, -.20, 0, .20, .44, .64, .86, 1];
  const tray = sheet(cx, cz, (u, v, under) => {
    const x = u * .125, z = v * .077, near = Math.hypot(Math.abs(x) < .0365 ? x : Math.abs(x) - .073, Math.abs(z) - .034);
    return [x, under ? 0 : .005 + .022 * Math.min(1.3, (near / .037) ** 2), z];
  });
  b.geometry(pigment(tray, 0xb49f78, .06), m);
  for (const [i, [x, z]] of eggs.entries()) b.geometry(pigment(vessel([[0, 0], [.012, .003], [.020, .009], [.023, .020],
    [.0225, .030], [.017, .044], [.009, .053], [0, .055]], 12), [0xd8ac82, 0xe4c3a0, 0xf1ddba][i % 3], .06), m, [x, .005, z]);
}
function cheese(b: PantryBuilder, m: THREE.Material) {
  b.geometry(pigment(board(.192, .157, .007, .014, .002), 0xe2d8bf), m, [0, .0035, 0]);
  const wedge = [[-.073, -.038], [.029, -.055], [.072, .049], [-.056, .046]];
  b.geometry(pigment(casting(wedge, .051), 0xd6ad67, .075), m, [0, .0325, 0], [-Math.PI / 2, 0, 0]);
  b.geometry(pigment(casting(wedge, .0035), 0xa67c4c), m, [0, .05975, 0], [-Math.PI / 2, 0, 0]);
  b.geometry(pigment(sheet([0, .5, 1], [0, .5, 1], (u, v, under) => [u * .050 - .066, .062 + .003 * Math.sin(v * Math.PI) - (under ? .0006 : 0), -.041 + v * .076]), 0xf1e4c6), m);
}
export function stockColdShelves(b: PantryBuilder, food: THREE.Material) {
  groceryBottle(b, food, -.21, 1.386, -.18, .045, 0x748455);
  groceryBottle(b, food, -.105, 1.386, -.106, .037, 0xc79748, .84);
  groceryBottle(b, food, .027, 1.386, -.185, .043, 0xe6d8b8, 1.07);
  preserves(b, food, .198, 1.386, -.037, .043, 0x995b45);
  b.at(-.119, 1.646, -.048, -.08, () => eggCarton(b, food));
  b.at(.178, 1.646, -.121, .10, () => cheese(b, food));
  const base = 1.1625;
  // A little produce in an actual shallow punnet with a flat bearing bed.
  b.geometry(pigment(loft([rectRing(.326, .169, .013, 0, 0, 0, 1), rectRing(.354, .194, .016, .047, 0, 0, 1),
    rectRing(.347, .187, .015, .048, 0, 0, 1), rectRing(.320, .165, .012, .006, 0, 0, 1)]), 0xc5ab80), food, [.065, base, -.065]);
  for (const [i, x, z] of [[0, -.044, -.074], [1, .049, -.042], [2, .158, -.081]]) {
    const fruit = vessel([[0, .002], [.015, 0], [.032, .007], [.041, .025], [.040, .046], [.030, .061], [.012, .070], [0, .068]], 12).scale(1.11, 1, .94);
    b.geometry(pigment(fruit, [0xb88741, 0xab6650, 0x8c9154][i], .14), food, [x, base + .006, z]);
  }
}
export function wrappedParcel(b: PantryBuilder, food: THREE.Material, x: number, y: number, z: number, style: number) {
  const w = style % 2 ? .20 : .237, d = style % 2 ? .223 : .246, h = .072 + (style % 3) * .008;
  const p = (ww: number, dd: number, yy: number, r: number) => rectRing(ww, dd, r, yy, 0, 0, 1);
  const paper = loft([p(w * .81, d * .87, 0, .012), p(w, d, .017, .025), p(w * .96, d * .98, h * .76, .021), p(w * .76, d * .78, h, .013)]);
  b.geometry(pigment(paper, [0xc1ae8d, 0xacb3a1, 0xe1d3aa][style % 3], .08), food, [x, y, z]);
  b.geometry(pigment(new THREE.PlaneGeometry(w * .74, .025).rotateX(-Math.PI / 2), 0xe6dcbd), food, [x, y + h + .0004, z + .017]);
  b.geometry(pigment(new THREE.PlaneGeometry(.046, .047).rotateX(-Math.PI / 2), 0x9c7157), food, [x - .018, y + h + .0008, z + .020]);
}
export function doorProvisions(b: PantryBuilder, liner: THREE.Material, mid: number, chill: boolean) {
  // The floor tops, not the nominal bracket heights, support the heels.
  if (chill) {
    groceryBottle(b, liner, mid - .181, -.223, -.092, .031, 0x928757, .78);
    preserves(b, liner, mid - .091, -.223, -.095, .032, 0xa26645);
    preserves(b, liner, mid + .168, .107, -.098, .035, 0x8d5946);
    preserves(b, liner, mid + .075, .107, -.094, .031, 0xb09958);
  } else {
    for (const [x, y] of [[mid - .151, -.223], [mid + .132, .107]])
      b.geometry(pigment(board(.118, .074, .059, .012, .004), 0xabb7ae), liner, [x, y + .0295, -.092]);
  }
}
