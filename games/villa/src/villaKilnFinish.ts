import * as THREE from 'three';
import { IndexedFittingBuilder, type XYZ } from './villaFittingGeometry.js';
import { loft, rectRing } from './villaFurnitureForms.js';

export type KilnFinish = 'elm' | 'walnut' | 'stone' | 'ash' | 'red-clay' | 'brass' | 'charcoal' | 'tea';
export function barMaterial(hex: number, roughness: number, finish: KilnFinish, metalness = 0) {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, vertexColors: true });
  m.name = `tea/${finish}`; m.userData.kilnFinish = finish; return m;
}
/** Low-frequency slip/oxide variation and cut/planished bands are on the
 * workpiece itself; nothing is fetched or re-evaluated as the pot pitches. */
export function kilnFinish(g: THREE.BufferGeometry, finish: KilnFinish, phase = 0) {
  const p = g.getAttribute('position'), rgb = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const iron = Math.sin(14 * x - y * 20 + Math.sin(9 * z)) * .045, ring = Math.cos(y * 379 + .18 * Math.sin(3 * a));
    let r = 1, gr = 1, bl = 1;
    if (finish === 'red-clay' || finish === 'ash') {
      // Ash pools towards the belly; the lip and trimmed, unglazed foot fire warm.
      const clay = finish === 'red-clay', foot = y >= -.0001 && y < (clay ? .014 : .007),
        lip = !clay && Math.abs(y - .055) < .0028, n = .88 + iron + ring * (clay ? .054 : .035) + .032 * Math.sin(4 * a + y * 46);
      r = n * (foot ? 1.03 : lip ? 1.08 : 1); gr = n * (foot ? .77 : lip ? .96 : 1); bl = n * (foot ? .57 : lip ? .79 : 1);
    } else if (finish === 'elm' || finish === 'walnut') {
      const long = Math.sin(16 * z + 3 * Math.sin(11 * x + phase) + y * 2.1), cut = Math.sin(z * 81 + .5 * x + phase);
      r = .91 + .063 * long + .025 * cut; gr = r * .97; bl = r * .92;
    } else if (finish === 'brass') {
      r = .93 + .038 * ring + .037 * Math.cos(8 * a - y * 13); gr = r * .986; bl = r * .96;
    } else if (finish === 'stone') {
      r = .95 + .03 * Math.sin(x * 9 + 2 * Math.sin(z * 6)) + iron * .48; gr = r; bl = r * .987;
    }
    rgb[i * 3] = r; rgb[i * 3 + 1] = gr; rgb[i * 3 + 2] = bl;
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); return g;
}
export class TeaBench extends IndexedFittingBuilder {
  override geometry(g: THREE.BufferGeometry, mat: THREE.Material, pos?: XYZ, rot?: XYZ) {
    if (mat.vertexColors && !g.hasAttribute('color')) kilnFinish(g, mat.userData.kilnFinish, (pos?.[0] ?? 0) * 63);
    super.geometry(g, mat, pos, rot);
  }
}

export type PlaceWare = (g: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number) => void;
/** A removable draining deck. Two bearings at the ends of each spline hold it
 * clear of the sloped, watertight catch pan. y=0 bears on wood/stone below,
 * y=.042 is the level that receives a cup or pot. */
export function drainingBoat(put: PlaceWare, w: number, d: number, count: number, wood: THREE.Material, rim: THREE.Material) {
  const ring = (width: number, depth: number, y: number) => rectRing(width, depth, .019, y, 0, 0, 2);
  const floor = ring(w - .054, d - .052, .005).map(([x, y, z]): [number, number, number] => [x, y + .005 * (x / w + .5), z]);
  put(loft([ring(w - .016, d - .016, 0), ring(w - .003, d - .003, .003), ring(w, d, .041), ring(w - .002, d - .002, .044),
    ring(w - .028, d - .028, .044), ring(w - .032, d - .032, .041), ring(w - .032, d - .032, .027), floor]), rim);
  const cell = (w - .042) / count;
  for (const side of [-1, 1]) put(new THREE.BoxGeometry(w - .037, .018, .018), rim, 0, .020, side * (d * .5 - .027));
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * cell, width = cell - .008, length = d - .039;
    put(loft([rectRing(width - .003, length - .003, .004, .029, 0, 0, 1), rectRing(width, length, .004, .040, 0, 0, 1),
      rectRing(width - .002, length - .002, .004, .042, 0, 0, 1)]), wood, x, 0, 0);
  }
}
