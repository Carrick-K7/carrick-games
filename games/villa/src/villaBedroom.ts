import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

import { createVillaWardrobe, VILLA_MASTER_WARDROBE, type VillaWardrobeState } from './villaWardrobe.js';
import { registerVillaSeatCollider, villaRelaxSeat } from './villaSeating.js';
export { VILLA_MASTER_WARDROBE } from './villaWardrobe.js';
import { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export const VILLA_VANITY_ACCESSORIES = ['brush-cup', 'lipstick', 'compact', 'perfume-bottle', 'jewelry-tray'] as const;

/** Scene-owned joinery; controller owns pure wardrobe state, no DOM or render targets. */
export function createVillaBedroom(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state?: VillaWardrobeState, lightOn?: boolean): boolean } {
  const b = new VillaModelBuilder(parent, 'Villa master bedroom');
  const oak = villaMaterial('#b69771', 0.78), shadowOak = villaMaterial('#786047', 0.88);
  const linen = villaMaterial('#e4ddca', 0.93), sage = villaMaterial('#98a18a', 0.84);
  const brass = villaMaterial('#b99b65', 0.34, 0.72), stone = villaMaterial('#eee5d6', 0.43);
  // A restrained diffuse component keeps the mirror readable on software GL,
  // whose scene deliberately omits the expensive environment prefilter.
  const mirror = villaMaterial('#d1dfe0', 0.075, .72); mirror.envMapIntensity = 1.1; mirror.name = 'Bedroom polished mirror';
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
    const legX = v.width / 2 - .115, legZ = v.depth / 2 - .095;
    for (const x of [-legX, legX]) for (const z of [-legZ, legZ]) {
      b.cylinder(x, 0.365, z, 0.032, 0.043, 0.73, oak, [0, 0, 0], 10);
      b.cylinder(x, 0.04, z, 0.044, 0.044, 0.075, brass, [0, 0, 0], 10);
      b.collide(x, 0, z, 0.09, 0.73, 0.09);
    }
    const braceZ = -v.depth / 2 + .068;
    b.box(0, 0.68, braceZ, v.width - .19, 0.12, 0.07, oak, 0.008);
    b.collide(0, 0.62, braceZ, v.width - .19, 0.12, 0.07);
    const drawerWidth = (v.width - v.kneeWidth) / 2 - .045;
    const drawerX = v.kneeWidth / 2 + .015 + drawerWidth / 2;
    for (const x of [-drawerX, drawerX]) {
      b.box(x, 0.645, 0, drawerWidth, 0.24, v.depth - .1, oak, 0.018);
      b.box(x, 0.645, v.depth / 2 - .034, drawerWidth - .05, 0.19, 0.027, sage, 0.01);
      b.box(x, 0.665, v.depth / 2 - .005, 0.19, 0.018, 0.035, brass, 0.006);
      b.collide(x, 0.525, 0.015, drawerWidth, 0.24, v.depth - .01);
    }
    b.box(0, 0.743, 0, v.width - 0.07, 0.055, v.depth - 0.04, oak, 0.017);
    b.box(0, 0.789, 0, v.width, 0.062, v.depth, stone, 0.027);
    b.collide(0, 0.715, 0, v.width, 0.105, v.depth);

    // Two orderly accessory groups leave a generous clear worktop in the middle.
    const trayX = -v.width / 2 + .48, perfumeX = trayX - .18, lipstickX = trayX + .08;
    const compactX = v.width / 2 - .62, cupX = v.width / 2 - .25;
    marker('jewelry-tray', v.x + trayX, v.y + v.height, v.z + .08);
    b.box(trayX, .835, .07, .54, .025, .29, porcelain, .035);
    for (const z of [-.065, .205]) b.box(trayX, .856, z, .52, .035, .025, porcelain, .01);
    for (const x of [trayX - .256, trayX + .256]) b.box(x, .856, .07, .025, .035, .25, porcelain, .01);
    marker('perfume-bottle', v.x + perfumeX, v.y + v.height, v.z + .035);
    b.box(perfumeX, .94, .035, .11, .17, .095, amber, .018);
    b.box(perfumeX, .943, .085, .068, .055, .006, linen, .002);
    b.cylinder(perfumeX, 1.047, .035, .033, .033, .06, brass, [0, 0, 0], 10);
    marker('lipstick', v.x + lipstickX, v.y + v.height, v.z + .11);
    b.cylinder(lipstickX, .893, .11, .027, .027, .095, brass, [0, 0, 0], 10);
    b.cylinder(lipstickX, .966, .11, .019, .019, .055, rose, [0, 0, 0], 10);
    b.ellipsoid(lipstickX, .996, .11, .019, .018, .019, rose);
    marker('compact', v.x + compactX, v.y + v.height, v.z + .1, { open: true });
    b.cylinder(compactX, .837, .1, .085, .085, .028, brass, [0, 0, 0], 16);
    b.cylinder(compactX, .856, .1, .067, .067, .012, rose, [0, 0, 0], 16);
    b.cylinder(compactX, .918, .015, .085, .085, .015, brass, [Math.PI / 2 - .2, 0, 0], 16);
    b.cylinder(compactX, .916, .027, .067, .067, .006, mirror, [Math.PI / 2 - .2, 0, 0], 16);
    marker('brush-cup', v.x + cupX, v.y + v.height, v.z - .13, { brushes: 3 });
    b.cylinder(cupX, .9, -.13, .07, .058, .16, porcelain, [0, 0, 0], 12);
    b.cylinder(cupX, .982, -.13, .053, .053, .008, charcoal, [0, 0, 0], 12);
    for (let i = 0; i < 3; i++) {
      const x = cupX - .035 + i * .035, top = 1.12 + i * .035;
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
    for (const x of [-m.width / 2 + .12, m.width / 2 - .12]) b.box(x, 0, .057, .011, m.height - .3, .008, glow, .004);
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
