import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, NaturePalette, add3, collar, margin, mix3, polar, stemAtHeight, type P3 } from './villaNatureGeometry.js';

function sawn(m: NatureMesh, horizontal: boolean) {
  const indexed = m.geometry(), g = indexed.toNonIndexed(); indexed.dispose(); g.computeVertexNormals();
  const p = g.getAttribute('position'), uvs = [];
  for (let i = 0; i < p.count; i++) uvs.push(horizontal ? p.getZ(i) * .42 : p.getY(i) * .42,
    (p.getX(i) + (horizontal ? p.getY(i) : p.getZ(i))) * 1.7);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); return g;
}
/** Octagonal chamfers on sawn timber, not a lathed pole. */
const corners = (w: number, d: number, cut: number): [number, number][] => [
  [-w + cut, -d], [-w, -d + cut], [-w, d - cut], [-w + cut, d], [w - cut, d], [w, d - cut], [w, -d + cut], [w - cut, -d],
];
export function addVillaFencePost(b: VillaModelBuilder, x: number, y: number, z: number, alongX: boolean, wood: THREE.Material) {
  const m = new NatureMesh();
  const rings = [[0, .052], [.045, .060], [1.045, .06], [1.074, .053], [1.09, .059], [1.153, .059], [1.20, .031]];
  m.skin([[[0, 0, 0]], ...rings.map(([v, w]) => corners(w, w, .008).map(([px, pz]): P3 => [px, v, pz])), [[0, 1.20, 0]]]);
  // The square peg exits the cheeks through the tenons at both rail levels.
  for (const h of [.35, .9]) m.stem([[-.062, h, 0, .014], [.062, h, 0, .014]], 4, 0, Math.PI / 4);
  b.geometry(sawn(m, false), wood, [x, y, z], [0, alongX ? Math.PI / 2 : 0, 0]);
}
export function addVillaFenceRail(b: VillaModelBuilder, a: P3, c: P3, wood: THREE.Material) {
  const run = Math.hypot(c[0] - a[0], c[2] - a[2]), rise = c[1] - a[1];
  const stations = [[0, .023, .034], [.053, .023, .034], [.061, .032, .046], [run - .061, .032, .046], [run - .053, .023, .034], [run, .023, .034]];
  const m = new NatureMesh();
  m.skin([[[0, 0, 0]], ...stations.map(([t, w, h]) => corners(w, h, .009).reverse().map(([x, y]): P3 => [x, y + rise * t / run, t])), [[0, rise, run]]]);
  b.geometry(sawn(m, true), wood, a, [0, Math.atan2(c[0] - a[0], c[2] - a[2]), 0]);
}
/** Three clipped hornbeams on the scenic oval. Shoot bases come straight from
 * the preceding branch path; visitors can look up between the actual leaves. */
export function addVillaIslandTree(b: VillaModelBuilder, x: number, y: number, z: number, height: number, bark: THREE.Material, leaf: THREE.Material) {
  // The scenic-course leaf finish belongs solely to these broadleaf blades.
  // Light both sides of their bent membranes rather than duplicating skins.
  leaf.side = THREE.DoubleSide;
  const art = new NaturePalette(), branches = art.get(bark), leaves = art.get(leaf), phase = x * .63;
  const trunk: P3[] = [[0, -.024, 0], [.018, .32, .01], [-.025, 1.13, .025], [.03, 2, -.01], [.06, 2.8, -.04], [.04, 3.57, -.02]];
  branches.stem(trunk.map((p, i) => collar(p, [.16, .12, .105, .084, .035, .013][i])), 10, .12);
  for (let i = 0; i < 9; i++) {
    const a = phase + i * 2.399, t = i / 8, root = stemAtHeight(trunk, 1.51 + t * 1.68);
    const elbow = polar(a, .45 - t * .26, root[1] + .42), fork = polar(a + .08, .74 - t * .34, root[1] + .69);
    branches.stem([collar(root, .065 - t * .035), collar(elbow, .043 - t * .02), collar(fork, .018)], 6);
    for (let j = 0; j < 4; j++) {
      const ang = a + (j - 1.5) * .85, base = mix3(elbow, fork, (j + 1) / 4);
      const end = add3(base, polar(ang, .48 - .17 * t, .49 - (j % 2) * .41));
      branches.stem([collar(base, .019), collar(end, .008)], 4);
      for (let k = 0; k < 9; k++) {
        const la = ang + (k % 2 ? 1 : -1) * (1.21 - k * .07);
        leaves.blade(mix3(base, end, (k + 1) / 9), polar(la, .28 + .052 * Math.sin(i + k), -.10 + .10 * Math.cos(j + k)), .085, margin.ovate, .038, .4 * Math.sin(k));
      }
    }
  }
  b.at(x, y, z, 0, () => art.finish(b, height / 4.08));
}
