import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';
import { islandHornbeam } from './villaHedgeHornbeam.js';

function sawn(m: NatureMesh, horizontal: boolean, seed=0) {
  const indexed = m.geometry(), g = indexed.toNonIndexed(); indexed.dispose(); g.computeVertexNormals();
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uvs:number[]=[],colors:number[]=[],phase=Math.sin(seed*1.712)*2.89;
  const stock=.90+.085*Math.sin(seed*2.694);
  for(let i=0;i<p.count;i++){
    const along=horizontal?p.getZ(i):p.getY(i),x=p.getX(i),v=horizontal?p.getY(i):p.getZ(i),ny=n.getY(i),cap=Math.abs(horizontal?n.getZ(i):ny)>.86;
    uvs.push(phase+(cap?x:along)/2.5,seed*.31+(Math.abs(n.getX(i))>.5?v:x)/.35);
    const wet=horizontal?0:Math.exp(-Math.max(0,p.getY(i))/.15),tone=stock*(1-.34*wet)*(cap?.91:1);
    colors.push(tone*(1-.09*wet),tone,tone*(.96+.14*wet));
  }
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
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
  b.geometry(sawn(m,false,x*.37+z*.85), wood, [x, y, z], [0, alongX ? Math.PI / 2 : 0, 0]);
}
export function addVillaFenceRail(b: VillaModelBuilder, a: P3, c: P3, wood: THREE.Material) {
  const run = Math.hypot(c[0] - a[0], c[2] - a[2]), rise = c[1] - a[1];
  const stations = [[0, .023, .034], [.053, .023, .034], [.061, .032, .046], [run - .061, .032, .046], [run - .053, .023, .034], [run, .023, .034]];
  const m = new NatureMesh();
  m.skin([[[0, 0, 0]], ...stations.map(([t, w, h]) => corners(w, h, .009).reverse().map(([x, y]): P3 => [x, y + rise * t / run, t])), [[0, rise, run]]]);
  b.geometry(sawn(m,true,a[0]*.37+a[2]*.85+a[1]*4.9), wood, a, [0, Math.atan2(c[0] - a[0], c[2] - a[2]), 0]);
}
/** Three clipped hornbeams on the scenic oval. Shoot bases come straight from
 * the preceding branch path; visitors can look up between the actual leaves. */
export function addVillaIslandTree(b: VillaModelBuilder, x: number, y: number, z: number, height: number, bark: THREE.Material, leaf: THREE.Material) {
  islandHornbeam(b, x, y, z, height, bark, leaf);
}
