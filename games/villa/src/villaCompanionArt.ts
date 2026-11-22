import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, collar, margin, polar, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';
import { Surface, form } from './villaCoatSurface.js';
import { mammalBody, mammalHead, mammalLegs, mammalTail } from './villaCoatMammals.js';
import { featheredBody, featheredHead, rectrices, tuckedWing, birdFoot } from './villaPlumage.js';

const avian = (id: VillaPetId) => id === 'parrot' || id === 'parrot-blue';
export function companionBody(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) { (avian(id) ? featheredBody : mammalBody)(new Surface(b, material), id); }
export function companionHead(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) { (avian(id) ? featheredHead : mammalHead)(new Surface(b, material), id); }
export function companionTail(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) { (avian(id) ? rectrices : mammalTail)(new Surface(b, material), id); }
export function companionWing(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId, side: number) { tuckedWing(new Surface(b, material), id, side); }
export function companionFoot(b: VillaModelBuilder, material: THREE.Material, side: number) { birdFoot(new Surface(b, material), side); }
export function companionLegs(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId, pair: number) { mammalLegs(new Surface(b, material), id, pair); }

export const felineRest = { pitch: -.19, lower: -.031 } as const;
/** Two precomputed jointed gait poses per diagonal batch. The resting cat also
 * folds her hocks under the croup while her toes stay on the supporting plane.
 * Only scalar morph weights change during simulation. */
export function jointedGait(group: THREE.Group, pair: number, rabbit: boolean, cat: boolean) {
  const mesh = group.children[0] as THREE.Mesh, g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal');
  const positions: THREE.Float32BufferAttribute[] = [], normals: THREE.Float32BufferAttribute[] = [];
  for (const stroke of cat ? [-1, 1, 0] : [-1, 1]) {
    const dv: number[] = [], dn: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i), side = Math.sign(p.getX(i)), fore = (pair === 0 ? side : -side) > 0;
      const ay = n.getY(i), az = n.getZ(i); let a: number;
      if (!stroke) {
        // Inverse of the sitting torso for the actual pads; blend into the upper
        // arm/thigh, which must continue to rotate with the trunk.
        const w = 1 - THREE.MathUtils.smoothstep(y, .046, .215), s = Math.sin(felineRest.pitch), c = Math.cos(felineRest.pitch);
        const padZ = z + (fore ? .004 : .047), padY = y - felineRest.lower;
        dv.push(0, w * (c * padY + s * padZ - y), w * (-s * padY + c * padZ - z)); a = -felineRest.pitch * w;
      } else {
        const rootY = .202, rootZ = fore ? .101 : -.126, kneeY = fore ? .126 : .145, kneeZ = rootZ + (fore ? -.010 : .03);
        const hip = stroke * (fore ? .26 : rabbit ? .35 : .28), blend = THREE.MathUtils.smoothstep(kneeY - y, -.022, .036),
          knee = Math.max(0, stroke) * (fore ? -.23 : rabbit ? -.51 : -.35) * blend;
        const dy = y - kneeY, dz = z - kneeZ, y1 = kneeY + dy * Math.cos(knee) - dz * Math.sin(knee), z1 = kneeZ + dy * Math.sin(knee) + dz * Math.cos(knee);
        const y2 = rootY + (y1 - rootY) * Math.cos(hip) - (z1 - rootZ) * Math.sin(hip), z2 = rootZ + (y1 - rootY) * Math.sin(hip) + (z1 - rootZ) * Math.cos(hip);
        dv.push(0, y2 - y, z2 - z); a = knee + hip;
      }
      dn.push(0, ay * Math.cos(a) - az * Math.sin(a) - ay, ay * Math.sin(a) + az * Math.cos(a) - az);
    }
    positions.push(new THREE.Float32BufferAttribute(dv, 3)); normals.push(new THREE.Float32BufferAttribute(dn, 3));
  }
  g.morphTargetsRelative = true; g.morphAttributes.position = positions; g.morphAttributes.normal = normals; mesh.updateMorphTargets(); return mesh.morphTargetInfluences!;
}

export function companionDish(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) {
  const c = new Surface(b, material), bird = avian(id), rabbit = id === 'rabbit' || id === 'rabbit-female', cat = id === 'cat';
  const clay = rabbit ? 0xc6a16c : cat ? 0xc88768 : bird ? 0xe7dac1 : 0x89acaa;
  const h = bird ? .027 : rabbit ? .033 : cat ? .038 : .047, dish = new NatureMesh();
  dish.round([[.002, 0], [.002, .080], [.007, .092], [.012, .093], [h * .68, .104], [h - .005, .106], [h, .102], [h, .097], [h - .005, .093], [.020, .082], [.013, .056], [.011, 0]], 22);
  c.put(dish.geometry(), (_x, y) => y === 0 ? clay : y < .009 ? 0x8b7b68 : y > h - .004 ? 0xe8d6ba : clay);
  if (rabbit) {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399, p = polar(a, .054, .018 + i % 3 * .002), mid: P3 = [p[0] * .1, .023, p[2] * .25];
      c.cord(i % 2 ? 0xd8b86d : 0xbca263, [collar(p, .0022), collar(mid, .0022), collar(polar(a + 2.73, .060, .021), .0018)], 4);
    }
    for (let j = 0; j < 4; j++) { const greens = new NatureMesh(), a = j * 2.399; greens.blade(polar(a + Math.PI, .019, .023), polar(a, .073, .014), .020, margin.cherry, .012, .27); c.put(greens.geometry(), j % 2 ? 0x759057 : 0x55804a); }
  } else for (let i = 0; i < (bird ? 17 : 10); i++) {
    const a = i * 2.399, r = .068 * Math.sqrt((i + .5) / (bird ? 17 : 10)), p = polar(a, r, .014 + r * .082);
    if (bird) {
      const seed = form([[-.010, 0, 0, 0], [-.005, .002, .0043, .003], [.002, .003, .005, .004], [.008, .002, .003, .002], [.012, 0, 0, 0]], 7);
      c.put(seed, i % 3 ? 0xd9bd84 : 0x83623e, undefined, p, [0, a, 0]);
    } else {
      const pellet = new NatureMesh(); pellet.round([[0, 0], [.002, .010], [.013, .014], [.018, .010], [.019, 0]], cat ? 6 : 9,
        (x, y, z, t) => [x * (1 + .17 * Math.cos(t * 3)), y, z * (1 + .17 * Math.cos(t * 3))]);
      c.put(pellet.geometry(), i % 2 ? 0x926544 : 0xab8052, undefined, p, [0, a, 0]);
    }
  }
}
