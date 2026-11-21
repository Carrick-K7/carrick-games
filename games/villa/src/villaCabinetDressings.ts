import { VillaModelBuilder } from './villaModel.js';
import * as THREE from 'three';
import { FittingSkin, formedTube, vessel, type Section } from './villaFittingGeometry.js';

type Outfit = 'dress' | 'coat' | 'blouse' | 'cardigan' | 'shirt' | 'trousers';
/** Front and back share a hem and shoulder perimeter, with a folded return at the neck.
 * Width, pleats and ease change down the length; this is not an extruded outline. */
function drape(rows: readonly [width: number, y: number, depth: number, pleat: number][], phase: number, sides = 16) {
  const skin = new FittingSkin(); let last: number[] | undefined;
  rows.forEach(([w, y, d, pleat], row) => {
    const ring = Array.from({ length: sides }, (_, i) => {
      const a = i * Math.PI * 2 / sides, c = Math.cos(a), s = Math.sin(a);
      const fall = Math.sin(5 * a + phase + y * .9), edge = row <= 2 ? 1 : Math.max(0, -y - .5);
      return skin.point(w * c * (1 + .025 * fall), y + edge * .007 * Math.cos(3 * a + phase),
        d * s * (1 + pleat * fall) - .008 * Math.sin(y * 2 + phase) * Math.min(1, -y));
    });
    if (last) skin.join(last, ring); last = ring;
  });
  return skin.geometry();
}

export function hangingGarment(b: VillaModelBuilder, x: number, shoulder: number, z: number, style: Outfit,
  fabric: THREE.Material, lining: THREE.Material, button: THREE.Material, phase: number, size = 1, breadth = 1.82) {
  const dress = style === 'dress', coat = style === 'coat', shirt = style === 'shirt' || style === 'cardigan';
  const hem = dress ? -1.07 : coat ? -.88 : shirt ? -.51 : -.40;
  const sweep = dress ? .116 : coat ? .090 : .073;
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => b.geometry(g.scale(size * breadth, size, size * 1.18), m, [x, shoulder, z]);
  if (style === 'trousers') {
    for (const side of [-1, 1]) add(drape([[.032, -.97, .023, .16], [.033, -.987, .024, .18],
      [.035, -.82, .025, .13], [.038, -.52, .028, .13], [.041, -.29, .032, .1], [.041, -.20, .030, .07]], phase + side, 14).translate(side * .038, 0, 0), fabric);
    add(drape([[.076, -.24, .029, .09], [.079, -.188, .033, .1], [.073, -.074, .028, .05],
      [.071, -.065, .029, 0], [.070, -.037, .029, 0], [.068, -.037, .026, 0], [.068, -.058, .026, 0]], phase), fabric);
    for (const side of [-1, 1]) b.box(x + side * .077 * size, shoulder - .035 * size, z, .024, .030, .018, button, .003);
    return;
  }
  add(drape([[sweep * .95, hem + .013, .033, .18], [sweep, hem, .036, .23], [sweep, hem + .014, .036, .23],
    [sweep * .9, hem * .76, .033, .20], [dress ? .047 : .061, hem * .46, .025, .11], [.065, -.16, .035, .07],
    [.078, -.049, .030, .05], [.086, -.028, .018, .03], [.028, .002, .016, 0], [.022, .008, .013, 0],
    [.021, -.011, .012, 0]], phase), fabric);
  for (const side of [-1, 1]) {
    const cuff = coat ? -.546 : dress || style === 'blouse' ? -.20 : -.499;
    add(formedTube([[side * .069, -.037, -.001, .033, .028], [side * .080, -.056, .002, .031, .028],
      [side * .090, cuff * .38, .009, .025, .026], [side * .093, cuff * .59, .014, .0225, .023],
      [side * .093, cuff * .66, .019, .020, .022], [side * .089, cuff + .031, .029, .017, .019],
      [side * .089, cuff + .024, .030, .019, .020], [side * .088, cuff, .031, .017, .019]], 9, .0038), fabric);
    // Lapel/collar facing overlaps the bodice only at its seam. The points stand clear in front.
    const s = new FittingSkin(), a = s.point(side * .022, .004, .008), c = s.point(side * .006, -.047, .034),
      d = s.point(side * .034, -.031, .034), e = s.point(side * .042, -.014, .024);
    if (side > 0) { s.face(a, c, d); s.face(a, d, e); } else { s.face(d, c, a); s.face(e, d, a); }
    add(s.geometry(), lining);
  }
  if (!dress && !coat) {
    if (shirt) for (const side of [-1, 1]) {
      const leg = drape([[.027, -.98, .019, .10], [.030, -.994, .022, .18], [.032, -.80, .023, .14],
        [.032, -.61, .023, .13], [.036, -.42, .025, .04]], phase + side, 10);
      add(leg.translate(side * .034, 0, -.003), lining);
    } else add(drape([[.081, -.89, .027, .16], [.084, -.90, .03, .24], [.075, -.68, .029, .20],
      [.050, -.414, .022, .03], [.048, -.39, .02, 0]], phase), lining);
  }
  if (!dress) for (let i = 0; i < 3; i++) {
    const y = -.105 - i * .098, front = (.0355 + .003 * Math.sin(phase)) * size * 1.18;
    b.cylinder(x + .006 * size * breadth, shoulder + y * size, z + front, .004 * size, .0045 * size, .004 * size, button, [Math.PI / 2, 0, 0], 6);
  }
}

/** Bent wire actually loops over the rail. Sloped wooden shoulders disappear into a collar. */
export function hanger(b: VillaModelBuilder, x: number, y: number, z: number, width: number, wood: THREE.Material, metal: THREE.Material) {
  b.geometry(formedTube([[0, -.057, .001, .003], [0, -.027, .001, .003], [0, -.01, -.015, .003],
    [0, .004, -.019, .003], [0, .015, -.012, .003], [0, .019, 0, .003], [0, .012, .015, .003],
    [0, -.004, .018, .003]], 6, 0, [1, 0, 0]), metal, [x, y, z]);
  b.geometry(formedTube([[-width, -.104, 0, .006, .010], [-width * .92, -.097, 0, .008, .010],
    [-width * .32, -.061, 0, .009, .009], [0, -.056, 0, .012, .009], [width * .32, -.061, 0, .009, .009],
    [width * .92, -.097, 0, .008, .010], [width, -.104, 0, .006, .01]], 6), wood, [x, y, z]);
  b.beam([x - width, y - .104, z], [x + width, y - .104, z], .0035, metal, 6);
}

/** Irregular low-top upper, heel counter and a real ankle opening descending to an insole. */
export function shoe(b: VillaModelBuilder, x: number, y: number, z: number, upper: THREE.Material, sole: THREE.Material, scale = 1) {
  const add = (rows: Section[], m: THREE.Material) => b.geometry(vessel(rows, 12, .86).scale(scale, scale, scale), m, [x, y, z]);
  add([[0, 0], [.045, 0, .106, 0, .006], [.046, .010, .106, 0, .006], [.044, .014, .104, 0, .006], [0, .014]], sole);
  add([[.043, .010, .102, 0, .006], [.044, .019, .101, 0, .006], [.042, .031, .096, 0, .004],
    [.037, .042, .072, 0, -.013], [.032, .063, .045, 0, -.040], [.027, .061, .039, 0, -.040],
    [.023, .028, .035, 0, -.040], [0, .024, 0, 0, -.04]], upper);
}
