import type * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import type { VillaLandscapeTreeKind } from './villaStream.js';
import { NaturePalette, add3, collar, margin, mix3, polar, stemAtHeight, turn, type P3 } from './villaNatureGeometry.js';
import { SHOOT, woodRandom } from './villaTreelineAtlas.js';
import { TreeForm, type WoodlandPaint } from './villaTreelineForms.js';

type Paint = THREE.Material;
const golden = 2.39996323;
const distance = (p: P3, q: P3) => (p[0] - q[0]) ** 2 + ((p[1] - q[1]) * .77) ** 2 + (p[2] - q[2]) ** 2;
const mean = (points: P3[]): P3 => points.reduce<P3>((p, q) => [p[0] + q[0] / points.length, p[1] + q[1] / points.length, p[2] + q[2] / points.length], [0, 0, 0]);
const heading = (p: P3, q: P3) => Math.atan2(q[2] - p[2], q[0] - p[0]);

/** Mature oak. Outer shoots occupy a wind-sheared light volume. A branch takes
 * the buds nearest its scaffold; each occupied group bifurcates again toward
 * its two most distant poles. Thus even opposite sides of one crown do not
 * share a template, and a branch carries the weight of its own actual sprays. */
function oak(art: TreeForm, phase: number, paints: WoodlandPaint) {
  const rand = woodRandom(phase + 9.6), h = 6.05 + rand() * 2.25, a = phase + rand() * turn;
  const path: P3[] = [[0, -.12, 0], polar(a - .53, .11, .55), polar(a + .33, .24 + .18 * rand(), h * .29),
    polar(a, .33 + rand() * .31, h * .53), polar(a + .52, .47, h * .71), polar(a + .21, .82, h * .88)];
  art.tube(paints.bark, path.map((p, i) => collar(p, [.34, .27, .221, .15, .080, .012][i])), 6, .13, phase);
  const scaffolds = Array.from({ length: 5 }, (_, j) => {
    const f = j / 4, az = phase + j * golden + .7 * rand();
    return { direction: az, heel: stemAtHeight(path, h * (.235 + .46 * f)),
      beacon: add3(polar(a, .42, 0), polar(az, 2.1 - .83 * f, h * (.52 + .39 * f))), buds: [] as P3[] };
  });
  for (let j = 0; j < 24; j++) {
    const t = (j + rand()) / 24, az = phase - .36 + j * golden + (rand() - .5) * .76;
    const reach = (1.20 + 1.55 * rand()) * (.60 + .47 * Math.sin((t * .89 + .11) * Math.PI));
    const bud = add3(polar(a, .11 + t * .87, 0), polar(az, reach, h * (.44 + .57 * t)));
    let best = scaffolds[0]; for (const s of scaffolds) if (distance(s.beacon, bud) < distance(best.beacon, bud)) best = s;
    best.buds.push(bud);
  }
  for (const s of scaffolds) {
    if (!s.buds.length) continue;
    const target = mean(s.buds), bend = add3(mix3(s.heel, target, .31), polar(s.direction -.77, .18, .33));
    const knuckle = add3(mix3(s.heel, target, .57), polar(s.direction + .34, .15, -.11));
    art.tube(paints.bark, [collar(s.heel, .079 + s.buds.length * .0055), collar(bend, .081), collar(knuckle, .044)], 4, .11, phase);
    const farthest = (p: P3) => s.buds.reduce((best, q) => distance(best, p) >= distance(q, p) ? best : q);
    const left = farthest(target), right = farthest(left), arms: P3[][] = [[], []];
    s.buds.forEach(p => arms[distance(p, left) < distance(p, right) ? 0 : 1].push(p));
    for (const buds of arms) {
      if (!buds.length) continue;
      const tip = mix3(knuckle, mean(buds), .51); tip[1] -= .14;
      art.tube(paints.bark, [collar(knuckle, .050), collar(tip, 0)], 3);
      for (const p of buds) {
        const dir = heading(tip, p), q = add3(p, polar(dir + 1.24, .43 + .28 * rand(), .21 + .41 * rand()));
        const light = .77 + .35 * p[1] / h + .12 * rand(), roll = (rand() - .5) * 2.2;
        art.spray(paints.oak, tip, p, .75 + rand() * .29, SHOOT.oak, roll, .08 + .22 * rand(), (rand() - .5) * .27, light);
        art.spray(rand() < .28 ? paints.lime : paints.oak, tip, q, .56 + rand() * .36, SHOOT.flush, roll + 1.05, .19, -.14, light * 1.04, true);
      }
    }
  }
}

