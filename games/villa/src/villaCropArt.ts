import type * as THREE from 'three';
import { NaturePalette, add3, collar, margin, mix3, polar, turn, type P3 } from './villaNatureGeometry.js';
import type { VillaModelBuilder } from './villaModel.js';
import type { VILLA_FLOWER_SPECIES, VILLA_VEGETABLE_SPECIES } from './villaGarden.js';

type Flower = typeof VILLA_FLOWER_SPECIES[number];
export interface CropPaint {
  green: THREE.Material; light: THREE.Material; pink: THREE.Material; purple: THREE.Material;
  blue: THREE.Material; white: THREE.Material; gold: THREE.Material; rust: THREE.Material; dark: THREE.Material; plum: THREE.Material;
}
const scale3 = (p: P3, s: number): P3 => [p[0] * s, p[1] * s, p[2] * s];
/** Real offset receptacle/sepal collar. Disk petal angles are measured in the
 * flower's own plane, not world Y (upright sunflowers turn toward the terrace). */
export function addVillaBloom(art: NaturePalette, species: Flower, paint: CropPaint, h: number, phase: number) {
  const green = art.get(paint.green), light = art.get(paint.light);
  const base: P3 = [0, -.015, 0], elbow = polar(phase, .018, h * .56), head = polar(phase + .19, .037, h);
  green.stem([collar(base, species === 'sunflower' ? .016 : .011), collar(elbow, .011), collar(head, .009)], 5);
  for (let i = 0; i < (species === 'tulip' ? 3 : 4); i++) {
    const a = phase + i * 2.4, p = species === 'tulip' ? mix3(base, elbow, .15 + i * .12) : mix3(base, elbow, .46 + i * .17);
    if (species === 'rose') {
      const tip = add3(p, polar(a, .145, .062)); green.stem([collar(p, .006), collar(tip, .003)], 4);
      for (let j = 0; j < 5; j++) green.blade(mix3(p, tip, .32 + .15 * j), polar(a + (j % 2 ? -.89 : .89), .081, .026), .029, margin.cherry, .013);
      if (i < 2) green.blade(p, polar(a + Math.PI, .022, -.035), .010, margin.spur);
    } else if (species === 'tulip') light.blade(p, polar(a, .12, h * (.65 + .13 * Math.sin(a))), .049, margin.strap, .044, .28, .45);
    else green.blade(p, polar(a, species === 'lavender' ? .095 : .18, species === 'lavender' ? .09 : .065), species === 'lavender' ? .013 : .064,
      species === 'hydrangea' ? margin.cherry : margin.ovate, .032, .37 * Math.cos(a), -.25);
  }
  if (species === 'lavender') {
    for (let j = 0; j < 3; j++) {
      const a = phase + j * 2.4, start = mix3(base, elbow, .43), tip = j === 0 ? head : add3(head, polar(a, .091, -.045 * j));
      green.stem([collar(start, .006), collar(tip, .003)], 4);
      for (let k = 0; k < 5; k++) {
        const p = mix3(start, tip, .64 + .085 * k);
        for (let v = 0; v < 3; v++) {
          const dir = a + turn * v / 3 + k * 2.11, bloom = art.get(j % 3 === 0 ? paint.blue : paint.purple);
          bloom.blade(p, polar(dir, .029 - .003 * k, .026), .014, margin.lance, .003, 0, .42);
        }
      }
    }
  } else if (species === 'hydrangea') {
    const joint = add3(head, [0, -.07, 0]);
    for (let j = 0; j < 9; j++) {
      const a = j * 2.399 + phase, r = .152 * Math.sqrt(j / 9), p = add3(head, polar(a, r, .10 * (1 - (r / .16) ** 2)));
      green.stem([collar(joint, .006), collar(p, .0035)], 3, 0, 0, true);
      for (let k = 0; k < 4; k++) art.get(j % 5 ? paint.blue : paint.purple).blade(p, polar(a + k * Math.PI / 2, .040, .018 - .026 * Math.cos(k * Math.PI / 2)), .020, margin.petal, .006, .14, .30);
      art.get(paint.white).blade(p, [0, .020, .001], .007, margin.ovate);
    }
  } else if (species === 'rose' || species === 'tulip') {
    const tulip = species === 'tulip';
    for (let i = 0; i < 5; i++) green.blade(add3(head, [0, -.018, 0]), polar(phase + turn * i / 5, .073, .038), .019, margin.lance, .003);
    const rings = tulip ? 2 : 3;
    for (let ring = 0; ring < rings; ring++) {
      const n = tulip ? 3 : 5 - ring, opening = tulip ? .076 - .017 * ring : .104 - .033 * ring;
      for (let j = 0; j < n; j++) {
        const a = phase + j * turn / n + ring * (tulip ? Math.PI / 3 : 1.2);
        const petal = art.get(tulip ? Math.cos(phase) < 0 ? paint.gold : paint.pink : ring === 2 ? paint.rust : paint.pink);
        petal.tone = .90 + ring * .055 + j * .015;
        petal.blade(add3(head, polar(a, .006 + .004 * ring, .009 * ring)), polar(a + (tulip ? 0 : .60), opening, tulip ? .134 + .021 * ring : .062 + .018 * ring),
          tulip ? .060 - .009 * ring : .057 - .009 * ring, margin.petal, -.029, tulip ? .12 : .46, .64, tulip ? .001 : .018);
      }
    }
  } else {
    const sun = species === 'sunflower', radius = sun ? .100 : .042;
    const normal: P3 = sun ? [.05 * Math.sin(phase), .31, -.95] : [.10 * Math.cos(phase), .986, .11];
    const u: P3 = [1, 0, 0], v: P3 = [0, -normal[2], normal[1]];
    const ray = (a: number, r: number): P3 => add3(scale3(u, Math.cos(a) * r), scale3(v, Math.sin(a) * r));
    const disk = art.get(sun ? paint.dark : paint.gold);
    disk.round([[-.018, 0], [-.013, radius * .7], [.003, radius], [.015, radius * .76], [.024, 0]], sun ? 16 : 12,
      (x, y, z) => add3(head, add3(add3(scale3(u, x), scale3(v, z)), scale3(normal, y))));
    for (let j = 0; j < (sun ? 20 : 13); j++) {
      const a = j * 2.399 + phase, start = add3(head, ray(a, radius * .77));
      art.get(sun ? paint.gold : paint.white).blade(start, add3(ray(a + .10, sun ? .107 + .028 * (j % 2) : .085), scale3(normal, .015)),
        sun ? .026 : .015, sun ? margin.lance : margin.petal, .018, .28 * Math.sin(j), .23, 0, normal);
    }
    for (let j = 0; j < (sun ? 21 : 7); j++) {
      const a = j * 2.399, t = Math.sqrt(j / (sun ? 21 : 7)) * .92, p = add3(add3(head, ray(a, t * radius)), scale3(normal, .023 - t * .017));
      art.get(sun ? paint.rust : paint.gold).blade(p, add3(scale3(normal, .008), ray(a, .002)), sun ? .004 : .003, margin.spur);
    }
  }
}

