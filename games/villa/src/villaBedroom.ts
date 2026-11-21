import * as THREE from 'three';
import { villaMaterial } from './villaModel.js';
import { IndexedFittingBuilder, cabinetPull, panel, surround, vessel } from './villaFittingGeometry.js';
import type { VillaCollider } from './villaWorld.js';

import { createVillaWardrobe, VILLA_MASTER_WARDROBE, type VillaWardrobeState } from './villaWardrobe.js';
import { registerVillaSeatCollider, villaRelaxSeat } from './villaSeating.js';
export { VILLA_MASTER_WARDROBE } from './villaWardrobe.js';
import { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export const VILLA_VANITY_ACCESSORIES = ['brush-cup', 'lipstick', 'compact', 'perfume-bottle', 'jewelry-tray'] as const;

/** Scene-owned joinery; controller owns pure wardrobe state, no DOM or render targets. */
export function createVillaBedroom(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state?: VillaWardrobeState, lightOn?: boolean): boolean } {
  const b = new IndexedFittingBuilder(parent, 'Villa master bedroom');
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
      b.geometry(vessel([[.036, .028], [.042, .070], [.037, .096], [.028, .152], [.032, .51], [.041, .615],
        [.040, .645], [.034, .65], [.039, .659], [.040, .72], [0, .73]], 14), oak, [x, 0, z]);
      b.geometry(vessel([[0, 0], [.034, 0], [.042, .005], [.044, .013], [.043, .064], [.045, .068],
        [.045, .073], [.039, .076]], 16), brass, [x, 0, z]);
      b.collide(x, 0, z, 0.09, 0.73, 0.09);
    }
    const braceZ = -v.depth / 2 + .068;
    b.box(0, 0.68, braceZ, v.width - .19, 0.12, 0.07, oak, 0.008);
    b.collide(0, 0.62, braceZ, v.width - .19, 0.12, 0.07);
    const drawerWidth = (v.width - v.kneeWidth) / 2 - .045;
    const drawerX = v.kneeWidth / 2 + .015 + drawerWidth / 2;
    for (const x of [-drawerX, drawerX]) {
      const faceZ = v.depth / 2 - .052;
      for (const edge of [-1, 1]) b.box(x + edge * (drawerWidth / 2 - .015), .645, 0, .03, .24, v.depth - .1, oak, .006);
      b.box(x, .539, 0, drawerWidth - .055, .028, v.depth - .10, oak, .005);
      b.box(x, .645, -faceZ + .016, drawerWidth - .055, .202, .03, shadowOak, .005);
      b.geometry(surround(drawerWidth, .24, .02, [[0, -.02], [0, .012], [.006, .017], [.024, .017], [.033, .008], [.033, -.014]], 3), oak, [x, .645, faceZ]);
      b.geometry(panel(drawerWidth - .052, .188, .017, .021, .003), sage, [x, .645, faceZ]);
      b.geometry(cabinetPull(.182, .033, .009), brass, [x, .665, faceZ + .009]);
      b.collide(x, 0.525, 0.015, drawerWidth, 0.24, v.depth - .01);
    }
    b.box(0, 0.743, 0, v.width - 0.07, 0.055, v.depth - 0.04, oak, 0.017);
    b.box(0, 0.789, 0, v.width, 0.062, v.depth, stone, 0.027);
    b.collide(0, 0.715, 0, v.width, 0.105, v.depth);

    // Two orderly accessory groups leave a generous clear worktop in the middle.
    const trayX = -v.width / 2 + .48, perfumeX = trayX - .18, lipstickX = trayX + .08;
    const compactX = v.width / 2 - .62, cupX = v.width / 2 - .25;
    marker('jewelry-tray', v.x + trayX, v.y + v.height, v.z + .08);
    b.geometry(vessel([[0, 0], [.222, 0, .105], [.247, .005, .125], [.262, .014, .141], [.270, .039, .145],
      [.268, .044, .143], [.262, .045, .137], [.251, .019, .127], [.229, .014, .108], [0, .014]], 32, .48), porcelain, [trayX, .82, .07]);
    for (const [dx, dz, size] of [[.165, .024, .026], [.18, -.035, .017]]) {
      b.geometry(new THREE.TorusGeometry(size, .003, 7, 20), brass, [trayX + dx, .838, .07 + dz], [Math.PI / 2, 0, .12]);
    }
    marker('perfume-bottle', v.x + perfumeX, v.y + v.height, v.z + .035);
    b.geometry(vessel([[0, 0], [.045, 0, .038], [.056, .009, .047], [.058, .024, .049], [.056, .139, .048],
      [.053, .151, .045], [.041, .164, .035], [.020, .171, .020], [.018, .178], [0, .178]], 16, .65), amber, [perfumeX, .834, .035]);
    b.box(perfumeX, .925, .084, .068, .055, .003, linen, .001);
    b.geometry(vessel([[.021, 0], [.024, .002], [.024, .009], [.022, .011], [.022, .018], [.014, .019],
      [.013, .023], [.017, .024], [.017, .043], [.015, .046], [0, .046]], 16), brass, [perfumeX, 1.008, .035]);
    b.cylinder(perfumeX, 1.042, .052, .003, .003, .002, charcoal, [Math.PI / 2, 0, 0], 8);
    marker('lipstick', v.x + lipstickX, v.y + v.height, v.z + .11);
    b.geometry(vessel([[0, 0], [.022, 0], [.026, .003], [.026, .048], [.027, .050], [.027, .056], [.023, .058],
      [.022, .091], [.019, .092], [.018, .074]], 20), brass, [lipstickX, .834, .11]);
    const bullet = vessel([[.017, 0], [.018, .012], [.018, .041], [.017, .046], [.014, .048], [.010, .0495], [0, .050]], 20);
    const points = bullet.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      const y = points.getY(i); points.setY(i, y + THREE.MathUtils.smoothstep(y, .012, .041) * points.getX(i) * .85);
    }
    bullet.computeVertexNormals(); b.geometry(bullet, rose, [lipstickX, .919, .11]);
    marker('compact', v.x + compactX, v.y + v.height, v.z + .1, { open: true });
    b.geometry(vessel([[0, 0], [.071, 0], [.081, .004], [.085, .010], [.085, .027], [.082, .031],
      [.071, .031], [.067, .025], [.066, .010], [0, .010]]), brass, [compactX, .82, .1]);
    b.cylinder(compactX, .838, .1, .066, .066, .014, rose, undefined, 28);
    const lidAngle = Math.PI / 2 - .18;
    b.geometry(vessel([[0, -.007], [.071, -.007], [.083, -.003], [.085, .002], [.084, .008],
      [.076, .011], [.070, .008], [.067, .004], [0, .004]]), brass, [compactX, .922, .003], [lidAngle, 0, 0]);
    b.cylinder(compactX, .923, .008, .069, .069, .0035, mirror, [lidAngle, 0, 0], 28);
    b.beam([compactX - .036, .842, .016], [compactX + .036, .842, .016], .0065, brass, 10);
    marker('brush-cup', v.x + cupX, v.y + v.height, v.z - .13, { brushes: 3 });
    b.geometry(vessel([[0, .004], [.041, .004], [.045, 0], [.052, 0], [.057, .007], [.058, .014],
      [.069, .147], [.071, .156], [.069, .161], [.064, .162], [.061, .157], [.059, .141], [.050, .021], [.045, .014], [0, .014]], 24), porcelain, [cupX, .82, -.13]);
    for (let i = 0; i < 3; i++) {
      const x = cupX - .035 + i * .035, top = 1.12 + i * .035;
      const dx = (i - 1) * .017, tipZ = -.138 + i * .008;
      b.beam([cupX + (i - 1) * .021, .835, -.13], [x + dx, top, tipZ], .008, shadowOak, 9);
      b.geometry(vessel([[.010, -.030], [.012, -.029], [.012, -.022], [.011, -.020], [.014, .014, .011],
        [.017, .019, .011], [.017, .023, .012]], 12), brass, [x + dx, top, tipZ]);
      const w = [.016, .027, .024][i];
      b.geometry(vessel([[.012, .018, .009], [w * .85, .030, .013], [w, .047, .016], [w * .85, .062, .014],
        [w * .55, .071, .01, .003], [0, .078, 0, .005]], 14), charcoal, [x + dx, top, tipZ]);
    }
  });

  const m = VILLA_MASTER_MIRROR;
  marker('dressing-mirror', m.x, m.y, m.z, { reflection: 'environment-polished-metal', renderTarget: false, litTrim: true });
  b.at(m.x, m.y, m.z, 0, () => {
    b.geometry(surround(m.width, m.height, .15, [[0, -.023], [0, .019], [.006, .028], [.015, .031],
      [.025, .027], [.030, .030], [.035, .042], [.045, .046], [.057, .037], [.064, .026], [.060, -.018], [0, -.023]]), oak);
    b.geometry(surround(m.width - .090, m.height - .090, .105, [[0, .037], [.001, .046], [.004, .049],
      [.009, .047], [.013, .040], [.014, .032], [0, .032], [0, .037]]), brass);
    b.geometry(panel(m.width - .106, m.height - .106, .097, .012, .002), mirror, [0, 0, .034]);
    for (const x of [-m.width / 2 + .12, m.width / 2 - .12]) b.geometry(panel(.011, m.height - .3, .005, .005), glow, [x, 0, .042]);
    b.collide(0, -m.height / 2, 0.015, m.width, m.height, 0.095);
  });
  const s = VILLA_MASTER_STOOL;
  marker('dressing-stool', s.x, s.y, s.z, { upholstery: 'linen', movable: false });
  b.at(s.x, s.y, s.z, 0, () => {
    for (const x of [-0.205, 0.205]) for (const z of [-0.175, 0.175]) {
      b.beam([x * 1.07, 0.015, z * 1.07], [x, 0.37, z], 0.027, oak, 8);
      b.cylinder(x * 1.07, 0.032, z * 1.07, 0.028, 0.028, 0.055, brass, [0, 0, 0], 8);
    }
    const w = s.width / 2, d = s.depth / 2;
    b.geometry(vessel([[0, .326], [w - .055, .326, d - .055], [w - .029, .336, d - .029],
      [w - .025, .360, d - .025], [w - .032, .375, d - .032], [0, .375]], 32, .38), oak);
    b.geometry(vessel([[0, .364], [w - .043, .364, d - .043], [w - .014, .371, d - .014],
      [w, .389, d], [w, .422, d], [w - .008, .446, d - .008], [w - .027, .467, d - .027],
      [w - .059, .480, d - .059], [w * .61, .487, d * .61], [0, s.height]], 32, .38), linen);
    b.geometry(vessel([[w - .002, .380, d - .002], [w + .001, .381, d + .001], [w + .002, .384, d + .002],
      [w + .001, .387, d + .001], [w - .001, .388, d - .001]], 32, .38), sage);
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
