import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { NatureMesh, add3, collar, mix3, type P3 } from './villaNatureGeometry.js';

// x, spine height, dorsal rise, ventral drop, half beam. Long slim peduncle,
// low back and slightly upturned jaw, not a mirrored spindle or goldfish belly.
const stations = [
  [-.057, .0003, .0017, .0019, .00135], [-.051, .0004, .0027, .0027, .0020], [-.040, .0008, .0044, .0040, .0033],
  [-.028, .0009, .0066, .0065, .0048], [-.012, .0007, .0085, .0091, .0067], [.003, .0005, .0093, .0105, .0076],
  [.018, .0010, .0087, .0102, .0072], [.031, .0011, .0071, .0084, .0066], [.041, .0018, .0056, .0067, .0054],
  [.049, .0024, .0036, .0048, .0040], [.054, .0037, .0018, .0029, .0024], [.056, .0044, .0010, .0015, .0014],
] as const;
const flank = (r: readonly number[], a: number): P3 => {
  const t = Math.cos(a), y = r[1] + Math.sign(t) * Math.abs(t) ** .78 * (t >= 0 ? r[2] : r[3]);
  return [r[0], y, Math.sin(a) * r[4]];
};
function surface(x: number, a: number): P3 {
  const i = stations.findIndex(s => s[0] >= x);
  if (i <= 0) return flank(stations[i === 0 ? 0 : stations.length - 1], a);
  return mix3(flank(stations[i - 1], a), flank(stations[i], a), (x - stations[i - 1][0]) / (stations[i][0] - stations[i - 1][0]));
}
/** Each ray goes from its OWN basal attachment to a different perimeter point.
 * The connecting web bows in the third dimension, with intervening notches. */
