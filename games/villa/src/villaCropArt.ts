import type * as THREE from 'three';
import { NaturePalette, add3, collar, margin, mix3, polar, type P3 } from './villaNatureGeometry.js';
import type { VillaModelBuilder } from './villaModel.js';
import type { VILLA_FLOWER_SPECIES, VILLA_VEGETABLE_SPECIES } from './villaGarden.js';
import { addButterhead, growKitchenPlant } from './villaHorticultureCrops.js';
import { growGardenBloom } from './villaHorticultureFlowers.js';

type Flower = typeof VILLA_FLOWER_SPECIES[number];
export interface CropPaint {
  green: THREE.Material; light: THREE.Material; pink: THREE.Material; purple: THREE.Material;
  blue: THREE.Material; white: THREE.Material; gold: THREE.Material; rust: THREE.Material; dark: THREE.Material; plum: THREE.Material;
  /** Neutral, vertex-pigmented batch for the changing skins of developing produce. */
  produce?: THREE.Material;
}
export function addVillaBloom(art: NaturePalette, species: Flower, paint: CropPaint, h: number, phase: number, opening = .72, companions = false) {
  growGardenBloom(art, species, paint, h, phase, opening, companions);
}

export function addVillaRosette(art: NaturePalette, base: P3, leaf: THREE.Material, heart: THREE.Material, phase: number, size: number, cabbage = false) {
  if (!cabbage) { addButterhead(art, base, leaf, heart, phase, size, .77); return; }
  // Distant estate field keeps its compact cabbage heads and original budget;
  // these aren't the spreading soft-leaf lettuces in the raised kitchen bed.
  for (let i = 0; i < 11; i++) {
    const a = phase + i * 2.399, t = i / 10, width = (.09 - t * .031) * size;
    const p = add3(base, polar(a, .012, (.028 + t * .045) * size)), end = polar(a, (.187 - .142 * t) * size, (.073 + .088 * t) * size);
    const m = art.get(i < 5 ? leaf : heart); m.tone = .90 + .09 * Math.cos(i * 1.71);
    m.blade(p, end, width, margin.ovate, .042 * size, .32 * Math.sin(i), .66, .012 * size);
  }
}
export function addVillaKitchenCrop(art: NaturePalette, species: typeof VILLA_VEGETABLE_SPECIES[number], paint: CropPaint, phase: number,
  stage = .64 + .30 * Math.cos(phase), railZ = 0): P3[] {
  return growKitchenPlant(art, species, paint, phase, stage, railZ);
}

export function addVillaFieldCorn(b: VillaModelBuilder, leaf: THREE.Material, ear: THREE.Material, phase: number) {
  const art = new NaturePalette(), stalk = art.get(leaf), grain = art.get(ear);
  const nodes: P3[] = [[0, .025, 0], [.013, .36, .013], [.028, .62, .014], [.036, .88, .004], [.045, 1.13, -.013]];
  stalk.stem(nodes.map((p, i) => collar(p, .025 - .0036 * i)), 6);
  for (let i = 0; i < 6; i++) {
    const a = phase + i * 2.83, p = mix3(nodes[Math.floor(i / 2)], nodes[Math.floor(i / 2) + 1], i % 2 ? .85 : .42);
    stalk.blade(p, polar(a, .29 + .08 * Math.sin(a), .15 - .068 * (i % 3)), .044, margin.strap, .12, .50 * Math.sin(a), -.26);
  }
  const p = nodes[2], end = add3(p, polar(phase, .094, .25));
  grain.round([[0, 0], [.032, .034], [.082, .042], [.175, .033], [.218, .021], [.239, 0]], 8,
    (x, y, z) => add3(mix3(p, end, y / .25), [x, 0, z]));
  for (let i = 0; i < 3; i++) stalk.blade(p, polar(phase + (i - 1) * .62, .100, .183 + i * .029), .038, margin.strap, .018, .25, .58);
  for (let i = 0; i < 5; i++) {
    const a = phase + i * 2.399, tip = add3(nodes[4], polar(a, .095 - .014 * i, .16 + .016 * i));
    grain.stem([collar(nodes[4], .005), collar(tip, .002)], 4);
    for (let j = 1; j < 4; j++) grain.blade(mix3(nodes[4], tip, j / 4), polar(a + .6, .023, .030), .006, margin.spur);
  }
  art.finish(b);
}
