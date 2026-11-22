import type { VillaFruitSpecies } from './villaGarden.js';
import { NatureMesh, add3, mix3, type P3 } from './villaNatureGeometry.js';
import { barkTileWidth, lamina, orchardSpecies } from './villaOrchardSurface.js';

const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const diff = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: P3): P3 => { const d = Math.hypot(...v); return [v[0] / d, v[1] / d, v[2] / d]; };
export function onBough(path: P3[], t: number): P3 {
  const u = Math.max(0, Math.min(1, t)) * (path.length - 1), n = Math.min(path.length - 2, Math.floor(u));
  return mix3(path[n], path[n + 1], u - n);
}
const barkTint: Record<VillaFruitSpecies, P3> = {
  cherry: [1.27, 1.11, 1.18], orange: [1.25, 1.53, 1.44], mango: [1.07, 1.13, 1.23],
  apple: [1.14, 1.37, 1.58], pear: [1.02, 1.21, 1.39], lemon: [1.46, 1.64, 1.49],
};
/** Continuous bent cambium, with buttressed lower rings and tapered sockets for
 * real bifurcations. The bark follows the limb: circumference in U, arc length
 * in V. A lateral gets only the few centimetres of bark it actually spans. */
export function orchardBough(mesh: NatureMesh, kind: VillaFruitSpecies, path: P3[], radii: number[], sides: number,
  scale: number, phase: number, heel = false) {
  const strip = orchardSpecies.indexOf(kind), tint = barkTint[kind];
  const baseRadius = Math.max(...radii), fraction = Math.min(.96, 2 * Math.PI * baseRadius * scale / .93);
  const texStart = 2 / barkTileWidth + (.96 - fraction) * (.5 + .48 * Math.sin(phase * 3.72));
  const globalAxis = unit(diff(path[path.length - 1], path[0])), ref: P3 = Math.abs(globalAxis[2]) > .83 ? [1, 0, 0] : [0, 0, 1];
  let previous: number[] = [], distance = .76 * (phase % 1);
  for (let i = 0; i < path.length; i++) {
    const p = path[i], axis = unit(diff(path[Math.min(i + 1, path.length - 1)], path[Math.max(0, i - 1)]));
    const x = unit(cross(ref, axis)), z = cross(axis, x), ring: number[] = [];
    if (i) distance += Math.hypot(...diff(p, path[i - 1])) * scale;
    for (let j = 0; j <= sides; j++) {
      const a = (j % sides) * Math.PI * 2 / sides + phase, flute = .064 + (heel ? .20 * Math.exp(-Math.max(0, p[1]) * 4.6) : 0);
      const grain = Math.cos(a * 3 + .19 * i) + .56 * Math.sin(a * 5 - .13 * i + phase);
      const radius = radii[i] * (1 + flute * grain), co = radius * Math.cos(a), si = radius * Math.sin(a);
      const shade = (heel ? .76 + .24 * Math.min(1, Math.max(0, p[1] * 2.5)) : 1) * (1 + .034 * grain);
      ring.push(mesh.point([p[0] + x[0] * co + z[0] * si, p[1] + x[1] * co + z[1] * si, p[2] + x[2] * co + z[2] * si], 1,
        [(strip + texStart + j / sides * fraction) / orchardSpecies.length, distance / .76], [shade * tint[0], shade * tint[1], shade * tint[2]]));
    }
    if (i) for (let j = 0; j < sides; j++) {
      mesh.tri(previous[j], previous[j + 1], ring[j]); mesh.tri(previous[j + 1], ring[j + 1], ring[j]);
    }
    // Only the bark exposed at a pruned/end tip needs a cap. Branch starts
    // penetrate the parent collar; heel bottoms and root ends run into turf.
    if (i === path.length - 1 && radii[i] > .007 && p[1] > 0) {
      const cap = mesh.point(p, 1, [(strip + .49) / orchardSpecies.length, distance / .76], [tint[0] * 1.18, tint[1] * 1.13, tint[2]]);
      for (let j = 0; j < sides; j++) mesh.tri(cap, ring[j], ring[j + 1]);
    }
    previous = ring;
  }
}

/** This is at most one current-season vegetative shoot, never a crown billboard.
 * The raised midrib and differently rolled heel / tip support a folded leaf
 * surface at four triangles per shoot. The bud is the lower edge's midpoint. */
export function orchardSprig(mesh: NatureMesh, kind: VillaFruitSpecies, base: P3, yaw: number, pitch: number, vigor: number,
  mode: number, flush: number, rand: () => number) {
  const s = lamina[kind], single = mode === 3;
  const length = vigor * (single ? s.length * 1.12 : s.shoot), width = vigor * (single ? s.width * 1.32 : s.span);
  const axis: P3 = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  const right: P3 = [-Math.sin(yaw), 0, Math.cos(yaw)], face = cross(right, axis);
  const roll = (rand() - .5) * (single ? 2.7 : 2.05), twist = .98 * (rand() - .5), cup = (rand() - .65) * .54;
  const arch = length * ((single ? .085 : .115) + .065 * rand()), sweep = width * (rand() - .5) * .37;
  const shade = (.94 + rand() * .49 + Math.min(.30, Math.max(-.09, (base[1] - 2.32) * .20))) * (kind === 'mango' || kind === 'orange' ? 1.42 : 1.10);
  // New flush is notably bronze on mango; different leaves face the light at
  // different angles rather than emitting a fixed bright underside at night.
  const red = kind === 'mango' ? 1.70 + 3.5 * flush : 1.33 + .86 * flush, green = 1.34 + .29 * flush, blue = 1.10 - .31 * flush;
  const cellX = mode % 2, cellY = mode >> 1;
  const rotated = (a: number): P3 => [right[0] * Math.cos(a) + face[0] * Math.sin(a), face[1] * Math.sin(a), right[2] * Math.cos(a) + face[2] * Math.sin(a)];
  const point = (side: number, t: number) => {
    const curve = Math.sin(t * Math.PI), spanning = rotated(roll + twist * t), n = cross(spanning, axis);
    const x = side * width * .5, y = curve * width * cup * .45, pigment = shade * (1 + .072 * side + .06 * t);
    const c: P3 = [base[0] + axis[0] * length * t + face[0] * arch * curve + right[0] * sweep * curve,
      base[1] + axis[1] * length * t + face[1] * arch * curve, base[2] + axis[2] * length * t + face[2] * arch * curve + right[2] * sweep * curve];
    return mesh.point(add3(c, [spanning[0] * x + n[0] * y, spanning[1] * x + n[1] * y, spanning[2] * x + n[2] * y]), 1,
      [(cellX + (2.5 + (side + 1) * .5 * 123) / 128) * .5, (cellY + (2.5 + t * 123) / 128) * .5],
      [pigment * red, pigment * green, pigment * blue]);
  };
  const lo = point(-1, 0), ro = point(1, 0), rt = point(1, 1), lt = point(-1, 1), rib = point(0, .51);
  mesh.tri(lo, ro, rib); mesh.tri(ro, rt, rib); mesh.tri(rt, lt, rib); mesh.tri(lt, lo, rib);
}
