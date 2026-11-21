import { board, casting, loft, oval, rail, type FurnitureKit, type Point } from './villaFurnitureForms.js';

/** Segmental arch on a pair of ashlar piers. The aperture runs through the
 * breast to a rear liner; a black rectangle on a wall cannot produce its reveal. */
export function fireplace(k: FurnitureKit, backZ: number) {
  const { m, put, box } = k;
  const spring = .941, a = .932, b = .387, shell = .216;
  const arc = (u: number, outer = false) => [(a + (outer ? shell : 0)) * Math.cos(u), spring + (b + (outer ? .18 : 0)) * Math.sin(u)];
  const outline = [[-1.25, .02], [-1.25, 3.4], [1.25, 3.4], [1.25, .02], [a, .02],
    ...Array.from({ length: 17 }, (_, i) => arc(i * Math.PI / 16)), [-a, .02]];
  put(casting(outline, .42), m.cream, 0, 0, backZ + .21);
  box(0, .70, backZ + .036, 2.04, 1.35, .072, m.dark, 0);
  // Refractory bricks: the chamfer exposes the dark mortar without individual
  // filler layers. Thin firebrick returns carry the opening around its corners.
  const left = -.918, width = 1.836, pitch = .365;
  for (let row = 0; row < 6; row++) {
    const y = .277 + row * .174;
    for (let col = -1; col * pitch < width; col++) {
      const x0 = Math.max(0, (col + (row % 2) * .5) * pitch), x1 = Math.min(width, (col + 1 + (row % 2) * .5) * pitch);
      if (x1 - x0 < .030) continue;
      put(board(x1 - x0 - .007, .164, .030, .012, .008), (col + row) % 5 ? m.dark : m.walnut, left + (x0 + x1) / 2, y, backZ + .085, Math.PI / 2);
    }
  }
  put(loft([oval(2.68, .76, .006, 32, .30), oval(2.82, .85, .074, 32, .30), oval(2.84, .863, .187, 32, .30), oval(2.78, .83, .221, 32, .30)]), m.stone, 0, 0, .352);
  for (const s of [-1, 1]) {
    box(s * 1.042, .582, .215, .252, .731, .91, m.dark, 0);
    for (let i = 0; i < 3; i++) {
      const w = .274 + (i === 0 ? .034 : 0);
      put(board(w, .65, .237, .017, .013), i === 1 ? m.cream : m.stone, s * (a + w / 2), .342 + i * .239, .337);
    }
    put(board(.346, .724, .065, .024, .025), m.cream, s * 1.078, spring + .012, .33);
  }
  const n = 11;
  for (let i = 0; i < n; i++) {
    const start = i * Math.PI / n + .0026, end = (i + 1) * Math.PI / n - .0026, mid = (start + end) / 2;
    const key = i === (n - 1) / 2, outerMid = arc(mid, true); if (key) outerMid[1] += .045;
    put(casting([arc(start), arc(mid), arc(end), arc(end, true), outerMid, arc(start, true)], key ? .644 : .605), key || i % 4 === 1 ? m.cream : m.stone, 0, 0, .339);
  }
  for (const x of [-1.11, 1.11]) put(casting([[-.135, .005], [.142, .005], [.142, .37], [.08, .36], [.034, .305], [.015, .213], [-.052, .15], [-.135, .118]], .203), m.stone, x, 1.17, .315, 0, -Math.PI / 2);
  put(board(2.72, .731, .092, .042, .067), m.cream, 0, 1.498, .318);
  put(board(2.86, .82, .091, .048, .028), m.stone, 0, 1.577, .318);
  for (const x of [-.59, .59]) {
    rail(k, [x, .229, .175], [x, .324, .23], .020, m.black);
    rail(k, [x, .229, .617], [x, .33, .568], .020, m.black);
    rail(k, [x, .329, .17], [x, .33, .61], .019, m.black);
  }
  for (let i = 0; i < 5; i++) rail(k, [-.735, .332, .161 + i * .112], [.735, .332, .161 + i * .112], .015, m.black);
  for (let i = 0; i < 4; i++) {
    const len = .88 - i * .065, r = .076 - i * .004, g = casting([[-r, -.57 * r], [-r * .65, -.9 * r], [.16 * r, -r], [.73 * r, -.65 * r], [r, -.08 * r], [.87 * r, .49 * r], [.27 * r, .92 * r], [-.12 * r, .80 * r]], len);
    put(g, i === 1 ? m.dark : m.walnut, (i % 2 ? .33 : -.30), .405 + Math.floor(i / 2) * .081, .334 + (i % 2) * .144, 0, Math.PI / 2 + (i % 2 ? .34 : -.37), .04);
  }
}

export function flameTongue(index: number) {
  const section = (r: number, y: number, dx: number, dz: number) => oval(2 * r, 2 * r, y, 9).map(([x, yy, z], i): Point => {
    const f = 1 + .10 * Math.sin(i * 2.4 + index);
    return [dx + x * f, yy, dz + z * f];
  });
  const lean = index % 2 ? -.8 : .65;
  return loft([section(.20, -.67, 0, 0), section(.80, -.47, -.11, 0), section(.93, -.08, .11, .01), section(.58, .25, lean * .32, .12),
    section(.37, .51, lean * .57, .17), section(.13, .79, lean * .43, .14), section(.018, 1.04, lean * .60, -.05)]);
}
