import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { bent, board, casting, circleXY, loft, oval, rail, rectRing, rectXY, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';

function spanner() {
  // Forked open jaw at the head, pierced box end at the heel.
  const profile = [[-.025, -.226], [-.048, -.206], [-.051, -.176], [-.038, -.151], [-.016, -.129], [-.013, .092], [-.046, .121],
    [-.058, .153], [-.054, .187], [-.033, .205], [-.025, .157], [-.007, .146], [.018, .151], [.028, .168], [.022, .213],
    [.047, .200], [.063, .169], [.057, .134], [.031, .108], [.017, .095], [.018, -.127], [.043, -.154], [.052, -.184], [.044, -.209], [.023, -.226]];
  return casting(profile, .016, [circleXY(0, -.186, .023, 12)]);
}
export function workshop(k: FurnitureKit) {
  const { m, put, box, at } = k;
  // A joiner's bench is a load-bearing frame, not the café table from upstairs.
  for (const x of [-1.77, 1.77]) {
    for (const z of [-.334, .334]) put(loft([rectRing(.101, .112, .014, 0), rectRing(.107, .118, .014, .129), rectRing(.133, .141, .014, .791)]), m.oak, x, 0, z);
    box(x, .19, 0, .107, .115, .774, m.walnut, 0);
  }
  for (const z of [-.318, .318]) box(0, .192, z, 3.72, .115, .081, m.oak, 0);
  put(board(4.30, .911, .123, .035, .016), m.oak, 0, .849, 0);
  for (const z of [-.33, .33]) box(0, .731, z, 3.78, .120, .071, m.walnut, 0);
  k.hit(0, 0, 0, 4.3, .91, .91);
  // An open wall of hanging cleats backed by uprights, with short pegs through
  // the box ends. The underside of each cleat is cut at a hanging bevel.
  for (const x of [-1.94, -.66, .66, 1.94]) box(x, 1.74, -.352, .076, 1.161, .038, m.walnut, 0);
  for (let i = 0; i < 6; i++) put(casting([[-.035, -.058], [.035, -.058], [.035, .047], [.014, .066], [-.035, .066]], 4.14), m.oak, 0, 1.24 + i * .194, -.309, 0, Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const x = -1.79 + i * .385, y = 1.736 + (i % 2) * .053;
    rail(k, [x, y + .159, -.286], [x, y + .159, -.201], .008, m.brass);
    switch (i % 5) {
      case 0: case 1: {
        const s = i % 5 ? .81 : 1.06;
        put(spanner().scale(s, s, 1), m.steel, x, y + .159 - .186 * s, -.217, 0, 0, Math.PI); break;
      }
      case 2: {
        // Combination square: pierced fence with an actual throat, separate rule.
        put(casting([[-.084, -.165], [-.046, -.165], [-.046, -.015], [.122, .106], [.122, .15], [-.084, .15]], .032,
          [[[-.044, .052], [.058, .120], [-.044, .120]]]), m.black, x, y, -.219);
        box(x - .02, y + .117, -.197, .341, .022, .008, m.steel, 0); break;
      }
      case 3:
        put(turn([[0, 0], [.025, .002], [.035, .020], [.037, .068], [.029, .117], [.017, .133], [.022, .148], [0, .148]], 8), m.terra, x, y - .202, -.211);
        put(stock([[0, 0, 0, .011], [0, .201, 0, .009], [0, .224, 0, .006]], 6), m.steel, x, y - .057, -.211);
        break;
      default:
        for (const s of [-1, 1]) {
          bent(k, m.terra, [[x + s * .053, y - .160, -.209, .012], [x + s * .057, y - .106, -.208, .014], [x + s * .033, y - .038, -.208, .013], [x, y + .006, -.210, .011]]);
          put(casting([[0, 0], [s * .021, .014], [s * .034, .096], [s * .028, .142], [s * .012, .136], [s * .012, .077], [-s * .010, .026]], .017), m.steel, x, y, -.21 + .006 * s);
        }
        put(turn([[0, 0], [.014, 0], [.014, .008], [0, .008]], 8), m.brass, x, y + .012, -.197, Math.PI / 2);
    }
  }
  // Independent fixed/moving vise jaws: open mouth, polished jaw inserts,
  // exposed screw housing and a sliding tommy bar with stops at both ends.
  at(-1.30, .91, .124, -.08, () => {
    put(turn([[0, 0], [.155, 0], [.161, .018], [.138, .034], [.104, .038], [.112, .055], [0, .055]], 14), m.terra, 0, 0, 0);
    put(casting([[-.13, .054], [.148, .054], [.138, .099], [.093, .131], [.069, .196], [.078, .240], [-.013, .243], [-.039, .201], [-.064, .153], [-.107, .133]], .202), m.terra, 0, 0, 0, 0, Math.PI / 2);
    put(casting([[-.023, .120], [.075, .120], [.112, .142], [.115, .22], [.096, .245], [.014, .245], [.008, .194], [-.018, .177]], .202), m.terra, 0, 0, .174, 0, -Math.PI / 2);
    box(0, .244, .024, .226, .035, .028, m.steel, 0); box(0, .244, .184, .226, .035, .028, m.steel, 0);
    rail(k, [0, .151, -.022], [0, .151, .285], .027, m.steel);
    bent(k, m.steel, [[-.083, .092, .280, .012], [-.076, .097, .280, .014], [-.065, .104, .280, .007], [.102, .224, .280, .007], [.114, .232, .280, .014], [.121, .237, .280, .012]], 8);
  });
  at(1.18, .91, .032, 0, () => {
    put(loft([rectRing(.46, .274, .038, 0), rectRing(.508, .313, .036, .035), rectRing(.51, .313, .025, .178), rectRing(.529, .328, .026, .188),
      rectRing(.527, .327, .026, .202), rectRing(.486, .283, .019, .203), rectRing(.478, .276, .022, .175), rectRing(.451, .245, .021, .030)]), m.steel, 0, 0, 0);
    for (const x of [-.221, .221]) put(casting([[-.133, .156], [.133, .156], [.060, .31], [.026, .34], [-.026, .34], [-.060, .31]], .025), m.walnut, x, 0, 0, 0, Math.PI / 2);
    rail(k, [-.224, .313, 0], [.224, .313, 0], .020, m.oak);
  });
}

export function stockroom(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const x of [-.833, .833]) for (const z of [-.263, .263]) {
    // Folded angle stock: through-view from either side below the shelves.
    const post = casting([[-.022, -.022], [.023, -.022], [.023, -.014], [-.014, -.014], [-.014, .023], [-.022, .023]], 2.38).rotateX(-Math.PI / 2);
    put(post, m.steel, x, 1.20, z, 0, Math.atan2(x, z));
    box(x, .013, z, .080, .026, .083, m.dark, 0);
  }
  rail(k, [-.814, .219, -.275], [.813, 2.11, -.275], .013, m.steel, 6);
  rail(k, [.814, .219, -.275], [-.813, 2.11, -.275], .013, m.steel, 6);
  for (let j = 0; j < 4; j++) {
    const y = .200 + j * .64;
    put(board(1.70, .590, .048, .019, .014), m.steel, 0, y, 0);
    for (const x of [-.419, .419]) {
      const front: number[][] = [[-.331, .027], [.331, .027], [.355, .318], [.35, .346], [.295, .346], [.247, .202], [.203, .170], [-.203, .170], [-.247, .202], [-.295, .346], [-.350, .346], [-.355, .318]];
      const side = [[-.192, .025], [.188, .025], [.225, .30], [.225, .347], [-.225, .347], [-.225, .310]];
      const material = j % 2 ? m.sage : m.oak;
      put(casting(front, .021), material, x, y, .212);
      put(casting(rectXY(.699, .321, .023, 0, .187), .021, [rectXY(.16, .047, .021, 0, .277)]), material, x, y, -.213);
      for (const sx of [-.339, .339]) put(casting(side, .020), material, x + sx, y, 0, 0, Math.PI / 2);
      box(x, y + .041, 0, .681, .027, .419, material, 0);
      put(board(.146, .039, .006, .006), m.cream, x, y + .103, .225, Math.PI / 2);
    }
  }
  k.hit(0, 0, 0, 1.8, 2.4, .64);
}