function birch(art: TreeForm, phase: number, paint: WoodlandPaint) {
  const rand = woodRandom(phase + 3.7), a = phase + .5 * rand(), leader = 7.05 + 1.48 * rand();
  // The second stool starts at the root plate, not in midair. Silver stems
  // commonly retain a slender dark fork with butter-yellow outer sprays.
  for (let side = 0; side < 2; side++) {
    const dir = a + side * 2.66, h = leader * (side ? .78 + rand() * .16 : 1), lean = .58 + .72 * rand();
    const path: P3[] = [polar(dir,.075,-.13), polar(dir -.40,lean * .18,h * .31), polar(dir + .28,lean * .61,h * .63), polar(dir,lean,h * .88)];
    art.tube(paint.birch, path.map((p,i) => collar(p, [.142 - side * .042, .097, .059, .014][i])), 5, .07, phase);
    for (let j = 0; j < 5; j++) {
      const t = j / 5, az = dir + j * 1.96 + rand() * .49, start = stemAtHeight(path, h * (.32 + t * .57));
      const elbow = add3(start, polar(az -.19, .59 + (1 - t) * .30, h * (.118 + rand() * .036)));
      const tip = add3(elbow, polar(az + .27, .48 - .18 * t, .21 + .56 * rand()));
      art.tube(j < 2 ? paint.birch : paint.bark, [collar(start, .061 * (1 - .54 * t)), collar(elbow, .028), collar(tip, 0)], 3, .06);
      for (let k = 0; k < 4; k++) {
        const shoot = az + (k - 1.5) * .80 + .32 * rand(), stalk = k === 0 ? elbow : tip;
        const nose = add3(stalk, polar(shoot, .72 + .44 * rand(), -.47 - rand() * 1.20 + .28 * t));
        art.spray(k === 1 ? paint.oak : paint.lime, stalk, nose, .43 + rand() * .33, SHOOT.birch,
          (k - 1.4) * .84 + .35 * rand(), .20, .08, .87 + rand() * .23, k > 1);
      }
    }
    const top = path[3];
    for (let j = 0; j < 3; j++) art.spray(paint.lime, top, add3(top, polar(dir + j * 2.35, .66, h * .12 - j * .15)), .46,
      SHOOT.birch, j * .83, .14, -.08, 1.12);
    // Lenticular bark scars do not hoop the whole trunk in identical rings.
    for (let j = 0; j < 4; j++) {
      const p = stemAtHeight(path, h * (.07 + .063 * j)), az = dir + j * golden;
      const radius = .128 - .009 * j - side * .025;
      art.spray(paint.bark, add3(p,polar(az - .56,radius,.014)), add3(p,polar(az + .61,radius,-.009)),
        .016, SHOOT.solid, 1.30, 0, 0, .83, true);
    }
  }
}

