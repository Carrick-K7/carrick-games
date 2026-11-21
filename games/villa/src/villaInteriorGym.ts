import { bent, board, casting, circleXY, loft, rail, rectRing, rectXY, stock, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { seatPad } from './villaFurnitureTextiles.js';

function weightPlate(radius: number, thickness: number) {
  const outer = circleXY(0, 0, radius, 20), holes = [circleXY(0, 0, .020, 10)];
  // Through-grips leave three spokes in each plate, not markings on a disk.
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, p: number[][] = [];
    for (const [j, r] of [[-.63, .68], [-.66, .60], [-.58, .52], [-.38, .50], [0, .51], [.38, .50], [.58, .52], [.66, .60], [.63, .68], [.44, .76], [0, .78], [-.44, .76]])
      p.push([Math.cos(a + j) * radius * r, Math.sin(a + j) * radius * r]);
    holes.push(p);
  }
  return casting(outer, thickness, holes);
}
function dumbbell(k: FurnitureKit, r: number, span: number) {
  const { put, m } = k;
  put(turn([[0, -span], [.021, -span], [.021, -span * .54], [.014, -span * .39], [.017, 0], [.014, span * .39], [.021, span * .54], [.021, span], [0, span]], 10), m.steel, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) put(turn([[0, -.038], [r * .72, -.038], [r, -.024], [r, .024], [r * .74, .038], [r * .37, .038], [r * .30, .032], [0, .032]], 6), m.black, 0, 0, s * span, Math.PI / 2);
}
export function gymEquipment(k: FurnitureKit) {
  const { m, put, at, box, hit } = k;
  at(-4.2, 0, -3.3, 0, () => {
    for (const x of [-1.00, 0, 1.00]) {
      put(board(.205, .314, .046, .031), m.black, x, .024, 0);
      bent(k, m.steel, [[x, .041, -.06, .033], [x, .966, -.06, .033], [x, 1.009, -.046, .028]]);
      for (const [y, r] of [[.265, .186], [.736, .14]]) {
        rail(k, [x, y, -.075], [x, y + .018, .158], .016, m.steel);
        for (let i = 0; i < 2; i++) put(weightPlate(r * (1 - i * .08), .045), m.black, x, y + .009 + i * .004, .019 + .05 * i, -.068);
      }
    }
    rail(k, [-1.01, .146, -.067], [1.01, .146, -.067], .024, m.dark);
    hit(0, 0, 0, 2.7, 1.1, .30);
  });
  // Open cable crossover: a compact stack on guide rods, a running cable
  // around a grooved pulley and a suspended stirrup handle on each side.
  at(1.2, 0, -4.05, 0, () => {
    for (const s of [-1, 1]) {
      const x = s * .85;
      put(board(.46, .623, .071, .062), m.dark, x, .041, -.015);
      for (const dx of [-.187, .187]) bent(k, m.steel, [[x + dx, .071, -.211, .026], [x + dx, 2.066, -.211, .026], [x + dx, 2.138, -.194, .028], [x + dx, 2.187, -.129, .026], [x + dx, 2.187, .126, .025]]);
      for (const dx of [-.102, .102]) rail(k, [x + dx, .09, -.04], [x + dx, 2.14, -.04], .012, m.steel);
      for (let i = 0; i < 8; i++) put(board(.307, .249, .047, .026, .009), m.dark, x, .129 + i * .054, -.035);
      const py = 2.096;
      put(turn([[0, -.03], [.064, -.03], [.073, -.024], [.071, -.012], [.061, -.007], [.061, .007], [.071, .012], [.073, .024], [.064, .03], [0, .03]], 16), m.black, x, py, .142, 0, 0, Math.PI / 2);
      const cable: [number, number, number, number][] = [[x, .531, -.035, .005], [x, 1.96, .069, .005], [x, py, .079, .005], [x, py + .045, .097, .005], [x, py + .060, .144, .005], [x, py + .042, .183, .005], [x, py, .207, .005], [x, 1.112, .29, .005]];
      bent(k, m.steel, cable, 6);
      bent(k, m.black, [[x, 1.102, .292, .010], [x - .035, 1.082, .299, .009], [x - .100, .986, .314, .009], [x - .092, .963, .319, .011], [x + .092, .963, .319, .011], [x + .100, .986, .314, .009], [x + .035, 1.082, .299, .009], [x, 1.102, .292, .010]], 7);
    }
    bent(k, m.dark, [[-.986, 2.162, .13, .033], [-.76, 2.196, .13, .034], [-.57, 2.253, .14, .03], [.57, 2.253, .14, .03], [.76, 2.196, .13, .034], [.986, 2.162, .13, .033]]);
    hit(0, 0, 0, 2.25, 2.3, .7);
  });
  at(-2.6, 0, -1.15, 0, () => {
    for (const sx of [-.69, .69]) {
      const side = [[-.256, .014], [-.181, .014], [-.032, .533], [.145, .014], [.239, .014], [.029, .856], [-.061, .856]];
      put(casting(side, .047), m.steel, sx, 0, 0, 0, Math.PI / 2);
    }
    for (const y of [.28, .677]) {
      for (const z of [-.135, .135]) put(casting([[-.022, -.023], [.022, -.023], [.022, .023], [.012, .023], [.012, -.008], [-.022, -.008]], 1.43), m.dark, 0, y, z, 0, Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const r = (y < .5 ? .070 : .052) + i * .006;
        at((i - 1) * .46, y + .020 + r * .87, 0, 0, () => dumbbell(k, r, .124));
      }
    }
    hit(0, 0, 0, 1.6, .95, .6);
  });
  for (let i = 0; i < 4; i++) at(-.40 + i * .34, 0, -1.15, 0, () => {
    const r = .090 + i * .011;
    put(turn([[0, 0], [r * .70, 0], [r * .86, r * .16], [r, r * .64], [r * .96, r * 1.13], [r * .71, r * 1.58], [r * .46, r * 1.72], [0, r * 1.72]], 14), m.black, 0, 0, 0);
    const handle = stock([[-.57, 1.47, 0, .21], [-.76, 1.87, 0, .165], [-.84, 2.38, 0, .14], [-.70, 2.66, 0, .14], [-.43, 2.81, 0, .14], [.43, 2.81, 0, .14], [.70, 2.66, 0, .14], [.84, 2.38, 0, .14], [.76, 1.87, 0, .165], [.57, 1.47, 0, .21]], 8);
    put(handle.scale(r, r, r), m.dark, 0, 0, 0);
  });
  at(2.7, 0, -2.4, 0, () => {
    // A continuous belt loops round the rollers. Deeper motor cowling in the
    // nose, toe rails to either side and a tilted display facing the runner.
    const chassis = [[-.832, .055], [.818, .041], [.884, .067], [.907, .134], [.882, .191], [.795, .202], [-.549, .235], [-.675, .303], [-.831, .30], [-.898, .234], [-.898, .113]];
    put(casting(chassis, .587), m.dark, 0, 0, 0, 0, -Math.PI / 2);
    const belt = [[-.697, .155], [-.733, .18], [-.734, .215], [-.698, .239], [.796, .211], [.853, .191], [.861, .159], [.846, .138], [.80, .124]];
    put(casting(belt, .465), m.black, 0, 0, 0, 0, -Math.PI / 2);
    for (const s of [-1, 1]) {
      bent(k, m.steel, [[s * .269, .19, -.655, .031], [s * .269, .389, -.672, .028], [s * .267, .918, -.766, .027], [s * .267, 1.056, -.750, .026], [s * .267, 1.087, -.706, .026], [s * .267, 1.073, -.325, .024], [s * .267, 1.030, -.153, .020]]);
      bent(k, m.dark, [[s * .264, .207, .808, .014], [s * .264, .244, -.529, .014]], 7);
    }
    const console = loft([rectRing(.46, .194, .034, -.046), rectRing(.578, .257, .036, .008), rectRing(.555, .246, .038, .036), rectRing(.453, .164, .026, .036), rectRing(.433, .15, .026, .018)]);
    put(console, m.dark, 0, 1.105, -.794, .92);
    put(board(.43, .147, .005, .025, .002), m.blue, 0, 1.117, -.777, .92);
    hit(0, 0, 0, .7, 1.3, 1.9);
  });
  for (let i = 0; i < 3; i++) {
    const spiral: number[][] = [[-.846, .008], [.671, .008]], inside: number[][] = [];
    for (let j = 0; j <= 30; j++) {
      const a = -Math.PI / 2 + j / 30 * Math.PI * 3.7, r = .080 - j / 30 * .043;
      spiral.push([.671 + r * Math.cos(a), .088 + r * Math.sin(a)]);
      inside.unshift([.671 + (r - .008) * Math.cos(a), .088 + (r - .008) * Math.sin(a)]);
    }
    put(casting([...spiral, ...inside, [-.846, .016]], .611), i % 2 ? m.sage : m.terra, -1.9 + i * 1.35, -.006, .9, 0, -Math.PI / 2);
  }
  at(-3.6, 0, 1.4, 0, () => {
    for (const z of [-.642, .642]) {
      put(board(.472, .137, .061, .031), m.dark, 0, .031, z);
      bent(k, m.steel, [[0, .063, z, .045], [0, .235, z * .90, .040], [0, .393, z * .83, .036]], 8);
    }
    box(0, .393, 0, .084, .073, 1.57, m.dark, 0);
    put(seatPad(.382, .51, .135, .08), m.sage, 0, .478, -.585);
    put(seatPad(.350, 1.134, .138, .06), m.sage, 0, .493, .272, -.024);
    hit(0, 0, 0, .50, .60, 1.9);
  });
  put(casting(rectXY(2.4, 1.9, .062), .043, [rectXY(2.347, 1.847, .047)]), m.dark, 4.2, 1.45, -4.565);
  put(casting(rectXY(2.357, 1.857, .050), .016), m.steel, 4.2, 1.45, -4.560);
}