export function vacuumModel(k: FurnitureKit, vacuum: THREE.Group, brush: THREE.Group, shell: THREE.Material, trim: THREE.Material, lens: THREE.Material) {
  const body = new VillaModelBuilder(vacuum, 'vacuum/body');
  // Flat front for the flush camera, domed perimeter elsewhere. The dark
  // sensor band is the wall itself, not a lens glued to a circular wall.
  const rim = (r: number, y: number, front: number) => oval(2 * r, 2 * r, y, 28).map(([x, h, z]): Point => [x, h, Math.min(z, front)]);
  body.geometry(loft([rim(.141, .012, .133), rim(.166, .018, .149), rim(.176, .028, .158)]), trim);
  body.geometry(loft([rim(.173, .025, .157), rim(.179, .032, .165), rim(.181, .048, .165), rim(.179, .052, .164)]), lens);
  body.geometry(loft([rim(.179, .048, .164), rim(.181, .056, .166), rim(.179, .065, .163), rim(.171, .076, .153), rim(.157, .081, .139)]), shell);
  body.geometry(casting(rectXY(.073, .018, .006), .005, [circleXY(-.019, 0, .006, 8), circleXY(.019, 0, .005, 8)]), trim, [0, .041, .166]);
  for (const x of [-.119, .119]) body.geometry(turn([[0, -.014], [.027, -.014], [.031, -.009], [.031, .010], [.027, .015], [0, .015]], 12), trim, [x, .031, -.024], [0, 0, Math.PI / 2]);
  body.geometry(casting(rectXY(.117, .048, .013), .006, [rectXY(.098, .027, .008)]), shell, [0, .012, -.054], [-Math.PI / 2, 0, 0]);
  body.geometry(stock([[-.049, .010, -.054, .008], [.049, .010, -.054, .008]], 8), trim);
  body.geometry(board(.066, .019, .003, .009, .001), trim, [0, .082, .099]);
  for (const x of [-.014, .014]) body.geometry(turn([[.004, 0], [.004, .0015], [0, .0015]], 8), shell, [x, .084, .099]);
  body.finish();
  const blades = new VillaModelBuilder(brush, 'vacuum/sweeper');
  for (let i = 0; i < 3; i++) blades.at(0, 0, 0, 2 * Math.PI / 3 * i, () => {
    const blade = casting([[0, 0], [.008, .002], [.018, .043], [.015, .064], [.010, .062], [.012, .045], [.006, .060], [.002, .059], [.005, .038]], .004);
    blades.geometry(blade, trim, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  });
  blades.finish();
  k.at(4.45, 0, -7.36, Math.PI, () => {
    // The ramp rises into an actual wash bay. Leave the center unobstructed
    // under the control head so the robot could enter between both cheeks.
    for (const x of [-.192, .192]) k.put(board(.043, .320, .476, .018, .007), shell, x, .243, 0);
    k.box(0, .235, -.147, .363, .455, .022, trim, 0);
    k.put(loft([rectRing(.412, .302, .034, .163), rectRing(.424, .316, .032, .183), rectRing(.429, .320, .026, .443), rectRing(.417, .305, .039, .486), rectRing(.395, .29, .041, .492)]), shell, 0, 0, 0);
    k.put(board(.269, .057, .007, .017), lens, 0, .348, .161, Math.PI / 2);
    k.put(casting([[-.134, .002], [.556, .002], [.556, .008], [.363, .029], [.059, .031], [-.134, .025]], .408), trim, 0, 0, 0, 0, -Math.PI / 2);
    for (const x of [-.094, .094]) k.put(turn([[.021, 0], [.022, .006], [0, .007]], 8), shell, x, .028, .129);
  });
}
