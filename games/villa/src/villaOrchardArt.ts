import * as THREE from 'three';
import type { VillaFruitSpecies } from './villaGarden.js';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, NaturePalette, add3, collar, margin, mix3, polar, turn, type P3 } from './villaNatureGeometry.js';

// A spine/one continuous skin per fruit. Section radii run from blossom end
// up to stalk: the shoulder of a pear is not a second fruit glued to the neck.
const profiles = {
  cherry: [[-.079, 0], [-.065, .045], [-.026, .075], [.031, .069], [.066, .048], [.060, 0]],
  orange: [[-.166, 0], [-.143, .105], [-.062, .175], [.058, .178], [.145, .113], [.162, 0]],
  apple: [[-.137, 0], [-.153, .063], [-.13, .098], [-.094, .129], [-.025, .15], [.040, .165], [.097, .152], [.138, .115], [.148, .063], [.102, 0]],
  pear: [[-.193, 0], [-.177, .077], [-.142, .138], [-.083, .166], [-.010, .161], [.060, .133], [.133, .084], [.20, .052], [.243, .035], [.253, 0]],
  lemon: [[-.209, 0], [-.20, .031], [-.17, .045], [-.133, .089], [-.067, .125], [.028, .133], [.108, .109], [.163, .067], [.19, .036], [.202, 0]],
  mango: [[-.27, 0], [-.254, .045], [-.22, .080], [-.17, .102], [-.105, .12], [-.031, .132], [.045, .144], [.12, .142], [.179, .128], [.222, .10], [.25, .066], [.264, .035], [.27, 0]],
} as const;
function fruitAxis(kind: VillaFruitSpecies, h: number): number {
  return kind === 'mango' ? .052 * (1 - (h / .27) ** 2) - .025 * h / .27 : kind === 'pear' ? -.020 * (h + .193) / .446
    : kind === 'lemon' ? -.2 * h : kind === 'cherry' ? -.012 * h / .08 : .004 * h;
}
/** Cut surface has a recessed stem well, unequal shoulders or a nipple as
 * appropriate. Vertex blush follows those shoulders; no extra skin overlay. */
export function orchardFruitSkin(kind: VillaFruitSpecies, azimuth: number) {
  const profile = profiles[kind], skin = new NatureMesh();
  const sides = kind === 'mango' ? 16 : kind === 'apple' ? 12 : 8;
  skin.round(profile, sides, (x, y, z, a) => {
    const lobe = kind === 'apple' ? 1 + (.027 + .055 * Math.min(1, Math.abs(y / .14))) * Math.cos(5 * a)
      : kind === 'orange' ? 1 + .023 * Math.sin(3 * a + y * 6) : 1;
    const cheek = (kind === 'cherry' || kind === 'mango') ? 1 - .115 * Math.max(0, Math.cos(a)) ** 9 : 1;
    return [fruitAxis(kind, y) + x * lobe * cheek, y, z * lobe * (kind === 'mango' ? .84 : kind === 'pear' ? .94 : 1)];
  });
  const g = skin.geometry(), p = g.getAttribute('position'), rgb: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i), strength = Math.max(0, z * 7 + .15 * Math.sin(azimuth)) * Math.max(0, .48 + y * 2);
    rgb.push(1, 1 - Math.min(.16, strength * .27), 1 - Math.min(.22, strength * .34));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3)); return g;
}

const habit = {
  cherry: { spread: 1.26, top: 3.98, sweep: .72, blade: .33, width: .092, rim: margin.cherry },
  orange: { spread: 1.00, top: 4.05, sweep: .58, blade: .30, width: .106, rim: margin.oval },
  mango: { spread: 1.36, top: 3.72, sweep: .81, blade: .465, width: .084, rim: margin.lance },
  apple: { spread: 1.21, top: 3.58, sweep: .72, blade: .33, width: .118, rim: margin.ovate },
  pear: { spread: .78, top: 4.31, sweep: .48, blade: .35, width: .10, rim: margin.ovate },
  lemon: { spread: 1.12, top: 3.89, sweep: .56, blade: .34, width: .089, rim: margin.lance },
};
interface TreePalette { bark: THREE.Material; leaf: THREE.Material; stalk: THREE.Material; wood: THREE.Material; fruit: THREE.Material }
/** Six scaffolds, each splitting into two bearing arms with attached leafy
 * laterals and pendant fruiting spurs. The centre stays open in a vase cherry;
 * the pear's leaders instead come back up close to its trunk. */
