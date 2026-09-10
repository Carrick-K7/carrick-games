import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

import { createVillaWardrobe, VILLA_MASTER_WARDROBE, type VillaWardrobeState } from './villaWardrobe.js';
import { registerVillaSeatCollider, villaRelaxSeat } from './villaSeating.js';
export { VILLA_MASTER_WARDROBE } from './villaWardrobe.js';
export const VILLA_MASTER_VANITY = {
  x: -4.35, y: 3.6, z: 0.65, width: 2.05, depth: 0.72, height: 0.82,
  kneeWidth: 0.94, kneeHeight: 0.69,
} as const;
export const VILLA_MASTER_MIRROR = {
  x: -4.35, y: 5.38, z: 0.205, width: 1.4, height: 1.28, depth: 0.065,
} as const;
export const VILLA_MASTER_STOOL = {
  x: -4.35, y: 3.6, z: 1.58, width: 0.6, depth: 0.54, height: 0.49,
} as const;
export const VILLA_VANITY_ACCESSORIES = ['brush-cup', 'lipstick', 'compact', 'perfume-bottle', 'jewelry-tray'] as const;

/** Scene-owned joinery; controller owns pure wardrobe state, no DOM or render targets. */
export function createVillaBedroom(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state?: VillaWardrobeState, lightOn?: boolean): boolean } {
  const b = new VillaModelBuilder(parent, 'Villa master bedroom');
  const oak = villaMaterial('#b69771', 0.78), shadowOak = villaMaterial('#786047', 0.88);
  const linen = villaMaterial('#e4ddca', 0.93), sage = villaMaterial('#98a18a', 0.84);
  const brass = villaMaterial('#b99b65', 0.34, 0.72), stone = villaMaterial('#eee5d6', 0.43);
  const mirror = villaMaterial('#d1dfe0', 0.055, 1); mirror.envMapIntensity = 1.1; mirror.name = 'Bedroom polished mirror';
  const glow = villaMaterial('#fff0d7', 0.55); glow.emissive.set('#ffddb0'); glow.emissiveIntensity = 0.65;
  const charcoal = villaMaterial('#484039', 0.75), rose = villaMaterial('#b66c75', 0.63);
  const amber = villaMaterial('#b48858', 0.2, 0.12), porcelain = villaMaterial('#d8d5c8', 0.24);
  const marker = (kind: string, x: number, y: number, z: number, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = `Bedroom/${kind}`; node.position.set(x, y, z);
    node.userData = { kind, ...data }; b.root.add(node); return node;
  };
  const w = VILLA_MASTER_WARDROBE;
  const wardrobe = createVillaWardrobe(b.root); b.colliders.push(...wardrobe.colliders);

  const v = VILLA_MASTER_VANITY;
  marker('dressing-table', v.x, v.y, v.z, { openKneeSpace: true, kneeWidth: v.kneeWidth, kneeHeight: v.kneeHeight, drawers: 2 });
  b.at(v.x, v.y, v.z, 0, () => {
    // Table is open underneath: independent legs/drawers, not a solid cabinet box.
    for (const x of [-0.91, 0.91]) for (const z of [-0.265, 0.265]) {
      b.cylinder(x, 0.365, z, 0.032, 0.043, 0.73, oak, [0, 0, 0], 10);
      b.cylinder(x, 0.04, z, 0.044, 0.044, 0.075, brass, [0, 0, 0], 10);
      b.collide(x, 0, z, 0.09, 0.73, 0.09);
    }
    b.box(0, 0.68, -0.292, 1.86, 0.12, 0.07, oak, 0.008);
    b.collide(0, 0.62, -0.292, 1.86, 0.12, 0.07);
    for (const x of [-0.7275, 0.7275]) {
      b.box(x, 0.645, 0, 0.485, 0.24, 0.62, oak, 0.018);
      b.box(x, 0.645, 0.326, 0.435, 0.19, 0.027, sage, 0.01);
      b.box(x, 0.665, 0.355, 0.14, 0.018, 0.035, brass, 0.006);
      b.collide(x, 0.525, 0.015, 0.485, 0.24, 0.71);
    }
    b.box(0, 0.743, 0, v.width - 0.07, 0.055, v.depth - 0.04, oak, 0.017);
    b.box(0, 0.789, 0, v.width, 0.062, v.depth, stone, 0.027);
    b.collide(0, 0.715, 0, v.width, 0.105, v.depth);

    // A small tray gathers objects at the ends, leaving the work surface usable.
    marker('jewelry-tray', v.x - 0.65, v.y + v.height, v.z + 0.08);
    b.box(-0.65, 0.835, 0.07, 0.42, 0.025, 0.29, porcelain, 0.035);
    for (const z of [-0.065, 0.205]) b.box(-0.65, 0.856, z, 0.4, 0.035, 0.025, porcelain, 0.01);
    for (const x of [-0.846, -0.454]) b.box(x, 0.856, 0.07, 0.025, 0.035, 0.25, porcelain, 0.01);
    marker('perfume-bottle', v.x - 0.72, v.y + v.height, v.z + 0.035);
    b.box(-0.72, 0.94, 0.035, 0.11, 0.17, 0.095, amber, 0.018);
    b.box(-0.72, 0.943, 0.085, 0.068, 0.055, 0.006, linen, 0.002);
    b.cylinder(-0.72, 1.047, 0.035, 0.033, 0.033, 0.06, brass, [0, 0, 0], 10);
    marker('lipstick', v.x - 0.54, v.y + v.height, v.z + 0.11);
    b.cylinder(-0.54, 0.893, 0.11, 0.027, 0.027, 0.095, brass, [0, 0, 0], 10);
    b.cylinder(-0.54, 0.966, 0.11, 0.019, 0.019, 0.055, rose, [0, 0, 0], 10);
    b.ellipsoid(-0.54, 0.996, 0.11, 0.019, 0.018, 0.019, rose);
    marker('compact', v.x + 0.35, v.y + v.height, v.z + 0.1, { open: true });
    b.cylinder(0.35, 0.837, 0.1, 0.085, 0.085, 0.028, brass, [0, 0, 0], 16);
    b.cylinder(0.35, 0.856, 0.1, 0.067, 0.067, 0.012, rose, [0, 0, 0], 16);
    b.cylinder(0.35, 0.918, 0.015, 0.085, 0.085, 0.015, brass, [Math.PI / 2 - 0.2, 0, 0], 16);
    b.cylinder(0.35, 0.916, 0.027, 0.067, 0.067, 0.006, mirror, [Math.PI / 2 - 0.2, 0, 0], 16);
    marker('brush-cup', v.x + 0.75, v.y + v.height, v.z - 0.13, { brushes: 3 });
    b.cylinder(0.75, 0.9, -0.13, 0.07, 0.058, 0.16, porcelain, [0, 0, 0], 12);
    b.cylinder(0.75, 0.982, -0.13, 0.053, 0.053, 0.008, charcoal, [0, 0, 0], 12);
    for (let i = 0; i < 3; i++) {
      const x = 0.715 + i * 0.035, top = 1.12 + i * 0.035;
      b.beam([x, 0.94, -0.13], [x + (i - 1) * 0.017, top, -0.13], 0.01, shadowOak, 6);
      b.cylinder(x + (i - 1) * 0.017, top, -0.13, 0.017, 0.014, 0.042, brass, [0, 0, 0], 8);
      b.ellipsoid(x + (i - 1) * 0.017, top + 0.04, -0.13, 0.025, 0.04, 0.023, charcoal);
    }
  });

  const m = VILLA_MASTER_MIRROR;
  marker('dressing-mirror', m.x, m.y, m.z, { reflection: 'environment-polished-metal', renderTarget: false, litTrim: true });
  b.at(m.x, m.y, m.z, 0, () => {
    b.box(0, 0, 0, m.width, m.height, m.depth, oak, 0.12);
    b.box(0, 0, 0.036, m.width - 0.06, m.height - 0.06, 0.017, brass, 0.105);
    b.box(0, 0, 0.047, m.width - 0.105, m.height - 0.105, 0.012, mirror, 0.09);
    for (const x of [-0.61, 0.61]) b.box(x, 0, 0.057, 0.011, 0.91, 0.008, glow, 0.004);
    b.collide(0, -m.height / 2, 0.015, m.width, m.height, 0.095);
  });
  const s = VILLA_MASTER_STOOL;
  marker('dressing-stool', s.x, s.y, s.z, { upholstery: 'linen', movable: false });
  b.at(s.x, s.y, s.z, 0, () => {
    for (const x of [-0.205, 0.205]) for (const z of [-0.175, 0.175]) {
      b.beam([x * 1.07, 0.015, z * 1.07], [x, 0.37, z], 0.027, oak, 8);
      b.cylinder(x * 1.07, 0.032, z * 1.07, 0.028, 0.028, 0.055, brass, [0, 0, 0], 8);
    }
    b.box(0, 0.357, 0, s.width - 0.05, 0.065, s.depth - 0.05, oak, 0.03);
    b.box(0, 0.428, 0, s.width, 0.124, s.depth, linen, 0.075);
    b.box(0, 0.384, 0, s.width + 0.004, 0.01, s.depth + 0.004, sage, 0.04);
    b.collide(0, 0, 0, s.width + 0.004, s.height, s.depth + 0.004);
    registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'stool-dressing');
  });
  const seat = villaRelaxSeat('stool-dressing')!;
  const seatMarker = new THREE.Object3D(); seatMarker.name = 'relax-seat/stool-dressing';
  seatMarker.position.set(seat.seat.x, seat.seat.y, seat.seat.z); seatMarker.userData = { ...seat, modelOrigin: seat.origin }; b.root.add(seatMarker);
  b.finish();
  b.root.userData.bedroom = { wardrobeBays: w.bays, wardrobeDoors: 10, dressingTable: true, mirror: true, accessories: [...VILLA_VANITY_ACCESSORIES] };
  return { colliders: b.colliders, update(state, lightOn = true) {
    glow.emissiveIntensity = lightOn ? 0.65 : 0;
    return wardrobe.update(state, lightOn);
  } };
}