function pine(art: TreeForm, phase: number, paint: WoodlandPaint) {
  const rand = woodRandom(phase + .47), h = 6.70 + rand() * 1.30, lean = .16 + .31 * rand();
  const path: P3[] = [[0,-.14,0], polar(phase,.054,1.51), polar(phase + .30,lean * .66,3.97), polar(phase,lean,h)];
  art.tube(paint.bark, path.map((p,i) => collar(p,[.191,.164,.096,.010][i])), 5, .10, phase);
  // Open, wind-pruned lower boughs, not rotational conical skirts. Older
  // branches descend then turn their leaders up into the light. Young laterals
  // sit on the wood at different inclinations, with internal sky holes.
  for (let tier = 0; tier < 5; tier++) {
    const f = tier / 4, count = [5,4,4,3,2][tier];
    for (let j = 0; j < count; j++) {
      const az = phase + j * turn / count + tier * 1.82 + (rand() -.5) * .61;
      const y = (tier === 0 ? 1.99 : 3.43 + (tier - 1) / 3 * (h - 3.88)) + (rand() - .5) * .21;
      const start = stemAtHeight(path,y), reach = (1.96 * (1 - f) ** 1.55 + .21) * (.78 + rand() * .23);
      const seat = add3(start, polar(az -.16,reach * .42,-.19 - .08 * (1 - f)));
      art.tube(paint.bark, [collar(start,.059 - f * .039),collar(seat,0)], 3);
      for (let k = 0; k < 3; k++) {
        const dir = az + (k - 1) * .72 + (rand() -.5) * .28, out = reach * (k === 1 ? .74 : .64);
        const bud = add3(seat, polar(dir,out,k === 1 ? .25 + rand() * .22 : -.35 - rand() * .24));
        art.spray(k === 1 ? paint.pine : paint.dark, seat, bud, reach * (k === 1 ? .37 : .32), SHOOT.needle,
          (k - 1) * .98 + .38 * rand(), -.075, .040, 1.04 + .11 * f - .06 * rand(), k !== 1);
      }
      const bud = add3(start, polar(az + .46, reach * .67, -.50 + .37 * f));
      art.spray(paint.pine, start, bud, reach * .39, SHOOT.needle, -.78 + rand() * .47, .09, -.055, .95, tier > 0);
    }
  }
}

export function addVillaWoodlandTree(b: VillaModelBuilder, kind: VillaLandscapeTreeKind, scale: number, phase: number, paint: WoodlandPaint) {
  const art = new TreeForm();
  if (kind === 'pine') pine(art, phase, paint); else if (kind === 'birch') birch(art, phase, paint); else oak(art, phase, paint);
  art.finish(b, scale, kind === 'oak' ? 3.1 : kind === 'birch' ? 2.1 : 1.9);
}

/** Coppiced stools between the open-grown high trees; grass/seed heads are a
 * different growth stratum, not the same shrub scaled up and down. */
export function addVillaUnderstory(b: VillaModelBuilder, scale: number, phase: number, bark: Paint, leaf: Paint, young: Paint) {
  const art = new TreeForm(), rand = woodRandom(phase + 8.9);
  for (let i = 0; i < 4; i++) {
    const a = phase + i * golden + .43 * rand(), start = polar(a,.065,-.085), knee = polar(a,.28 + rand() * .34,.40 + .28 * rand());
    if (i < 2) art.tube(bark, [collar(start,.036),collar(knee,0)], 3);
    const base = i < 2 ? knee : start;
    for (let j = 0; j < 2; j++) {
      const dir = a + j * .94 - .42, end = add3(base, polar(dir,.52 + rand() * .64,.60 + .69 * rand()));
      art.spray(j ? leaf : young, base,end,.43 + .34 * rand(),i % 2 ? SHOOT.hazel : SHOOT.scrub, (i - 1.6) * .77 + j * .41,.16,-.09,.94 + rand() * .18);
    }
  }
  art.finish(b,scale);
}

export function addVillaMeadowTuft(b: VillaModelBuilder, scale: number, phase: number, grass: Paint, straw: Paint) {
  const art = new TreeForm(), rand = woodRandom(phase + 21.04);
  for (let j = 0; j < 4; j++) {
    const a = phase + j * golden, p = polar(a,.22 * rand(),-.095), q = add3(p, polar(a,.34 + .48 * rand(),.56 + .67 * rand()));
    art.spray(j === 0 ? straw : grass, p,q,.53 + .34 * rand(),SHOOT.grass,(j - 1.6) * .47,.08,-.06,1, true);
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
