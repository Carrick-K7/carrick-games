import type { VillaModelBuilder } from './villaModel.js';
import { VILLA_ESTATE_BOUNDS } from './villaEstateLayout.js';
import { VillaRidgeField } from './villaDistantRidges.js';
import { add3, collar, mix3, polar, stemAtHeight, turn, type P3 } from './villaNatureGeometry.js';
import { SHOOT, woodRandom } from './villaTreelineAtlas.js';
import { TreeForm, type WoodlandPaint } from './villaTreelineForms.js';
import type { VillaLandscapeTreeKind } from './villaStream.js';

type Side = 'west' | 'east' | 'north' | 'south';
interface Plot { side: Side; x: number; y: number; z: number; h: number; r: number; phase: number; kind: VillaLandscapeTreeKind; fell: boolean }
const GOLDEN = 2.39996323;
// Unequal lengths, setbacks and depths. From the north path the gap east of
// the near birches opens onto a much more distant spur, not the end of a row.
const MEADOW_WOODS: readonly [Side, number, number, number, number, number][] = [
  ['west',-76,-47,10,19,10], ['west',-85,-11,14,20,10], ['west',-72,24,8,17,11],
  ['west',-84,65,12,23,10], ['west',-73,101,9,20,9], ['west',-76,145,10,19,9],
  ['north',-49,-86,18,8,13], ['north',-18,-100,23,11,14], ['north',7,-88,10,8,8],
  ['north',34,-99,17,11,13], ['north',66,-92,14,8,10],
  ['east',92,-45,10,15,7], ['east',99,-2,10,19,7], ['east',104,49,13,25,9],
  ['east',98,97,11,19,7], ['east',102,145,13,24,9],
  ['south',-46,198,18,10,10], ['south',-16,205,19,12,12], ['south',18,195,12,8,9], ['south',49,200,17,10,10],
];
const species = (u: number): VillaLandscapeTreeKind => u < .58 ? 'oak' : u < .78 ? 'birch' : 'pine';

/** Static planting coordinates; none of these plots are gameplay objects. The
 * foreground meadow windows stay open, even though their backdrops have depth. */
export function villaTreelinePlots(groundHeight: (x: number, z: number) => number) {
  const bounds = VILLA_ESTATE_BOUNDS, cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const field = new VillaRidgeField(cx, cz), plots: Plot[] = [];
  const floor = (x: number,z: number) => Math.max(groundHeight(x,z),field.heightAt(x,z) ?? -Infinity);
  for (const [i,[side,x0,z0,rx,rz,count]] of MEADOW_WOODS.entries()) {
    const rand = woodRandom(i + 108.6), spin = rand() * turn, dominant = rand(), age = rand();
    for (let j = 0; j < count; j++) {
      const a = spin + j * GOLDEN + (rand() - .5) * .36, radius = Math.sqrt((j + rand()) / count);
      const x = x0 + Math.cos(a) * radius * rx, z = z0 + Math.sin(a) * radius * rz;
      const kind = species(rand() < .47 ? dominant : rand());
      // Suppressed young growth under an irregular cohort of standards, not
      // equal-sized mature trees set out at a constant planting interval.
      const h = (7.4 + age * 3.3 + (1 - radius * .54) * 5.7) * (.43 + .79 * rand() ** .63);
      const r = h * (kind === 'oak' ? .43 + .14 * rand() : kind === 'pine' ? .25 + .10 * rand() : .25 + .10 * rand());
      plots.push({side,x,y:floor(x,z),z,h,r,kind,phase:rand() * 600,fell:false});
    }
  }
  // A forest ascends some gullies, spills over a few saddles, retreats before
  // exposed rock. Front/back stands overlap obliquely; neither is a skyline band.
  for (let wood = 0; wood < 34; wood++) {
    const rand = woodRandom(wood * 3.7 + 46.9), t0 = (wood + rand() * .68) / 34;
    const row = .70 + rand() * 2.9 + (wood % 6 === 2 ? 3.1 : 0), sweep = .012 + .016 * rand(), n = 3 + Math.floor(4 * rand());
    const dominant = species(rand()), scale = 6.4 + 3.5 * rand();
    for (let j = 0; j < n; j++) {
      const a = j * GOLDEN + wood + .31 * rand(), radius = Math.sqrt((j + rand()) / n);
      const [x,y,z] = field.plot(t0 + Math.cos(a) * sweep * radius,row + Math.sin(a) * .89 * radius + .16 * rand());
      const ax = (x - cx) / 151, az = (z - cz) / 190, side = Math.abs(ax) > Math.abs(az) ? (ax < 0 ? 'west' : 'east') : (az < 0 ? 'north' : 'south');
      const kind = rand() < .73 ? dominant : species(rand()), h = scale + rand() * 4.8, r = h * (kind === 'oak' ? .39 : kind === 'birch' ? .25 : .22);
      plots.push({side,x,y:Math.max(y,groundHeight(x,z)),z,h,r,phase:rand() * 600,kind,fell:true});
    }
  }
  return { plots, floor };
}