/** Folded/heavily cupped leaves tightly pack around a visible heart. */
export function addVillaRosette(art: NaturePalette, base: P3, leaf: THREE.Material, heart: THREE.Material, phase: number, size: number, cabbage = false) {
  for (let i = 0; i < 11; i++) {
    const a = phase + i * 2.399, t = i / 10, width = (.09 - t * .031) * size;
    const p = add3(base, polar(a, .012, (.028 + t * .045) * size)), end = polar(a, (.187 - .142 * t) * size, (.073 + .088 * t) * size);
    const m = art.get(i < 5 ? leaf : heart); m.tone = .90 + .09 * Math.cos(i * 1.71);
    m.blade(p, end, width, cabbage ? margin.ovate : margin.ruffle, (cabbage ? .042 : .018) * size, .32 * Math.sin(i), .66, .012 * size);
  }
}
export function addVillaKitchenCrop(art: NaturePalette, species: typeof VILLA_VEGETABLE_SPECIES[number], paint: CropPaint, phase: number) {
  const green = art.get(paint.green), light = art.get(paint.light);
  if (species === 'lettuce') { addVillaRosette(art, [0, -.01, 0], paint.green, paint.light, phase, 1); return; }
  if (species === 'carrot') {
    art.get(paint.rust).round([[-.14, 0], [-.095, .019], [-.048, .041], [.015, .063], [.046, .057], [.056, .03], [.049, 0]], 8,
      (x, y, z) => [x + .1 * y, y, z]);
    for (let j = 0; j < 5; j++) {
      const a = phase + j * 2.399, base: P3 = [0, .045, 0], tip = polar(a, .105 + .031 * (j % 2), .29 + .04 * Math.sin(j + phase));
      green.stem([collar(base, .007), collar(tip, .002)], 3, 0, 0, true);
      for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
        const p = mix3(base, tip, .31 + k * .17), dir = a + side * .86, end = add3(p, polar(dir, .077 - .010 * k, .033));
        light.blade(p, polar(dir, .078 - .010 * k, .034), .009, margin.lance);
        for (let n = 0; n < 2; n++) light.blade(mix3(p, end, .38 + n * .30), polar(dir + (n % 2 ? -.8 : .8), .033, .016), .0065, margin.spur);
      }
    }
    return;
  }
  const egg = species === 'eggplant', top = egg ? .61 : 1.06, base: P3 = [0, -.045, 0], elbow: P3 = [.035 * Math.cos(phase), top * .55, .045], tip: P3 = [.061 * Math.sin(phase), top, -.08];
  green.stem([collar(base, .018), collar(elbow, .014), collar(tip, .007)], 5);
  for (let j = 0; j < 5; j++) {
    const a = phase + j * 2.399, p = j < 3 ? mix3(base, elbow, .35 + .27 * j) : mix3(elbow, tip, .2 + (j - 3) * .50);
    const end = add3(p, polar(a, egg ? .20 : .17, .047));
    green.stem([collar(p, .007), collar(end, .004)], 4);
    if (egg) light.blade(mix3(p, end, .31), polar(a, .205, -.044), .090, margin.ruffle, .056, .24);
    else for (let n = 0; n < 5; n++) light.blade(mix3(p, end, .21 + n * .17), polar(a + (n % 2 ? -.9 : .9), .098, -.02), .032, margin.cherry, .012);
  }
  for (let j = 0; j < 3; j++) {
    const p = j < 2 ? mix3(base, elbow, .70 + .25 * j) : mix3(elbow, tip, .65), a = phase + j * 2.399;
    const cap = add3(p, polar(a, .113, egg ? .034 : -.030)), bend = add3(p, polar(a, .072, .048));
    green.stem([collar(p, .008), collar(bend, .006), collar(cap, .007)], 4);
    const shape = egg ? [[-.221, 0], [-.203, .046], [-.152, .075], [-.084, .068], [-.036, .045], [-.006, .031], [0, 0]] as const
      : [[-.15, 0], [-.135, .050], [-.091, .082], [-.042, .081], [-.009, .061], [0, 0]] as const;
    art.get(egg ? paint.plum : paint.rust).round(shape, egg ? 10 : 12, (x, y, z, angle) => {
      const lobe = egg ? 1 : 1 + .056 * Math.cos(angle * 5); return add3(cap, [x * lobe + .13 * y, y, z * lobe]);
    });
    for (let n = 0; n < 5; n++) green.blade(cap, polar(a + n * turn / 5, egg ? .046 : .058, egg ? -.043 : -.012), egg ? .021 : .009, margin.lance, egg ? .002 : .011);
  }
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
