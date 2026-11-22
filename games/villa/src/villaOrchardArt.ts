import type * as THREE from 'three';
import type { VillaFruitSpecies } from './villaGarden.js';
import type { VillaModelBuilder } from './villaModel.js';
import { NaturePalette, add3, collar, mix3, polar, stemAtHeight, turn, type P3 } from './villaNatureGeometry.js';
import { bearFruit, fruitRadius, fruitSeat, fruitTop } from './villaOrchardFruit.js';
import { onBough, orchardBough, orchardSprig } from './villaOrchardGrowth.js';
import { finishOrchardSurfaces, orchardRandom, orchardSpecies } from './villaOrchardSurface.js';
export { orchardFruitSkin } from './villaOrchardFruit.js';

// Bole and crown dimensions in metres. An open cherry / goblet apple have
// shortened central axes. A pear climbs one leader; mango spreads on lowered
// laterals; orange carries a much tighter collar of evergreen wood than lemon.
const habit = {
  cherry: { arms: 5, leader: 2.29, spread: 1.68, rise: 1.39, skirt: 1.09, top: 4.80, stem: .172, dip: .18, years: 5, tilt: .45 },
  orange: { arms: 6, leader: 2.64, spread: 1.29, rise: 1.07, skirt: .87, top: 3.62, stem: .154, dip: .11, years: 5, tilt: .59 },
  mango:  { arms: 5, leader: 2.53, spread: 1.87, rise: 1.11, skirt: 1.12, top: 4.83, stem: .198, dip: .27, years: 5, tilt: .34 },
  apple:  { arms: 5, leader: 2.01, spread: 1.62, rise: 1.06, skirt: .98, top: 3.33, stem: .181, dip: .13, years: 5, tilt: .43 },
  pear:   { arms: 7, leader: 3.15, spread: 1.05, rise: 1.22, skirt: 1.23, top: 4.56, stem: .149, dip: .07, years: 4, tilt: .76 },
  lemon:  { arms: 5, leader: 2.51, spread: 1.46, rise: 1.16, skirt: .98, top: 3.87, stem: .147, dip: .15, years: 4, tilt: .58 },
} as const;
interface TreePalette { bark: THREE.MeshStandardMaterial; leaf: THREE.MeshStandardMaterial; stalk: THREE.Material; fruit: THREE.MeshStandardMaterial; wood?: THREE.Material }
interface Site { base: P3; priority: number; direction: number }

/** Growth is inherited from the parent *branch*, not from a radius around the
 * tree's origin. Thus gaps extend into the canopy, loads hang at different
 * depths, and the shoots at a fork share a rind but not a pose. */
