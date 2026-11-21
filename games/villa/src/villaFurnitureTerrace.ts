import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { bent, board, casting, loft, rail, rectRing, sheet, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { pillowForm } from './villaFurnitureTextiles.js';

export function grillCart(k: FurnitureKit) {
  const { m, put } = k;
  // Two trolley wheels and a pair of fixed ferruled feet. The side shelves
  // hinge on steel brackets, so both the front and back of the cart read.
  for (const x of [-.650, .650]) {
    for (const z of [-.277, .277]) {
      bent(k, m.black, [[x, x < 0 ? .108 : .016, z * 1.14, .028], [x, .176, z * 1.09, .029], [x * .92, .505, z, .031], [x * .91, .723, z, .029]], 8);
      if (x < 0) {
        put(turn([[0, -.034], [.066, -.034], [.093, -.027], [.101, -.012], [.101, .013], [.094, .028], [.067, .033], [.048, .022], [.021, .022], [0, .028]], 14), m.dark, x, .102, z * 1.14, 0, 0, Math.PI / 2);
        put(turn([[0, 0], [.026, 0], [.023, .008], [0, .009]], 8), m.steel, x - .033, .102, z * 1.14, 0, 0, Math.PI / 2);
      }
      rail(k, [x * .93, .615, z], [x * 1.84, .833, z], .015, m.steel);
    }
    for (let i = 0; i < 4; i++) put(board(.485, .162, .043, .023, .008), m.oak, Math.sign(x) * 1.056, .861, -.274 + i * .183);
  }
  for (const z of [-.262, .262]) rail(k, [-.641, .223, z], [.641, .223, z], .021, m.black);
  for (let i = 0; i < 6; i++) rail(k, [-.617 + i * .247, .224, -.263], [-.617 + i * .247, .224, .263], .014, m.steel);
  // Drawn firebox turns back below the grates. The porcelain floor and tented
  // burner covers are visible between bars when the independent lid is raised.
  put(loft([rectRing(.89, .333, .111, .458), rectRing(1.06, .453, .141, .471), rectRing(1.31, .658, .126, .568),
    rectRing(1.48, .787, .075, .752), rectRing(1.497, .803, .069, .864), rectRing(1.547, .844, .070, .876), rectRing(1.55, .847, .072, .902),
    rectRing(1.456, .746, .055, .905), rectRing(1.432, .722, .052, .875), rectRing(1.402, .695, .065, .766),
    rectRing(1.239, .553, .091, .614), rectRing(.974, .341, .117, .526)]), m.black, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const cover = casting([[-.070, .004], [0, .067], [.070, .004], [.067, 0], [0, .056], [-.067, 0]], .513);
    put(cover, m.dark, -.498 + i * .332, .655, 0);
  }
  for (const z of [-.315, .315]) rail(k, [-.706, .889, z], [.706, .889, z], .011, m.steel);
  for (let i = 0; i < 13; i++) rail(k, [-.660 + i * .110, .909, -.352], [-.660 + i * .110, .909, .352], .009, m.steel, 7);
  for (const x of [-.401, 0, .401]) {
    put(turn([[0, 0], [.059, 0], [.063, .009], [.048, .015], [.044, .036], [.038, .044], [0, .044]], 14), m.steel, x, .786, .389, Math.PI / 2);
    k.box(x, .805, .434, .005, .024, .004, m.black, 0);
  }
  for (const x of [-.48, .48]) rail(k, [x - .064, .923, -.410], [x + .064, .923, -.410], .024, m.steel);
  k.hit(0, 0, 0, 2.62, 1.27, .93);
}
export function grillHood(builder: VillaModelBuilder, k: FurnitureKit) {
  const { m } = k;
  // Stamp one hollow crown. Start on the interior roof, curl out around the
  // mouth and finish on the exterior roof; no plate seals its open underside.
  const rings = [rectRing(1.18, .127, .056, .195, 0, .347), rectRing(1.334, .387, .095, .162, 0, .370),
    rectRing(1.446, .659, .069, .084, 0, .40), rectRing(1.481, .764, .052, .022, 0, .41),
    rectRing(1.486, .770, .052, .002, 0, .412), rectRing(1.55, .822, .062, -.003, 0, .416),
    rectRing(1.558, .828, .068, .018, 0, .416), rectRing(1.504, .747, .087, .076, 0, .396),
    rectRing(1.438, .593, .106, .144, 0, .380), rectRing(1.314, .346, .101, .201, 0, .35), rectRing(1.167, .124, .058, .219, 0, .342)];
  builder.geometry(loft(rings), m.steel);
  const handle = stock([[-.316, .073, .733, .015], [-.316, .103, .783, .016], [-.292, .122, .799, .017], [.292, .122, .799, .017], [.316, .103, .783, .016], [.316, .073, .733, .015]], 9);
  builder.geometry(handle, m.black);
  builder.geometry(turn([[0, 0], [.041, 0], [.042, .005], [.036, .012], [.032, .013], [0, .013]], 14), m.black, [0, .186, .508], [.42, 0, 0]);
  const needle = new THREE.BoxGeometry(.032, .002, .003);
  builder.geometry(needle, m.steel, [-.004, .199, .514], [.42, -.53, 0]);
  for (const x of [-.60, .60]) builder.geometry(stock([[x - .035, .007, .013, .022], [x + .035, .007, .013, .022]], 10, .005), m.steel);
}

export function patioTable(k: FurnitureKit) {
  const { m, put } = k;
  const pedestal = turn([[0, .008], [.402, .008], [.412, 0], [.445, 0], [.461, .022], [.471, .043], [.447, .064], [.267, .084], [.176, .138], [.109, .204], [.067, .314], [.049, .56], [.058, .637], [.123, .694], [.235, .721], [0, .726]], 24);
  put(pedestal, m.black, 0, 0, 0);
  // Teak boards with actual drainage gaps, their ends trimmed to a circle.
  const r = .877, spacing = .144;
  for (let i = -6; i <= 6; i++) {
    const z0 = Math.max(-r, (i - .5) * spacing + .0035), z1 = Math.min(r, (i + .5) * spacing - .0035);
    const end = (z: number) => Math.sqrt(Math.max(.0001, r * r - z * z));
    const zs = [z0, .667 * z0 + .333 * z1, .333 * z0 + .667 * z1, z1];
    put(casting([...zs.map(z => [end(z), z]), ...zs.slice().reverse().map(z => [-end(z), z])], .077), m.oak, 0, .782, 0, -Math.PI / 2);
  }
  for (const x of [-.26, .26]) k.box(x, .724, 0, .057, .054, 1.415, m.walnut, 0);
}

export function poolLounger(k: FurnitureKit) {
  const { m, put } = k;
  // Continuous steamed runners rise from the calf support to the headstay.
  const side = [[-1.157, .335], [-1.103, .373], [-.910, .381], [-.463, .421], [-.25, .415], [.307, .345], [.487, .366], [.588, .411], [1.064, .846], [1.173, .885], [1.202, .84], [1.138, .762], [.634, .321], [.469, .271], [.361, .263], [-.250, .329], [-.464, .338], [-.905, .30], [-1.116, .292]];
  for (const sx of [-1, 1]) {
    put(casting(side, .061), m.oak, sx * .425, 0, 0, 0, -Math.PI / 2);
    bent(k, m.walnut, [[sx * .419, .306, -.927, .031], [sx * .419, .147, -.881, .030], [sx * .419, .033, -.789, .031], [sx * .419, .029, -.688, .030], [sx * .419, .276, -.492, .028]]);
    bent(k, m.walnut, [[sx * .419, .297, .472, .030], [sx * .419, .028, .814, .032], [sx * .419, .031, .93, .030], [sx * .419, .74, 1.106, .031]]);
  }
  for (const [z, y] of [[-1.066, .352], [-.41, .39], [.455, .324], [1.104, .848]]) rail(k, [-.421, y, z], [.421, y, z], .018, m.walnut);
  const sections = [[-1.112, .382], [-1.077, .398], [-.90, .410], [-.465, .446], [-.30, .45], [.18, .394], [.384, .388], [.507, .411], [.602, .472], [.851, .688], [1.061, .874], [1.138, .901]];
  put(sheet([-1, -.95, -.68, 0, .68, .95, 1], sections.map((_, i) => i), (u, i, under) => {
    const [z, y] = sections[i], slack = (.028 + .014 * Math.cos(z * 3)) * (1 - u * u);
    return [u * .417, y - slack - (under ? .015 : 0), z];
  }), m.linen, 0, 0, 0);
  put(pillowForm(.632, .270, .145), m.sage, 0, .848, 1.006, -.673);
}

export function parasol(k: FurnitureKit) {
  const { m, put } = k;
  put(turn([[0, .012], [.374, .012], [.389, .004], [.453, .004], [.480, .027], [.476, .055], [.419, .111], [.288, .131], [.13, .137], [0, .137]], 18), m.stone, 0, 0, 0);
  put(turn([[.067, .126], [.071, .146], [.063, .166], [.050, .175], [.046, .278], [.040, .294]], 12), m.brass, 0, 0, 0);
  put(turn([[.036, .153], [.036, 2.235], [.045, 2.257], [.048, 2.300], [.035, 2.317], [.033, 2.856], [.051, 2.884], [.048, 2.919], [.019, 2.943], [0, 2.945]], 12), m.walnut, 0, 0, 0);
  const n = 10, panel = (r: number, y: number, hem: number) => Array.from({ length: n * 3 }, (_, i): Point => {
    const a = -2 * Math.PI * i / (n * 3), f = i % 3 ? .972 : 1, scallop = i % 3 ? hem : 0;
    return [Math.cos(a) * r * f, y - scallop, Math.sin(a) * r * f];
  });
  put(loft([panel(.037, 2.875, 0), panel(.477, 2.785, .022), panel(1.07, 2.592, .037), panel(1.628, 2.365, .031),
    panel(1.638, 2.293, .076), panel(1.651, 2.296, .076), panel(1.65, 2.373, .031), panel(1.082, 2.607, .037), panel(.482, 2.800, .022), panel(.041, 2.895, 0)]), m.linen, 0, 0, 0);
  for (let i = 0; i < n; i++) k.at(0, 0, 0, i * 2 * Math.PI / n, () => {
    bent(k, m.oak, [[0, 2.863, .033, .012], [0, 2.77, .47, .012], [0, 2.58, 1.07, .012], [0, 2.353, 1.622, .009]], 6);
    rail(k, [0, 2.279, .040], [0, 2.65, .838], .010, m.brass, 6);
  });
}