function rayedFin(b: VillaModelBuilder, base: P3[], tips: P3[], camber: P3, material: THREE.Material, rayRadius: number) {
  const web = new NatureMesh(), ribs = new NatureMesh();
  let prior: { t: number; m: number; e: number; middle: P3 } | undefined;
  for (let i = 0; i < base.length; i++) {
    const middle = add3(mix3(base[i], tips[i], .55), camber), t = web.point(base[i]), m = web.point(middle), e = web.point(tips[i]);
    ribs.stem([collar(base[i], rayRadius), collar(middle, rayRadius * .76), collar(tips[i], 0)], 4, 0, 0, true);
    if (prior) {
      web.tri(prior.t, prior.m, t); web.tri(t, prior.m, m);
      const nick = web.point(mix3(mix3(tips[i - 1], tips[i], .5), mix3(prior.middle, middle, .5), .16));
      web.tri(prior.m, prior.e, nick); web.tri(prior.m, nick, m); web.tri(m, nick, e);
    }
    prior = { t, m, e, middle };
  }
  b.geometry(web.geometry(), material); b.geometry(ribs.geometry(), material);
}
export function medakaTemplates(template: THREE.Group) {
  const silver = villaMaterial('#a9b8b4', .27, .36), stripe = villaMaterial('#c3e4f2', .15, .76), eye = villaMaterial('#233239', .24);
  const fin = villaMaterial('#c2d9d0', .36, .12); fin.transparent = true; fin.opacity = .45; fin.depthWrite = false; fin.side = THREE.DoubleSide; fin.forceSinglePass = true;
  const fish = new VillaModelBuilder(template, 'medaka-template'), tail = new VillaModelBuilder(template, 'medaka-tail');
  const figure = new NatureMesh(), angles = [0, .25, .69, 1.16, 1.57, 2.07, 2.6, Math.PI, 3.69, 4.22, 4.71, 5.12, 5.59, Math.PI * 2 - .25];
  figure.skin([[[stations[0][0], .0003, 0]], ...stations.map(r => angles.map(a => flank(r, a))), [[.0566, .0047, 0]]]);
  const body = figure.geometry(), opaque: number[] = [], glint: number[] = [];
  // Share the actual ridge vertices/normals of the body. The silver-blue dorsal
  // stripe replaces the central skin faces, so it cannot float or z-fight.
  for (let i = 0; i < figure.indices.length; i += 3) {
    const ids = figure.indices.slice(i, i + 3), dorsal = ids.every(j => {
      const x = figure.positions[j * 3], slot = (j - 1) % angles.length;
      return x >= -.051 && x <= .041 && (slot === 0 || slot === 1 || slot === angles.length - 1);
    });
    (dorsal ? glint : opaque).push(...ids);
  }
  const marking = body.clone(); marking.setIndex(glint); body.setIndex(opaque); fish.geometry(body, silver); fish.geometry(marking, stripe);
  for (const side of [-1, 1]) {
    const iris = surface(.038, side * 1.22);
    const orb = (p: P3, size: P3, paint: THREE.Material) => { const g = new THREE.SphereGeometry(1, 10, 6); g.scale(...size); fish.geometry(g, paint, p); };
    orb(iris, [.00325, .00325, .0017], stripe);
    orb(add3(iris, [.00015, 0, side * .0008]), [.00240, .00243, .0013], eye);
    orb(add3(iris, [.0007, .0010, side * .0018]), [.00066, .00067, .00037], stripe);
    // Opercular fold fits the sampled flank instead of a misplaced overlay.
    const gill = new NatureMesh(); gill.stem([collar(surface(.029, side * .83), .00030), collar(surface(.025, side * 1.59), .00047),
      collar(surface(.028, side * 2.30), .00032), collar(surface(.032, side * 2.61), 0)], 5, 0, 0, true); fish.geometry(gill.geometry(), stripe);
    const mouth = new NatureMesh(); mouth.stem([collar(surface(.051, side * 1.88), .00028), collar(surface(.054, side * 1.56), .00035), collar([.0564, .0047, 0], .00026)], 5); fish.geometry(mouth.geometry(), eye);
    const base = [surface(.002, side * 2.57), surface(-.001, side * 2.59), surface(-.004, side * 2.59)];
    rayedFin(fish, base, [[-.011, -.014, side * .0085], [-.015, -.015, side * .0093], [-.018, -.013, side * .0083]], [0, -.0006, side * .0004], fin, .00022);
  }
  const dorsalX = [-.014, -.019, -.025, -.032, -.038, -.044], analX = [-.006, -.014, -.021, -.028, -.035, -.043, -.048];
  rayedFin(fish, dorsalX.map(x => surface(x, 0)), dorsalX.map((x, i) => [x - .005 - .0014 * i, .020 - .00085 * i - .00021 * i * i, .0011]), [0, 0, .0012], fin, .00031);
  rayedFin(fish, analX.map(x => surface(x, Math.PI)), analX.map((x, i) => [x - .008, -.020 + .00089 * i + .00022 * i * i, -.0018]), [0, -.0004, -.0008], fin, .00029);
  fish.finish();
  const caudalBase: P3[] = [], caudalEnd: P3[] = [];
  for (let i = -4; i <= 4; i++) {
    const t = i / 4; caudalBase.push([.0035, .0003 + t * .00195, 0]); caudalEnd.push([-.0245 - .0032 * (1 - t * t), t * .0145, .0018 * t * t]);
  }
  rayedFin(tail, caudalBase, caudalEnd, [0, 0, -.0014], fin, .00037); tail.finish();
  const fins = ([-1, 1] as const).map(side => {
    const b = new VillaModelBuilder(template, `medaka-pectoral-${side}`), pivot = surface(.025, side * 1.55);
    const roots: P3[] = [], tips: P3[] = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4; roots.push([-.0022 * t, .0015 - .003 * t, -side * .0005]);
      tips.push([-.010 - .006 * t, -.0015 - .0045 * t, side * (.010 + .003 * Math.sin(Math.PI * t))]);
    }
    rayedFin(b, roots, tips, [0, -.0016, side * .0007], fin, .00027); b.finish(); return { b, side, pivot };
  });
  return { fish, tail, fins };
}
