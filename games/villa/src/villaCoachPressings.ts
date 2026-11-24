import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { sectionLoft, type P3 } from './villaVehicleSections.js';

type Face = (u: number, v: number, lift?: number) => P3;
type Fascia = (z: number, a: number, v: number, lift?: number) => P3;
type Sheet = (nu: number, nv: number, sample: Face, outward: P3) => THREE.BufferGeometry;
const mix = THREE.MathUtils.lerp;
export const cuts = (values: number[]) => values.sort((a, b) => a - b).filter((v, i, arr) => !i || v - arr[i - 1] > 1e-6);
export function along(values: readonly number[], t: number) {
  const s = THREE.MathUtils.clamp(t, 0, 1) * (values.length - 1), i = Math.min(Math.floor(s), values.length - 2);
  return mix(values[i], values[i + 1], s - i);
}

/** Sample a real tessellated edge, rather than reevaluating the smooth curve
 * inside a neighbour's chord (which would open a slit between the two skins). */
export function edgePoint(cuts: readonly number[], points: P3[], at: number): P3 {
  let i = 1; while (i < cuts.length - 1 && at > cuts[i]) i++;
  const lo = cuts[i - 1], hi = cuts[i], t = (at - lo) / (hi - lo), a = points[i - 1], b = points[i];
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

export interface CoachOpening {
  /** Across coordinates run inboard to outboard on a lamp, on either side. */
  rect: [a0: number, a1: number, bottom: number, top: number];
  depth: number;
  shape: 'wing' | 'duct' | 'grille' | 'press' | 'gate';
  stock: THREE.Material;
}

/** Press the actual end skin: leave cells OUT of the sheet, roll their edges
 * over a die, turn the throat inboard, and close the back there. A fin/optic
 * placed on the returned face is behind the surrounding painted sheet. */
export function pressFascia(b: VillaModelBuilder, paint: THREE.Material, z: number, face: Fascia, sheet: Sheet,
  across: number[], heights: number[], openings: CoachOpening[]): Face[] {
  const sign = Math.sign(z);
  const as = cuts([...across, ...openings.flatMap(o => o.rect.slice(0, 2))]);
  const vs = cuts([...heights, ...openings.flatMap(o => o.rect.slice(2))]);
  const sample = (u: number, v: number, lift = 0) => face(z, along(as, u), along(vs, v), lift);
  const skin = sheet(as.length - 1, vs.length - 1, sample, [0, 0, sign]);
  const ix = skin.index!, kept: number[] = [];
  for (let j = 0, k = 0; j < vs.length - 1; j++) for (let i = 0; i < as.length - 1; i++, k += 6) {
    const a = (as[i] + as[i + 1]) / 2, v = (vs[j] + vs[j + 1]) / 2;
    if (!openings.some(({ rect: [l, r, lo, hi] }) => (a - l) * (a - r) < 0 && v > lo && v < hi)) {
      for (let t = 0; t < 6; t++) kept.push(ix.getX(k + t));
    }
  }
  skin.setIndex(kept); b.geometry(skin, paint);
  // Inside skin is behind the DEEPEST pocket, not a second lid across it.
  const back = Math.max(.035, ...openings.map(o => o.depth + .012));
  b.geometry(sheet(across.length - 1, heights.length - 1,
    (u, v) => face(z, along(across, u), along(heights, v), -back), [0, 0, -sign]), paint);
  for (const end of [0, 1]) {
    b.geometry(sheet(as.length - 1, 1, (t, v) => sample(t, end, -back * v), [0, end ? 1 : -1, 0]), paint);
    b.geometry(sheet(vs.length - 1, 1, (t, v) => sample(end, t, -back * v), [end ? 1 : -1, 0, 0]), paint);
  }
  return openings.map(({ rect: [a0, a1, v0, v1], shape, depth, stock }) => {
    const au = as.filter(a => (a - a0) * (a - a1) <= 1e-12).map(a => (a - a0) / (a1 - a0)).sort((a, c) => a - c);
    const vv = vs.filter(v => v >= v0 && v <= v1).map(v => (v - v0) / (v1 - v0));
    // Keep every boundary vertex of the die registered with the cut in the
    // outer sheet, including the narrow corner returns around a lamp.
    const perimeter = [...au.slice(0, -1).map(t => [t, 0]), ...vv.slice(0, -1).map(t => [1, t]),
      ...au.slice(1).reverse().map(t => [t, 1]), ...vv.slice(1).reverse().map(t => [0, t])];
    const formed = (u: number, v: number, blend: number, scale: number, lift: number): P3 => {
      const width = shape === 'grille' ? .76 + .21 * v : shape === 'duct' ? .97 - .16 * v : .98;
      const ru = .5 + (u - .5) * width * (.92 + .08 * Math.sin(v * Math.PI));
      const rv = shape === 'wing' ? mix(.07 + .25 * u * u, .96 - .055 * (1 - u) ** 2, v)
        : .5 + (v - .5) * (.93 + .054 * Math.sin(u * Math.PI));
      return face(z, mix(a0, a1, .5 + (mix(u, ru, blend) - .5) * scale),
        mix(v0, v1, .5 + (mix(v, rv, blend) - .5) * scale), lift);
    };
    const ring = (blend: number, scale: number, lift: number) => perimeter.map(([u, v]) => formed(u, v, blend, scale, lift));
    const rolled = ring(1, .957, -depth * .20);
    b.geometry(sectionLoft([ring(0, 1, 0), ring(.77, .989, .0015), rolled], false, false, [0, 0, sign]), paint);
    const scale = shape === 'press' ? .90 : shape === 'wing' ? .91 : .86;
    b.geometry(sectionLoft([rolled, ring(1, scale, -depth)], false, false, [0, 0, sign]), stock);
    const floor = (u: number, v: number, lift = 0) => {
      // A cargo gate is one draw-formed sheet. Two broad stiffening beads
      // fade into the end lands; nothing is bonded on top of a flat panel.
      const bead = shape === 'gate' ? .038 * Math.min(1, u * 8, (1 - u) * 8)
        * Math.max(0, 1 - ((v - (v < .50 ? .26 : .74)) / .175) ** 2) ** 2 : 0;
      return formed(u, v, 1, scale, -depth + bead + lift);
    };
    const rows = shape === 'gate' ? cuts([...vv, .08, .20, .26, .32, .44, .56, .68, .74, .80, .92]) : vv;
    b.geometry(sheet(au.length - 1, rows.length - 1, (u, v) => floor(along(au, u), along(rows, v)), [0, 0, sign]), stock);
    return floor;
  });
}
