import * as THREE from 'three';
import { bent, board, casting, circleXY, loft, rectRing, rectXY, sheet, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { boundBook } from './villaFurnitureJoinery.js';
import { curtain, pillowForm, seatPad, sofaBody } from './villaFurnitureTextiles.js';

type Driver = [x: number, y: number, radius: number];
/** Real drive units seat into a pierced baffle. Surround rolls, dished cones and
 * convex dust caps sit at different depths; the taper continues around the back. */
export function loudspeaker(k: FurnitureKit, w: number, h: number, d: number, drivers: Driver[], port?: Driver) {
  const { put, m } = k, f = d / 2;
  put(loft([rectRing(w * .74, h * .91, w * .13, -f), rectRing(w * .81, h * .947, w * .15, -f * .91),
    rectRing(w * .97, h * .98, w * .13, -f * .15), rectRing(w, h, w * .097, f * .86), rectRing(w * .962, h * .987, w * .089, f)], true, false).rotateX(Math.PI / 2), m.dark, 0, h / 2, 0);
  const holes = [...drivers.map(([x, y, r]) => circleXY(x, y, r * .949, 20)), ...(port ? [circleXY(port[0], port[1], port[2], 20)] : [])];
  put(casting(rectXY(w * .962, h * .987, w * .089, 0, h / 2), .019, holes), m.black, 0, 0, f - .010);
  for (const [x, y, r] of drivers) {
    const cone = turn([[r * .94, -.012], [r, -.001], [r, .008], [r * .94, .013], [r * .86, .010], [r * .82, .017],
      [r * .74, .018], [r * .65, .002], [r * .32, -r * .29], [r * .26, -r * .31], [r * .18, -r * .18], [0, -r * .137]], 20);
    put(cone, m.dark, x, y, f, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = (i + .5) * Math.PI / 2; put(turn([[r * .035, 0], [r * .035, .003], [0, .003]], 6), m.steel, x + r * .944 * Math.cos(a), y + r * .944 * Math.sin(a), f + .010, Math.PI / 2); }
  }
  if (port) {
    const [x, y, r] = port;
    put(turn([[r * .89, -.02], [r, -.002], [r * 1.06, .004], [r, .012], [r * .83, .006], [r * .71, -.023], [r * .70, -d * .43], [0, -d * .43]], 16), m.dark, x, y, f, Math.PI / 2);
  }
  for (const x of [-w * .147, w * .147]) put(turn([[0, 0], [.014, 0], [.014, .016], [.009, .020], [0, .020]], 8), m.brass, x, .14 * h, -f, -Math.PI / 2);
}

function avDeck(k: FurnitureKit, glow: THREE.Material, receiver: boolean) {
  const { m, put, box } = k, w = .91, h = receiver ? .184 : .116, d = .369;
  for (const x of [-.312, .312]) for (const z of [-.128, .128]) put(turn([[0, 0], [.027, 0], [.027, .018], [0, .018]], 8), m.dark, x, 0, z);
  const apertures = Array.from({ length: receiver ? 8 : 4 }, (_, i) => rectXY(.021, d * .55, .007, (i - (receiver ? 3.5 : 1.5)) * .048, -.015));
  put(casting(rectXY(w - .017, d - .020, .012), .012, apertures), m.black, 0, h + .013, 0, -Math.PI / 2);
  for (const x of [-w / 2, w / 2]) box(x, h / 2 + .017, 0, .018, h, d, m.black, 0);
  box(0, h / 2 + .017, -d / 2, w, h, .018, m.dark, 0); box(0, .020, 0, w, .013, d, m.dark, 0);
  const hole = rectXY(receiver ? .34 : .457, receiver ? .063 : .025, .009, receiver ? -.012 : -.090, 0);
  put(casting(rectXY(w, h, .018), .022, [hole]), m.black, 0, h / 2 + .019, d / 2);
  put(casting(hole, .003), receiver ? glow : m.dark, 0, h / 2 + .019, d / 2 - .010);
  if (receiver) for (const x of [-.33, .33]) put(turn([[0, 0], [.044, 0], [.044, .022], [.039, .029], [0, .029]], 12), m.steel, x, h / 2 + .018, d / 2 + .008, Math.PI / 2);
}

export function cinemaEquipment(k: FurnitureKit, acoustic: THREE.Material, glow: THREE.Material) {
  const { m, put, box, hit, at } = k;
  put(curtain(9.30, 2.95, 32), acoustic, 0, 1.55, -4.36);
  // Taut fabric with a subtle bow across the span; a velvet surround, not
  // a white cuboid. The rack is now in front of, not embedded in, the screen.
  const perimeter = rectXY(5.57, 2.264, .052);
  put(casting(perimeter, .082, [rectXY(5.22, 2.080, .027)]), m.dark, 0, 1.948, -4.108);
  const screen = sheet([-1, -.70, -.36, 0, .36, .70, 1], [-1, -.52, 0, .52, 1], (u, v, under) =>
    [u * 2.633, (1 - u * u) * (1 - v * v) * .019 + (under ? -.012 : -.005), v * 1.057]);
  put(screen, m.white, 0, 1.948, -4.108, Math.PI / 2);
  at(0, 0, -3.86, 0, () => {
    for (const x of [-1.44, 1.44]) for (const z of [-.18, .18]) put(turn([[0, 0], [.035, 0], [.043, .071], [0, .071]], 9), m.black, x, 0, z);
    for (const x of [-1.571, -.514, .467, 1.571]) box(x, .379, 0, .040, .643, .510, m.walnut, 0);
    for (const y of [.088, .374, .718]) put(board(3.216, .555, .043, .035, .015), y > .7 ? m.dark : m.walnut, 0, y, 0);
    // Ventilated back; cables have somewhere to leave the console.
    for (let i = 0; i < 6; i++) box(0, .151 + i * .099, -.238, 3.14, .047, .027, m.oak, 0);
    at(0, .740, 0, 0, () => loudspeaker(k, 1.286, .224, .306, [[-.396, .111, .082], [0, .115, .047], [.396, .111, .082]]));
    at(-1.041, .396, .039, 0, () => avDeck(k, glow, true)); at(-1.04, .111, .039, 0, () => avDeck(k, glow, false));
    for (let i = 0; i < 8; i++) boundBook(k, .63 + i * .070, .397, .022, .043, .268, .286, [m.walnut, m.sage, m.terra][i % 3], false, i === 7 ? -.12 : 0);
    hit(0, 0, -.14, 3.3, 1.1, .75);
  });
  for (const side of [-1, 1]) {
    at(side * 3.5, 0, -3.95, 0, () => {
      put(board(.448, .417, .051, .052), m.steel, 0, .029, 0);
      at(0, .055, 0, 0, () => loudspeaker(k, .423, 1.063, .385, [[0, .359, .125], [0, .644, .107], [0, .895, .060]], [0, .105, .043]));
      hit(0, 0, 0, .50, 1.15, .46);
    });
    at(side * 5.39, 1.81, -.60, side > 0 ? -1.12 : 1.12, () => loudspeaker(k, .246, .393, .250, [[0, .147, .076], [0, .298, .036]]));
    for (const z of (side < 0 ? [-3.2, -1.4, .4, 2.2] : [-3.5, 3.2])) {
      at(side * 5.38, 1.50, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
        // Quadratic diffusers alternate well depth without filling the slots.
        box(0, 0, -.025, .844, 1.48, .035, acoustic, 0);
        for (let i = 0; i < 9; i++) {
          const d = .025 + ((i * i) % 7) * .011;
          put(board(.078, 1.441, d, .023, .005), i % 3 ? acoustic : m.walnut, (i - 4) * .091, 0, -.008 + d / 2, Math.PI / 2);
        }
      });
    }
  }
  at(4.6, 0, -2.2, 0, () => {
    loudspeaker(k, .52, .613, .494, [[0, .352, .165]], [0, .115, .055]);
    put(turn([[0, 0], [.009, 0], [.009, .006], [0, .006]], 8), glow, .178, .535, .246, Math.PI / 2);
    hit(0, 0, 0, .56, .62, .54);
  });
}
export function recliner(k: FurnitureKit, leather: THREE.Material) {
  const { m, put } = k;
  put(turn([[0, .02], [.368, .02], [.392, .039], [.370, .062], [.173, .081], [.102, .112], [.098, .213], [0, .213]], 16), m.black, 0, 0, 0);
  for (const x of [-.314, .314]) bent(k, m.steel, [[x, .213, -.16, .023], [x, .295, -.26, .023], [x, .366, -.419, .020]]);
  put(board(.938, .827, .158, .094), m.dark, 0, .319, -.004);
  put(seatPad(.772, .288, .121, .035), leather, 0, .305, -.454, -1.315);
  put(sofaBody(1.28, true).scale(1, .897, .843), leather, 0, 0, 0);
  put(seatPad(.872, .825, .178, .22), leather, 0, .482, -.058);
  put(seatPad(.899, .69, .238), leather, 0, .834, .328, -1.32);
  put(pillowForm(.74, .295, .197), leather, 0, 1.204, .403, -1.32);
}
