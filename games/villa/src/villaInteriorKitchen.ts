import * as THREE from 'three';
import { bent, board, casting, circleXY, fieldFrame, loft, rail, rectRing, rectXY, stock, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { cabinet, pull, vessel } from './villaFurnitureJoinery.js';
import { towelRoll } from './villaFurnitureTextiles.js';

export function teapot(k: FurnitureKit, material: THREE.Material, s = 1) {
  const { put, m } = k;
  put(turn([[0, .009], [.065, .009], [.070, 0], [.084, 0], [.087, .015], [.125, .033], [.151, .081], [.150, .137],
    [.130, .183], [.097, .205], [.089, .218], [.093, .229], [.082, .231], [.078, .212], [.105, .181], [.123, .14], [.117, .06], [0, .033]]).scale(s, s, s), material, 0, 0, 0);
  put(turn([[0, .209], [.087, .209], [.092, .223], [.084, .234], [.057, .244], [.022, .249], [.016, .257], [.024, .272], [.018, .280], [0, .282]]).scale(s, s, s), material, 0, 0, 0);
  put(stock([[.108, .083, 0, .041], [.148, .095, 0, .045], [.191, .132, 0, .033], [.216, .179, 0, .020], [.247, .203, 0, .019], [.257, .205, 0, .021]], 12, .005).scale(s, s, s), material, 0, 0, 0);
  put(stock([[-.097, .186, 0, .020], [-.150, .202, 0, .016], [-.191, .190, 0, .018], [-.215, .151, 0, .019], [-.202, .113, 0, .018], [-.163, .069, 0, .015], [-.117, .069, 0, .020]], 10).scale(s, s, s), material === m.steel ? m.black : material, 0, 0, 0);
}

function knob(k: FurnitureKit, x: number, y: number, z: number, r: number) {
  const { put, m } = k;
  put(turn([[0, 0], [r * .77, 0], [r, .005], [r, .023], [.86 * r, .028], [r * .74, .029], [0, .029]], 14), m.steel, x, y, z, Math.PI / 2);
  k.box(x, y + r * .43, z + .030, .005, r * .65, .002, m.black, 0);
}
/** Stone is cut around the pressed sink rather than filled under a painted bowl.
 * The floor at the rear stays just under the interactive faucet's impact datum. */
function sink(k: FurnitureKit) {
  const { put, m } = k;
  put(casting(rectXY(1.22, 1.08, .014), .098, [rectXY(.789, .637, .085)]), m.white, 0, .941, 0, -Math.PI / 2);
  put(loft([rectRing(.56, .39, .09, .897), rectRing(.724, .559, .083, .938), rectRing(.781, .633, .085, .984),
    rectRing(.808, .659, .087, .989), rectRing(.81, .66, .087, .997), rectRing(.780, .631, .082, 1.001),
    rectRing(.750, .603, .086, .991), rectRing(.711, .561, .089, .944), rectRing(.64, .474, .092, .934),
    rectRing(.40, .314, .094, .925, 0, .028), rectRing(.096, .096, .043, .911, 0, .109)]), m.steel, 0, 0, 0);
  put(turn([[0, 0], [.042, 0], [.044, .007], [.038, .010], [.030, .006], [.021, .002], [0, .002]], 18), m.dark, 0, .912, .109);
  for (const dx of [-.014, 0, .014]) rail(k, [dx, .918, .088], [dx, .918, .130], .0028, m.steel, 5);
}

/** Pressed oven liner tapers away from a pierced door. Glass, wire runners and
 * the rear fan are separated in depth and can actually be seen through the door. */
function oven(k: FurnitureKit, glass: THREE.Material, led: THREE.Material, microwave: boolean) {
  const { m, put, box } = k;
  const w = microwave ? .79 : 1.065, h = microwave ? .42 : .715;
  const ww = w * (microwave ? .67 : .824), wh = h * .58, dx = microwave ? -.080 : 0, dy = microwave ? 0 : -.041;
  const frame = casting(rectXY(w, h, .026), .034, [rectXY(ww, wh, .035, dx, dy)]);
  put(frame, m.steel, 0, 0, 0);
  put(loft([rectRing(ww, wh, .035, .013), rectRing(ww - .056, wh - .046, .034, -.021), rectRing(ww - .062, wh - .053, .034, -.066),
    rectRing(ww - .08, wh - .076, .032, -.082), rectRing(ww - .10, wh - .086, .033, -.286)], false, true).rotateX(Math.PI / 2), m.dark, dx, dy, 0);
  put(casting(rectXY(ww - .034, wh - .026, .032), .005), glass, dx, dy, -.006);
  if (microwave) {
    put(vessel(.134, .016, .60, 18), m.white, dx, -.115, -.168);
    pull(k, .224, -.015, .020, .235, .040, m.black, true);
    box(.316, .12, .022, .082, .038, .012, led, 0); knob(k, .319, -.07, .018, .033);
  } else {
    for (const sy of [-.126, -.018]) {
      for (const sx of [-1, 1]) rail(k, [sx * ww * .442, sy, -.257], [sx * ww * .442, sy, -.064], .005, m.steel);
      for (const z of [-.226, -.151, -.083]) rail(k, [-ww * .437, sy, z], [ww * .437, sy, z], .004, m.steel, 6);
    }
    put(turn([[0, 0], [.094, 0], [.098, .009], [.075, .018], [.055, .010], [.023, .012], [0, .019]], 18), m.black, 0, -.024, -.28, Math.PI / 2);
    pull(k, 0, .195, .017, .77, .062, m.steel);
    for (const x of [-.393, .393]) knob(k, x, .279, .017, .036);
    box(0, .280, .019, .19, .058, .012, m.black, .003);
    box(0, .280, .026, .116, .019, .005, led, 0);
  }
}
function cookware(k: FurnitureKit) {
  const { put, m } = k;
  k.at(-8.38, 1.021, -8.53, 0, () => {
    put(turn([[0, 0], [.102, 0], [.123, .006], [.134, .018], [.136, .156], [.141, .175], [.145, .183], [.139, .188], [.131, .181], [.126, .151], [.125, .026], [0, .018]]), m.steel, 0, 0, 0);
    put(turn([[0, .175], [.132, .175], [.144, .180], [.145, .189], [.120, .202], [.082, .218], [.030, .226], [0, .226]]), m.steel, 0, 0, 0);
    bent(k, m.black, [[-.037, .219, 0, .011], [-.033, .246, 0, .011], [-.023, .254, 0, .012], [.025, .254, 0, .012], [.036, .246, 0, .010], [.039, .22, 0, .010]]);
    for (const s of [-1, 1]) bent(k, m.black, [[s * .125, .139, -.045, .011], [s * .166, .157, -.045, .012], [s * .187, .159, -.029, .012], [s * .187, .159, .028, .012], [s * .166, .157, .044, .012], [s * .125, .139, .045, .011]]);
  });
  k.at(-10.3, .99, -8.35, -.11, () => { put(turn([[0, 0], [.129, 0], [.148, .009], [.148, .025], [.125, .034], [0, .034]]), m.black, 0, 0, 0); k.at(0, .031, 0, 0, () => teapot(k, m.steel, 1.17)); });
  // A paddle board has a waisted grip and a real lanyard hole. Knives stay
  // sheathed in the leaning block; only the ferrules and scales are exposed.
  const paddle = [[-.31, -.142], [-.289, -.174], [.118, -.174], [.156, -.145], [.168, -.064], [.200, -.039], [.276, -.047], [.309, -.031], [.319, 0], [.309, .031], [.276, .047], [.200, .039], [.168, .064], [.156, .145], [.118, .174], [-.289, .174], [-.31, .142]];
  k.at(-9.43, 1.008, -8.20, .12, () => put(casting(paddle, .035, [circleXY(.275, 0, .016, 12)]), m.oak, 0, 0, 0, -Math.PI / 2));
  k.at(-9.16, .99, -8.64, -.07, () => {
    put(casting([[-.108, .006], [.096, .006], [.111, .04], [.058, .269], [-.115, .220]], .209), m.walnut, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * .057;
      put(turn([[0, 0], [.016, 0], [.019, .011], [.018, .035], [0, .035]], 8), m.steel, x, .239, .003, -.16);
      put(stock([[x, .257, 0, .017], [x, .287, -.006, .020], [x, .349 + .012 * i, -.020, .014], [x, .376 + .012 * i, -.027, .019]], 8), m.black, 0, 0, 0);
    }
  });
}

export function kitchenRun(k: FurnitureKit, tile: THREE.Material, glass: THREE.Material, led: THREE.Material) {
  const { put, m, box, at, hit } = k;
  for (let i = 0; i < 6; i++) at(-10.55 + i * 1.22, 0, -8.35, 0, () => {
    box(0, .067, -.033, 1.15, .134, .88, m.dark, 0);
    for (const sx of [-1, 1]) box(sx * .576, .514, -.006, .035, .755, .98, m.sage, 0);
    box(0, .519, -.481, 1.15, .750, .032, m.oak, 0); box(0, .15, 0, 1.17, .034, .96, m.oak, 0);
    if (i === 4) sink(k); else put(board(1.219, 1.08, .10, .012, .012), m.white, 0, .94, 0);
    if (i !== 2 && i !== 5) for (const x of [-.29, .29]) {
      put(fieldFrame(.559, .712, .043, .075), m.sage, x, .510, .503);
      pull(k, x + (x < 0 ? .176 : -.176), .72, .525, .132, .043, m.brass, true);
    }
    hit(0, 0, 0, 1.22, .99, 1.08);
  });
  // Running-bond splashback, with half tiles cut at the jambs. Glazed faces
  // dimple into the border; only the solid pier takes a full-height run.
  const tileRow = (left: number, y: number, count: number, offset: boolean) => {
    const width = .285;
    for (let i = offset ? -1 : 0; i < count; i++) {
      const a = Math.max(0, i + (offset ? .5 : 0)), b = Math.min(count, i + 1 + (offset ? .5 : 0)), w = width * (b - a) - .006;
      const g = loft([rectRing(w - .005, .126, .006, -.009, 0, 0, 1), rectRing(w, .133, .008, .004, 0, 0, 1), rectRing(w - .013, .120, .006, .009, 0, 0, 1)]);
      put(g, tile, left + width * (a + b) / 2, y, -8.89, Math.PI / 2);
    }
  };
  for (let i = 0; i < 2; i++) tileRow(-11.1925, 1.06 + i * .14, 25, !!(i % 2));
  for (let i = 0; i < 5; i++) tileRow(-8.9925, 1.34 + i * .14, 8, !!(i % 2));
  at(-8.11, .51, -7.807, 0, () => oven(k, glass, led, false));
  put(board(1.045, .764, .026, .043, .008), m.black, -8.11, 1.003, -8.32);
  for (const [x, z, r] of [[-8.38, -8.53, .137], [-7.84, -8.53, .109], [-8.38, -8.18, .105], [-7.84, -8.18, .136]])
    put(turn([[r - .003, 0], [r, 0], [r, .0015], [r - .003, .0015]], 24), m.steel, x, 1.017, z);
  // Folded sheet-metal capture canopy. The rim turns back into the filter well.
  at(-8.11, 0, -8.52, 0, () => {
    put(loft([rectRing(.82, .38, .012, 2.068, 0, -.018), rectRing(.87, .439, .015, 2.039), rectRing(.93, .48, .018, 1.981),
      rectRing(1.17, .735, .026, 1.977), rectRing(1.18, .74, .026, 2.018), rectRing(.61, .37, .03, 2.237, 0, -.157),
      rectRing(.46, .338, .024, 2.247, 0, -.194), rectRing(.46, .338, .024, 2.91, 0, -.194)], true, true), m.steel, 0, 0, 0);
    for (let i = 0; i < 13; i++) put(casting([[-.009, -.020], [.013, .009], [.009, .012], [-.014, -.017]], .367), m.dark, -.391 + i * .065, 2.026, 0);
    box(0, 1.976, .291, .52, .005, .037, led, 0);
  });
  at(-7.01, 0, -8.60, 0, () => {
    for (const x of [-.418, .418]) box(x, 2.22, 0, .029, 1.08, .565, m.cream, 0);
    box(0, 2.22, -.265, .81, 1.07, .029, m.walnut, 0);
    for (const y of [1.696, 2.244, 2.74]) put(board(.84, .565, .037, .013), m.cream, 0, y, 0);
    put(fieldFrame(.798, .445, .041, .057), m.sage, 0, 2.495, .272);
    pull(k, .285, 2.415, .293, .122, .034, m.brass, true);
    at(0, 1.977, .285, 0, () => oven(k, glass, led, true));
    box(0, 1.675, .192, .75, .010, .036, led, 0);
  });
  at(-4.45, 0, -7.81, 0, () => {
    const door = casting(rectXY(1.103, .733, .019), .045, [rectXY(.577, .099, .022, 0, .161)]);
    put(door, m.steel, 0, .50, 0);
    put(loft([rectRing(.581, .105, .022, .020), rectRing(.553, .094, .020, -.007), rectRing(.541, .068, .017, -.047, 0, .007)]).rotateX(Math.PI / 2), m.dark, 0, .661, -.012);
    put(board(.973, .066, .014, .01, .004), m.black, 0, .815, .026, Math.PI / 2);
    for (const x of [-.39, -.31, -.23]) knob(k, x, .815, .029, .014);
    box(.312, .815, .036, .078, .017, .006, led, 0);
  });
  cookware(k);
}

export function island(k: FurnitureKit) {
  const { put, m, at } = k;
  at(0, 0, -.092, Math.PI, () => cabinet(k, 2.5, .99, .954, 3, m.oak, m.walnut));
  // End grain waterfall returns and a rebated counter overhang on the stool side.
  put(board(2.7, 1.43, .103, .050, .029), m.white, 0, .974, 0);
  for (const x of [-1.195, 1.195]) k.box(x, .505, .359, .044, .831, .451, m.walnut, 0);
  put(vessel(.25, .13, .42), m.cream, .55, 1.025, 0);
  for (let i = 0; i < 5; i++) {
    const a = 2.4 * i, x = .55 + .121 * Math.cos(a), z = .107 * Math.sin(a), y = 1.092 + .012 * (i % 3);
    const fruit = turn([[0, .011], [.032, 0], [.059, .012], [.078, .052], [.074, .095], [.057, .129], [.026, .14], [0, .124]], 12);
    put(fruit, i % 2 ? m.coral : m.leafLight, x, y, z, 0, a, .12 * Math.sin(a));
    bent(k, m.walnut, [[x, y + .121, z, .0035], [x + .008, y + .153, z, .0025]], 5);
  }
  k.hit(0, 0, 0, 2.7, 1.03, 1.43);
}
export function placeSetting(k: FurnitureKit) {
  const { m, put } = k;
  put(board(.623, .473, .006, .023, .002), m.linen, 0, .004, 0);
  put(vessel(.185, .030, .54), m.white, 0, .007, 0);
  // Fork with four separated tines; one-piece spoon bowl with a hollowed back.
  const fork = [[-.006, -.136], [.007, -.136], [.007, .024], [.020, .044], [.020, .119], [.015, .119], [.013, .069], [.009, .068], [.007, .122], [.003, .122], [.001, .067], [-.003, .067], [-.005, .122], [-.009, .122], [-.010, .068], [-.014, .069], [-.016, .119], [-.020, .119], [-.020, .044], [-.006, .024]];
  put(casting(fork, .005), m.steel, -.244, .012, 0, -Math.PI / 2);
  put(vessel(.030, .014, .18, 14).scale(.90, 1, 1.44), m.steel, .241, .008, -.078);
  bent(k, m.steel, [[.241, .016, -.050, .005], [.241, .018, -.027, .006], [.241, .018, .066, .005], [.241, .014, .116, .009], [.241, .014, .128, .006]], 6);
}

/** The circular opening continues all the way into the cabinet. The glass is a
 * dished window, with a gasket and a deep drawn drum behind it (not flat discs). */
export function frontLoader(k: FurnitureKit, w: number, d: number, h: number, glass: THREE.Material, dryer = false, display: THREE.Material = k.m.lampGlow) {
  const { m, put, box } = k, f = d / 2 - .014, cy = h * .46, r = Math.min(w * .337, h * .31);
  for (const x of [-w * .38, w * .38]) for (const z of [-d * .37, d * .37]) put(turn([[0, 0], [.034, 0], [.042, .008], [.038, .038], [0, .038]], 8), m.dark, x, 0, z);
  for (const x of [-w / 2 + .015, w / 2 - .015]) box(x, h * .50 + .01, -.008, .028, h - .067, d - .033, m.white, 0);
  box(0, h / 2, -d / 2 + .015, w - .045, h - .078, .027, m.steel, 0);
  put(board(w, d, .040, .029, .009), m.white, 0, h - .02, 0);
  box(0, .052, 0, w - .055, .045, d - .04, m.dark, 0);
  const chassis = casting(rectXY(w - .018, h - .063, .021, 0, h / 2 + .007), .032, [circleXY(0, cy, r * .937)]);
  put(chassis, m.white, 0, 0, f);
  put(turn([[r * .89, -.021], [r * .992, -.010], [r * 1.032, .009], [r * 1.021, .033], [r * .957, .057], [r * .872, .067], [r * .821, .057], [r * .801, .035], [r * .826, .021], [r * .87, .022]], 24), dryer ? m.dark : m.steel, 0, cy, f, Math.PI / 2);
  put(turn([[r * .875, .033], [r * .825, .054], [r * .785, .042], [r * .744, .012], [r * .716, -.019], [r * .740, -.045], [r * .824, -.066], [r * .866, -.096]], 24), m.dark, 0, cy, f, Math.PI / 2);
  put(turn([[r * .805, .044], [r * .722, .049], [r * .6, .038], [r * .39, .012], [0, .002]], 24), glass, 0, cy, f, Math.PI / 2);
  put(turn([[r * .874, -.077], [r * .918, -.115], [r * .921, -d * .58], [r * .84, -d * .64], [r * .60, -d * .66], [r * .32, -d * .62], [0, -d * .61]], 24), m.steel, 0, cy, f, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + .38, x = Math.cos(a) * r * .86, y = cy + Math.sin(a) * r * .86;
    bent(k, m.dark, [[x, y, f - .1, .008], [x * .93, cy + (y - cy) * .93, f - .153, .019], [x * .92, cy + (y - cy) * .92, f - d * .56, .019]], 6);
  }
  const fascia = casting([[ -w * .47, 0], [w * .47, 0], [w * .47, .105], [-w * .47, .105]], .022);
  put(fascia, m.steel, 0, h - .157, f + .018, -.055);
  knob(k, w * .297, h - .102, f + .034, .037);
  box(-w * .25, h - .104, f + .031, w * .245, .041, .012, m.dark, 0);
  box(-w * .25, h - .102, f + .038, w * .14, .014, .003, display, 0);
  if (!dryer) pull(k, -w * .295, h * .731, f + .014, w * .21, .018, m.steel);
  else for (let i = 0; i < 4; i++) box(w * .2, .115 + i * .018, f + .019, w * .24, .005, .004, m.dark, 0);
}

export function utilityLaundry(k: FurnitureKit, glass: THREE.Material) {
  const { m, put, box, at } = k;
  at(-2.6, 0, -3.3, 0, () => frontLoader(k, .64, .70, .94, glass));
  at(-1.5, 0, -3.3, 0, () => frontLoader(k, .64, .70, .94, glass, true));
  // Wall rack hung from two slotted standards; flip-down triangular brackets finish the underside.
  for (const z of [.58, 2.62]) box(-4.05, 1.205, z, .052, 2.26, .057, m.steel, 0);
  for (let level = 0; level < 4; level++) {
    const y = .5 + level * .6; put(board(.36, 2.61, .043, .025), m.oak, -3.9, y, 1.6);
    for (const z of [.58, 2.62]) rail(k, [-4.025, y - .18, z], [-3.763, y - .029, z], .010, m.steel);
    if (level > 0) for (let i = 0; i < 2; i++) put(towelRoll(.275, .061), i ? m.sage : m.linen, -3.91, y + .087, .77 + i * .17 + level * .15, 0, Math.PI / 2);
  }
  // Slotted laundry hamper: actual perforations and a rolled rim around the open mouth.
  at(3.6, 0, 2.9, 0, () => {
    const ring = (w: number, d: number, y: number) => rectRing(w, d, .104, y, 0, 0, 3);
    put(loft([ring(.83, .47, .018), ring(.88, .52, .040), ring(.938, .552, .108), ring(.893, .514, .108), ring(.836, .459, .060)]), m.sage, 0, 0, 0);
    put(loft([ring(1.038, .635, .421), ring(1.081, .669, .433), ring(1.092, .68, .465), ring(1.073, .669, .482), ring(1.009, .606, .482), ring(1.005, .603, .428)], false, false), m.sage, 0, 0, 0);
    for (const sz of [-1, 1]) for (let i = 0; i < 11; i++) rail(k, [(i - 5) * .080, .083, sz * .252], [(i - 5) * .091, .447, sz * .314], .015, m.sage, 6);
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) rail(k, [sx * .456, .083, (i - 2) * .079], [sx * .515, .447, (i - 2) * .097], .015, m.sage, 6);
  });
}