export function addVillaOrchardTree(b: VillaModelBuilder, species: VillaFruitSpecies, s: number, phase: number, paint: TreePalette) {
  const h = habit[species], rand = orchardRandom(0x63a19 + 7937 * orchardSpecies.indexOf(species) + Math.round(phase * 16411));
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand(), sign = () => rand() < .5 ? -1 : 1;
  finishOrchardSurfaces(species, paint.bark, paint.leaf);
  paint.fruit.roughness = species === 'cherry' || species === 'apple' ? .56 : .74;
  const art = new NaturePalette(), wood = art.get(paint.bark), leaf = art.get(paint.leaf), young = art.get(paint.stalk), fruit = art.get(paint.fruit);
  const stem = h.stem * between(.92, 1.09), yaw = between(0, turn), lean = between(.12, .29);
  const trunk: P3[] = [[0, -.038, 0], polar(yaw - 1.3, .009, .074), polar(yaw - 1.24, .022, .28), polar(yaw - .91, lean * .49, .73),
    polar(yaw + .23, lean * .80, 1.12), polar(yaw + .39, lean * .76, h.leader * .73), polar(yaw - .23, lean, h.leader * .89),
    polar(yaw - .52, lean * 1.19, h.leader)];
  orchardBough(wood, species, trunk, [1.58, 1.42, 1.09, .98, .88, .72, .45, .16].map(r => r * stem), 14, s, yaw, true);
  for (let k = 0; k < 6; k++) {
    const a = yaw + k * turn / 6 + between(-.32, .28), toe = between(.38, .54), twist = between(-.30, .34);
    const start = add3(trunk[2], polar(a, stem * .65, between(.006, .17)));
    orchardBough(wood, species, [start, polar(a + twist * .49, stem * 1.12, .13), polar(a + twist, toe * .79, .028), polar(a + twist * .76, toe, -.027)],
      [stem * .34, stem * .45, stem * .24, .013], 6, s, a);
  }
  const sites: Site[] = [];
  // An older twig carries regularly spaced buds, *not* a tuft glued at its
  // final point. Each live bud has a separate local turn, pitch, roll and age.
  const growth = (base: P3, a: number, extension: number, lift: number, sun: number) => {
    const d = between(-.35, .35), knee = add3(base, polar(a - d, extension * .48, lift * .49 + between(.017, .073)));
    const end = add3(base, polar(a + d, extension, lift));
    const twig = [base, knee, end]; young.tone = between(.63, .92);
    young.stem([collar(base, between(.0059, .0094)), collar(knee, .0048), collar(end, 0)], 3, 0, 0, true);
    const count = rand() < .29 ? 4 : 3, hand = sign(), flush = rand() < (species === 'mango' ? .16 : .22) ? between(.41, .89) : between(0, .27);
    for (let j = 0; j < count; j++) {
      const t = j === count - 1 ? .99 : (.04 + (j + rand() * .34) / count), side = j % 2 ? -hand : hand;
      const dir = a + (j === count - 1 ? between(-.40, .40) : side * between(.69, 1.80));
      const pitch = between(-.42, .90) + .36 * sun - (species === 'mango' ? .55 : .06);
      orchardSprig(leaf, species, onBough(twig, t), dir, pitch, between(.82, 1.17) / Math.sqrt(s), Math.floor(rand() * 3), flush, rand);
    }
    for (let j = 0, n = rand() < .45 ? 2 : 1; j < n; j++) {
      // Single leaves turning across the larger sprays, including young,
      // translucent-looking unfurling foliage and tougher shaded basal leaves.
      orchardSprig(leaf, species, onBough(twig, between(.13, .89)), a + sign() * between(.78, 2.52), between(-.98, .71),
        between(.75, 1.13) / Math.sqrt(s), 3, rand() < .28 ? .92 : flush, rand);
    }
  };
  const crownBias = polar(yaw + between(-1, 1), between(.11, .29), 0);
  const heavySide = between(0, turn);
  for (let i = 0; i < h.arms; i++) {
    const u = (i + rand() * .29) / h.arms, a = yaw + i * 2.39996 + between(-.52, .49), bend = between(-.36, .34);
    const root = stemAtHeight(trunk, h.skirt + (h.leader - h.skirt) * u);
    // Two codominant limbs resume strongly above the shade cultivars' lower
    // laterals. Their split starts down in the bough, not on a pole at the top.
    const leader = (species === 'mango' || species === 'cherry') && (i === 1 || i === 4) ? between(.66, 1.06) : 0;
    const long = h.spread * between(.67, .97) * (1 - (species === 'pear' ? .67 : .36) * u), rise = h.rise * between(.73, 1.15) + u * .20;
    const shoulder = add3(root, polar(a - bend, long * .23, rise * between(.28, .52) + leader * .12));
    const elbow = add3(root, polar(a + .03, long * .65, rise * between(.60, .83) + leader * .43));
    const end = add3(add3(root, polar(a + bend, long * (1 - leader * .17), rise + leader)), crownBias), limb = [root, shoulder, elbow, end];
    const r = stem * (.61 - .22 * u) * between(.88, 1.05);
    orchardBough(wood, species, limb, [r, r * .77, r * .54, r * .22], 8, s, a);
    const arms = h.years + (rand() < .55 ? 1 : 0), hand = sign(), stock = between(.7, 1.2);
    for (let j = 0; j < arms; j++) {
      const q = (.50 + j + rand() * .42) / arms, root2 = onBough(limb, q), side = (j % 2 ? 1 : -1) * hand;
      const dir = a + bend * q + side * between(.48, 1.37), reach = stock * between(.37, .67) * (species === 'pear' ? .84 : 1);
      const climb = h.tilt * between(.47, 1.34) + between(-.10, .20) - h.dip * (1 - q) + leader * (j >= arms - 2 ? .37 : .11);
      const crook = add3(root2, polar(dir + between(-.28, .28), reach * .54, climb * .6 + between(.036, .13)));
      const tip = add3(root2, polar(dir, reach, climb)), arm = [root2, crook, tip];
      orchardBough(wood, species, arm, [r * between(.34, .47), r * .24, .0062], 5, s, dir);
      const off = sign(), branches = 3 + (rand() < .65 ? 1 : 0);
      for (let k = 0; k < branches; k++) {
        const t = (.14 + k + rand() * .61) / branches, node = onBough(arm, t), hi = Math.max(0, Math.min(1, (node[1] - 2.05) / 1.48));
        const da = dir + off * (k % 2 ? 1 : -1) * between(.50, 1.86), droop = between(-.21, .40) + h.tilt * .26 - h.dip * .55;
        // Short basal fruiting spur, mid-length lateral, longer extension.
        // This fills the bearing wood itself rather than leaving bare spokes
        // between distant tassels. The longest runs carry independent fan tips.
        const run = k === 0 ? between(.10, .21) : k === branches - 1 ? between(.26, .48) : between(.19, .35);
        growth(node, da, run * (species === 'pear' ? .77 : 1), Math.min(h.top - .18 - node[1], droop * (k === 0 ? .55 : 1)), hi);
        // On loaded wood several nearby spurs fruit. Other wood is entirely
        // vegetative, including most strongly upright watershoots.
        if (node[1] * s > (species === 'mango' ? 1.98 : species === 'cherry' ? 1.70 : 1.78) && node[1] * s < 3.48 && node[1] < h.top - .15) sites.push({ base: node, direction: da,
          priority: rand() + .31 * Math.cos(heavySide - a) + .11 * Math.sin(j + yaw) - .13 * hi });
      }
      growth(tip, dir + between(-.37, .37), between(.21, .50), Math.min(h.top - tip[1] - .12, between(-.18, .34) + .13 * u), u);
    }
    // Inner shoulder and renewed upright shoots occupy the interstices of
    // successive scaffold forks instead of making a hollow outer shell.
    growth(onBough(limb, between(.21, .40)), a + hand * between(1.15, 2.55), between(.14, .26), between(.23, .50), .55);
    growth(onBough(limb, between(.56, .82)), a - hand * between(1.10, 2.48), between(.14, .25), between(.10, .31), .46);
    growth(end, a + between(-.57, .58), between(.20, .45), Math.min(h.top - .19 - end[1], between(.16, .58)), .92);
  }
  if (species !== 'cherry' && species !== 'apple') {
    for (let k = 0; k < 4; k++) growth(onBough(trunk, .77 + k * .07), yaw + k * 2.2, between(.18, .47), between(.35, .66), .88);
  }

  sites.sort((a, b) => b.priority - a.priority);
  const goal = Math.floor(between(species === 'cherry' ? 18 : 12, species === 'cherry' ? 25 : 19));
  let clusters = 0, minY = Infinity, maxY = -Infinity;
  const borne: { p: P3; radius: number }[] = [], rFruit = fruitRadius(species);
  for (const site of sites) {
    if (clusters >= goal) break;
    const a = site.direction, origin = site.base, stalkLen = (species === 'mango' ? between(.075, .17) : species === 'cherry' ? between(.031, .057) : between(.015, .039)) / s;
    const betweenFruit = species === 'cherry' ? between(.015, .019) : rFruit * 1.08;
    const count = species === 'cherry' ? (rand() < .31 ? 3 : 2) : species === 'apple' || species === 'pear' ? (rand() < .19 ? 2 : 1) : 1;
    let set = false;
    for (let f = 0; f < count; f++) {
      const angle = a + f / count * turn + between(-.14, .14), size = between(.86, 1.11) / s, yawFruit = between(0, turn);
      const offset = (count > 1 ? betweenFruit : .008) / s, pos = add3(origin, polar(angle, offset, -stalkLen - fruitTop(species) * size - .005 * f));
      if (borne.some(({ p, radius }) => Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]) < (rFruit * size + radius) * 1.015)) continue;
      const range = bearFruit(fruit, species, pos, yawFruit, size, between(.30, .96));
      minY = Math.min(minY, range[0] * s); maxY = Math.max(maxY, range[1] * s);
      const cap = fruitSeat(species, pos, yawFruit, size), kink = add3(mix3(origin, cap, .51), polar(a + .46, .0034 / s, 0));
      const ped = (species === 'cherry' ? .00135 : species === 'mango' ? .0034 : .0021) / s;
      young.tone = between(.71, .94); young.stem([collar(origin, ped * 1.12), collar(kink, ped), collar(cap, 0)], 3, 0, 0, true);
      borne.push({ p: pos, radius: rFruit * size }); set = true;
    }
    if (set) clusters++;
  }
  art.finish(b, s);
  return { fruitClusters: clusters, fruitHeight: [minY, maxY] as [number, number] };
}