export function addVillaOrchardTree(b: VillaModelBuilder, species: VillaFruitSpecies, s: number, phase: number, paint: TreePalette) {
  const art = new NaturePalette(), wood = art.get(paint.bark), foliage = art.get(paint.leaf), young = art.get(paint.stalk), ridges = art.get(paint.wood);
  const shape = habit[species];
  const trunk: P3[] = [[0, -.03, 0], [.018, .23, -.014], [-.026, .73, .035], [.028, 1.23, .012], [-.02, 1.68, -.015], [.028, 2.02, .032], [.053, 2.32, -.013]];
  const radius = [.234, .203, .157, .138, .115, .087, .047];
  wood.stem(trunk.map((p, i) => collar(p, radius[i])), 14, .11, phase);
  // Roots swell out of the actual lean of the lower bole; creases fork rather
  // than forming identical parallel stripes all the way around its cylinder.
  for (let i = 0; i < 7; i++) {
    const a = i * turn / 7 + phase, foot = polar(a + .24, .40 + .06 * Math.sin(a), -.015);
    wood.stem([collar(add3(trunk[2], polar(a, .08, 0)), .060), collar(polar(a + .1, .183, .20), .074), collar(foot, .023)], 5, .18, 0, true);
    const start = polar(a, .193, .19), mid = add3(trunk[2], polar(a + .23, .154, 0));
    ridges.stem([collar(start, .014), collar(mid, .018), collar(add3(trunk[3], polar(a + .12, .133, 0)), .006)], 4);
    if (i % 2 === 0) ridges.stem([collar(mid, .012), collar(add3(trunk[3], polar(a + .58, .13, 0)), .004)], 4);
  }
  const spray = (base: P3, mid: P3, tip: P3, a: number, count: number, scale: number) => {
    young.stem([collar(base, .017 * scale), collar(mid, .012 * scale), collar(tip, .004)], 3, 0, 0, true);
    for (let k = 0; k < count; k++) {
      const t = .09 + .91 * (k + .5) / count, side = k % 2 ? 1 : -1;
      const p = t < .5 ? mix3(base, mid, t * 2) : mix3(mid, tip, t * 2 - 1);
      const dir = a + side * (1.38 - .68 * t + .18 * Math.cos(k + phase)), len = shape.blade * scale * (.83 + .22 * Math.cos(k * 2 + a));
      const pendent = species === 'mango' ? -.36 - .58 * t : -.33 + .46 * Math.sin(a + k * 1.19);
      foliage.tone = .81 + .16 * t + .12 * Math.sin(k * 2.71 + a);
      foliage.blade(p, polar(dir, len, pendent * len), shape.width * scale * (.84 + .18 * t), shape.rim,
        len * .22, side * (.27 + .62 * Math.cos(a + k)), -.20, len * .05);
    }
  };
  for (let i = 0; i < 6; i++) {
    const axis = (i * 2 + .5) * Math.PI / 6, variation = Math.sin(axis * 2 + phase);
    const trunkSegment = 3 + i % 3, root = mix3(trunk[trunkSegment], trunk[trunkSegment + 1], .27 + .16 * Math.sin(i));
    const elbow = polar(axis - .18, shape.spread * .36, 2.31 + variation * .095);
    const crotch = polar(axis + .09, shape.spread * .67, 2.72 + variation * .20);
    wood.stem([collar(root, .092), collar(elbow, .078), collar(crotch, .046)], 7, .07, 0, true);
    for (let j = 0; j < 2; j++) {
      const index = 2 * i + j, a = index * Math.PI / 6, r = 1.02 + (index % 2) * .22, py = 2.12 + index % 3 * .24;
      const arm = polar(a, shape.spread, 2.96 + variation * .19 + j * .11);
      const fruitSpur = polar(a, r * .90, py + .48);
      wood.stem([collar(crotch, .049), collar(arm, .035), collar(fruitSpur, .019)], 5, .06, 0, true);
      for (let k = 0; k < 3; k++) {
        const dir = a + (k - 1) * .91, start = k === 0 ? crotch : k === 1 ? mix3(crotch, arm, .68) : fruitSpur;
        const rad = (k === 0 ? (species === 'cherry' ? .87 : .38) : k === 1 ? shape.spread * .93 : shape.spread * 1.24);
        const h = k === 0 ? shape.top + variation * .17 : k === 1 ? shape.top - .27 + .17 * Math.sin(index) : 2.82 + variation * .18;
        const fork = polar(dir, rad, h - .23);
        wood.stem([collar(start, .026), collar(fork, .012)], 4, 0, 0, true);
        const dir2 = dir + (j ? -.19 : .25);
        const tip = add3(fork, polar(dir2, shape.sweep * (k === 0 ? .70 : .84), k === 0 ? .33 : k === 1 ? .12 : -.21));
        spray(fork, add3(mix3(fork, tip, .48), [0, .066, 0]), tip, dir2, 6, 1.07);
        // A crossing side spray fills the shoulder and exposes the midribs from
        // below. The stub starts halfway along the woody fork, never in the air.
        if (k === 0) {
          const sideBase = mix3(start, fork, .50), da = dir + (j ? -1 : 1) * .88;
          const sideTip = add3(sideBase, polar(da, shape.sweep * .74, .14));
          spray(sideBase, add3(mix3(sideBase, sideTip, .5), [0, .055, 0]), sideTip, da, 4, .96);
        }
      }
      for (let f = 0; f < 2; f++) {
        const offset = (f ? 1 : -1) * (species === 'cherry' ? .12 : .24), pos = polar(a, r + offset, py + f * .11);
        const g = orchardFruitSkin(species, a + f * .3); g.rotateY(a); g.translate(...pos); g.scale(s, s, s); b.geometry(g, paint.fruit);
        const capY = profiles[species][profiles[species].length - 1][0], ax = fruitAxis(species, capY);
        const cap = add3(pos, [Math.cos(a) * ax, capY, -Math.sin(a) * ax]);
        const kink = add3(mix3(fruitSpur, cap, .59), polar(a + .36, .024, -.011));
        young.stem([collar(fruitSpur, species === 'cherry' ? .008 : .013), collar(kink, .009), collar(cap, .010)], 4, 0, 0, true);
        if (species === 'orange' || species === 'lemon') for (let sepal = 0; sepal < 4; sepal++) {
          young.blade(cap, polar(a + sepal * Math.PI / 2, .051, -.003), .012, margin.spur, .005);
        }
      }
    }
  }
  art.finish(b, s);
}
