import type * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import type { VillaLandscapeTreeKind } from './villaStream.js';
import { NaturePalette, add3, collar, margin, mix3, polar, stemAtHeight, turn, type P3 } from './villaNatureGeometry.js';

type Paint = THREE.Material;
interface Woods { bark: Paint; birch: Paint; dark: Paint; oak: Paint; lime: Paint; pine: Paint }

/** Distant boughs have an intentionally coarser leaf scale than the reachable
 * orchard. The branches are still open fans with air between tiers, including
 * from underneath. Nothing here is an alpha-billboard or an opaque crown orb. */
export function addVillaWoodlandTree(b: VillaModelBuilder, kind: VillaLandscapeTreeKind, scale: number, phase: number, paint: Woods) {
  const art = new NaturePalette(), bark = art.get(paint.bark), pale = art.get(paint.birch);
  if (kind === 'pine') {
    const leader: P3 = [.12 * Math.cos(phase), 6.18 + .17 * Math.sin(phase), -.04];
    const trunk: P3[] = [[0, -.04, 0], [.03, 1.78, 0], [-.04, 3.68, .03], leader];
    bark.stem(trunk.map((p, i) => collar(p, [.20, .155, .097, .015][i])), 7, .09);
    for (let tier = 0; tier < 5; tier++) {
      const root = stemAtHeight(trunk, leader[1] * (.32 + tier * .15)), count = tier === 4 ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const a = phase * .6 + turn * i / count + tier * 1.71, spread = (1.55 - tier * .30) * (1 + .08 * Math.sin(a));
        const needle = art.get((i + tier) % 3 ? paint.pine : paint.dark);
        // One irregular, three-dimensional skirt per *bough*, not per tree.
        // The ridge rises from the bole before drooping under the mature tips;
        // every serrated lateral is sewn to that same rib. From across the
        // stream this still has broad downhill faces, not edge-on green sticks.
        const drop = .25 + spread * .41, twist = .16 * Math.sin(i + phase + tier);
        const vertex = (r: number, lateral: number, h: number) => needle.point(add3(root, add3(polar(a, spread * r, h * drop),
          polar(a + Math.PI / 2, spread * (lateral + twist * r * r), 0))));
        const origin = vertex(0, 0, 0), knuckle = vertex(.34, 0, .19), ridge = vertex(.68, 0, -.26), tip = vertex(1.05, 0, -.59);
        for (const side of [-1, 1]) {
          const l0 = vertex(.37, side * .40, -.51), l1 = vertex(.42, side * .23, -.53),
            l2 = vertex(.72, side * (.42 + .035 * side), -.96), l3 = vertex(.70, side * .17, -.71), l4 = vertex(.96, side * .20, -.91);
          const faces = [[origin, knuckle, l0], [knuckle, l1, l0], [knuckle, ridge, l1], [ridge, l2, l1], [ridge, l3, l2], [ridge, tip, l3], [tip, l4, l3]];
          for (const [p, q, r] of faces) side === 1 ? needle.tri(p, r, q) : needle.tri(p, q, r);
        }
      }
    }
  } else if (kind === 'birch') {
    for (const side of [-1, 1]) {
      const top: P3 = [side * (.62 + .14 * Math.sin(phase)), 5.71 + .25 * side, side * .17], foot: P3 = [side * .096, -.025, 0];
      const knee = mix3(foot, top, .41); knee[0] -= side * .09;
      pale.stem([collar(foot, .118), collar(knee, .082), collar(top, .020)], 7, .052);
      // Raised dark scars below real forks on pale, gently splayed stems.
      for (let j = 0; j < 3; j++) {
        const p = mix3(foot, knee, .21 + .22 * j); p[0] += side * .070;
        bark.stem([collar(add3(p, [0, 0, -.056]), .011), collar(add3(p, [0, .018, .053]), .008)], 3);
      }
      for (let j = 0; j < 4; j++) {
        const a = phase + j * 2.399 + side * .94, p = mix3(knee, top, .14 + j * .22), fork = add3(p, polar(a, .66 - j * .072, .71));
        pale.stem([collar(p, .047), collar(fork, .022)], 4, 0, 0, true);
        for (const hand of [-1, 1]) {
          const dir = a + hand * .69, tip = add3(fork, polar(dir, .77 - .069 * j, -.84));
          const hanging = art.get(j % 3 ? paint.oak : paint.bark);
          hanging.stem([collar(fork, .014), collar(tip, 0)], 3, 0, 0, true);
          for (let k = 0; k < 4; k++) art.get((j + k) % 3 ? paint.lime : paint.oak).blade(mix3(fork, tip, .08 + .27 * k),
            polar(dir + (k % 2 ? .98 : -.98), .54, -.55 + .12 * Math.cos(a + k)), .28, margin.spur, .18, .47 * Math.sin(a + k), -.52);
        }
      }
    }
  } else {
    const crotch: P3 = [.08, 2.26, -.07];
    bark.stem([[0, -.035, 0, .34], [-.044, .44, .02, .27], [.031, 1.09, .04, .23], collar(crotch, .17), [.16, 3.66, .19, .066]], 8, .14);
    for (let i = 0; i < 6; i++) {
      const a = phase + i * 2.399, t = i / 5, start = mix3(crotch, [.16, 3.66, .19], t);
      const elbow = add3(start, polar(a - .15, .68 - .32 * t, .58)), fork = add3(elbow, polar(a + .12, .56 - .24 * t, .24 + .30 * t));
      bark.stem([collar(start, .104 - .055 * t), collar(elbow, .067), collar(fork, .036)], 5, .10, 0, true);
      for (const side of [-1, 1]) {
        const dir = a + side * .61, end = add3(fork, polar(dir, .86 - .26 * t, .48 - .26 * side));
        bark.stem([collar(fork, .037), collar(end, 0)], 3, 0, 0, true);
        for (let j = 0; j < 5; j++) {
          const leaf = art.get((i + j) % 4 ? paint.oak : paint.lime), la = dir + (j % 2 ? .99 : -.99);
          leaf.blade(mix3(fork, end, .12 + .21 * j), polar(la, .86 - .12 * t, -.18 - .36 * (j % 2)), .47 - .05 * t, margin.lance, .29, .58 * Math.cos(j + phase), -.60);
        }
      }
    }
  }
  art.finish(b, scale);
}
export function addVillaUnderstory(b: VillaModelBuilder, scale: number, phase: number, bark: Paint, leaf: Paint, young: Paint) {
  const art = new NaturePalette();
  for (let i = 0; i < 3; i++) {
    const a = phase + i * 2.399, start = polar(a, .055, -.027), end = polar(a, .43, .51 + .12 * Math.sin(a));
    art.get(bark).stem([collar(start, .030), collar(end, .010)], 3, 0, 0, true);
    for (let j = 0; j < 4; j++) art.get((i + j) % 3 ? leaf : young).blade(mix3(start, end, .3 + j * .21), polar(a + (j % 2 ? -.90 : .90), .35, .07), .125, margin.spur, .06, .28);
  }
  art.finish(b, scale);
}
/** Tussocks and rushes share a rooted cluster but not repeated vertical sticks:
 * blades arc back into the bank. A cattail's upper spike emerges through its
 * sausage-shaped seed head; the head and rod share the same axis. */