/** From tens to hundreds of metres away, a comparatively small set of real
 * scaffold tubes and fixed branch-system sprays carry the larger silhouettes.
 * The form is baked for its plot: walking toward the fence cannot make a
 * sprig swivel, pop or upload geometry. No draw per tree, no stacked cones. */
export function addVillaStandTree(b: VillaModelBuilder, tree: Plot, paint: WoodlandPaint, floor: (x: number,z: number) => number) {
  const {h,r,phase,kind,fell} = tree, rand = woodRandom(phase), art = new TreeForm();
  const birch = kind === 'birch', fir = kind === 'pine', az = rand() * turn, lean = r * (.20 + rand() * (fir ? .13 : .37));
  // Under the high canopy a separate, suckering shade layer masks parts of
  // the boles but never fills the spaces between woods along the entire fence.
  if (!fell && rand() < .77) {
    const dir = rand() * turn, heel = polar(dir,r * (.34 + .58 * rand()),-.24), shrubH = h * (.20 + rand() * .29);
    heel[1] += floor(tree.x + heel[0],tree.z + heel[2]) - tree.y;
    for (let i = 0; i < 5; i++) {
      const a = dir + i * GOLDEN + rand() * .48, tip = add3(heel,polar(a,shrubH * (.36 + .34 * rand()),shrubH * (.65 + .37 * rand())));
      art.spray(i < 2 ? paint.dark : paint.oak,heel,tip,shrubH * .54,i % 2 ? SHOOT.hazel : SHOOT.scrub,(rand() - .5) * 1.72,.14,0,.76 + .19 * rand(),true);
    }
  }
  if (kind === 'oak') {
    // Decurrent scaffolds split LOW, then divide the crown into unequal
    // side-lit lobes. Several smaller terminal sprays splay from each elbow
    // rather than one enormous paddle reaching from the trunk to the sky.
    const split = .19 + rand() * .15, fork: P3 = polar(az,.43 * lean,h * split);
    const butt: P3 = [0,-.35,0], knot = add3(fork,polar(az + .47,.39 * lean,h * .18));
    art.tube(paint.bark,[collar(butt,h * .027),collar(fork,h * .019),collar(knot,0)],fell ? 3 : 4,.09,phase);
    const arms = fell ? 3 : 4, handed = rand() < .50 ? -1 : 1;
    for (let i = 0; i < arms; i++) {
      const a = az + i * GOLDEN * handed + .73 * rand(), t = i / (arms - 1);
      const foot = mix3(fork,knot,t), wing = r * (1.05 - .53 * t) * (.79 + .36 * rand());
      const seat = add3(foot,polar(a,wing * (.51 + .15 * rand()),h * (.15 + .17 * t + .065 * rand())));
      art.tube(paint.bark,[collar(foot,h * (.0135 - .005 * t)),collar(seat,0)],3);
      for (let j = 0; j < 3; j++) {
        const out = a + (j - 1) * (1.06 + .24 * rand()), length = r * (.43 + .36 * rand());
        const rise = h * (j === 1 ? .23 + rand() * .08 : j === 0 ? .06 + rand() * .09 : .11 + rand() * .13);
        const end = add3(seat,polar(out,length,rise)), light = .79 + .16 * t + .22 * rand();
        art.spray(paint.oak,seat,end,r * (.43 + .28 * rand()),j === 1 ? SHOOT.oak : i % 2 ? SHOOT.flush : SHOOT.scrub,
          (j - 1) * .84 + .65 * rand(),.23,-.13,light,fell || j !== 1);
      }
      if (!fell && i % 2 === 0) {
        const x = mix3(foot,seat,.49);
        art.spray(paint.oak,x,add3(x,polar(a - handed * 1.37,wing * .86,h * .16)),r * .56,SHOOT.scrub,-.62,.14,0,.92,true);
      }
    }
    art.finish(b,1); return;
  }
  const highPine = fir && rand() < .46;
  const path: P3[] = [[0,-.34,0], polar(az -.41,lean * .23,h * .31), polar(az + .24,lean * .77,h * .59), polar(az,lean,h * .89)];
  const bark = birch ? paint.birch : paint.bark, radius = h * (birch ? .012 : .018);
  // On the fell the upper stem is less than a pixel wide. Keep one inclined
  // bole rather than hidden rings; only these distant crowns grow on its line.
  if (fell) { path[1] = mix3(path[0],path[3],.37); path[2] = mix3(path[0],path[3],.66); }
  art.tube(bark,(fell ? [path[0],path[3]] : path).map((p,i) => collar(p,(fell ? [1,0] : [1,.75,.41,0])[i] * radius)),3,.08,phase);
  const count = fell ? 4 : 5, tile = fir ? SHOOT.needle : SHOOT.birch;
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1), dir = az + i * GOLDEN + (rand() - .5) * .85;
    const start = stemAtHeight(path,h * ((highPine ? .39 : .22) + (highPine ? .32 : .46) * f + rand() * .06));
    const spread = r * (fir && !highPine ? 1.04 - .61 * f : 1.05 - .21 * f) * (.83 + .33 * rand());
    const seat = !fell && i < 3 ? add3(start,polar(dir - .24,spread * .38,h * (birch ? .17 : highPine ? .115 : .025))) : start;
    if (seat !== start) art.tube(bark,[collar(start,radius * .48),collar(seat,0)],3);
    const end = add3(seat,polar(dir -.29,spread * (seat === start ? 1 : .76),h * (birch ? .15 : highPine ? .16 : .08) * (.8 + .4 * rand())));
    const side = add3(seat,polar(dir + .71 + rand() * .68,spread * .82,h * (birch ? -.09 : highPine ? .065 : -.04)));
    const light = .80 + f * .24 + rand() * .15, material = fir ? paint.pine : paint.lime;
    const width = r * (fir && !highPine ? .78 - .43 * f : .81 - .23 * f), twist = (rand() - .5) * 1.64;
    art.spray(material,seat,end,width,tile,twist,h * .035,spread * .065,light,fell || i % 2 === 1);
    art.spray(fir ? paint.pine : paint.oak,seat,side,width * .87,tile,twist + 1.18,-h * .014,spread * .08,light * .96,true);
  }
  const top = mix3(path[2],path[3],.69);
  for (let i = 0; i < 2; i++) {
    const q = add3(top,polar(az + i * 2.6,r * (fir && !highPine ? .39 : .71),h * (.06 + rand() * .08)));
    art.spray(fir ? paint.pine : paint.lime,top,q,r * (fir && !highPine ? .36 : .54),tile,i * 1.16,.14,0,1.10,true);
  }
  art.finish(b,1);
}