export function addVillaWaterMargin(b: VillaModelBuilder, scale: number, phase: number, leaf: Paint, grass: Paint, seed: Paint, withHeads: boolean) {
  const art = new NaturePalette(), cane = art.get(leaf), tip = art.get(seed);
  for (let i = 0; i < (withHeads ? 3 : 2); i++) {
    const a = phase + i * 2.399, base = polar(a, .10, -.04), end = add3(base, polar(a + .38, .08, .49 + .13 * Math.cos(a)));
    if (withHeads) {
      cane.stem([collar(base, .009), collar(end, .006)], 4, 0, 0, true);
      const lower = mix3(base, end, .72), shoulder = mix3(base, end, .76), taper = mix3(base, end, .945), cap = mix3(base, end, .97);
      tip.stem([collar(lower, .009), collar(shoulder, .022), collar(taper, .022), collar(cap, .008)], 5, 0, 0, true);
    }
    for (let j = 0; j < 3; j++) art.get(j % 2 ? grass : leaf).blade(base, polar(a + j * .82, .24 + .09 * j, .18 + .09 * Math.sin(a + j)), .018 + .006 * j,
      margin.lance, .14 + .035 * Math.cos(a), .34 * Math.sin(a + j), -.31);
  }
  art.finish(b, scale);
}
