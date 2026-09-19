import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';

/** Fitted joinery follows solid partitions, never the guest/dressing doorway or
 * the west glazing. The clear cross-aisle joins the two suite doors at z=-4.9. */
export function createVillaSuiteFittings(parent: THREE.Object3D) {
  const b = new VillaModelBuilder(parent, 'villa-suite-fittings');
  const oak = villaMaterial('#aa805d', .78), walnut = villaMaterial('#574032', .8);
  const cream = villaMaterial('#eee8dc', .46), cloth = villaMaterial('#bac0ae', .94);
  const dark = villaMaterial('#383b38', .68), brass = villaMaterial('#b69b70', .33, .7);
  const stone = villaMaterial('#d8d2c5', .82), mirror = villaMaterial('#b9cccd', .09, .72);
  const glass = new THREE.MeshStandardMaterial({ color: '#b3cecc', transparent: true, opacity: .32, roughness: .38, depthWrite: false, side: THREE.DoubleSide });
  const garments = ['#ad7e73', '#6d8291', '#ddd1b9'].map(color => villaMaterial(color, .93));
  const fixture = (id: string, x: number, z: number, w: number, d: number, yaw: number, build: () => void) => {
    const marker = new THREE.Object3D(); marker.name = `suite/${id}`; marker.position.set(x, 3.6, z);
    marker.userData = { width: w, depth: d, yaw }; b.root.add(marker);
    b.at(x, 3.6, z, yaw, build);
  };
  const cabinet = (id: string, x: number, z: number, width: number, bays: number, yaw: number) => fixture(id, x, z, width, .64, yaw, () => {
    const bay = width / bays;
    b.box(0, 1.32, -.28, width, 2.64, .075, walnut, .01);
    for (let i = 0; i <= bays; i++) b.box(-width / 2 + i * bay, 1.32, 0, .045, 2.64, .61, oak, .008);
    for (const y of [.10, .43, 2.19, 2.59]) b.box(0, y, 0, width, .06, .62, oak, .008);
    for (let i = 0; i < bays; i++) {
      const cx = -width / 2 + (i + .5) * bay;
      b.beam([cx - bay * .38, 2.01, 0], [cx + bay * .38, 2.01, 0], .016, brass, 6);
      for (let j = 0; j < 3; j++) {
        const gx = cx + (j - 1) * bay * .22;
        b.beam([gx, 1.97, 0], [gx - .12, 1.84, 0], .009, brass, 5);
        b.beam([gx, 1.97, 0], [gx + .12, 1.84, 0], .009, brass, 5);
        b.box(gx, 1.47, .045, .24, .77, .18, garments[(i + j) % 3], .025);
        b.ellipsoid(gx, .23, .10, .085, .055, .18, dark);
      }
      b.box(cx, 2.32, 0, bay * .62, .19, .38, cloth, .025);
      b.box(cx, .55, .21, bay - .09, .18, .14, oak, .018);
      b.box(cx, .57, .291, .18, .015, .025, brass, .003);
    }
    b.collide(0, 0, 0, width + .06, 2.65, .65);
  });
  cabinet('north-wardrobe', -21.55, -8.52, 4.1, 3, 0);
  cabinet('south-wardrobe', -18.8, -.5, 8.5, 6, Math.PI);
  fixture('accessory-island', -19, -4.05, 2.8, 1.2, 0, () => {
    b.box(0, .47, 0, 2.72, .94, 1.12, walnut, .04); b.box(0, .97, 0, 2.8, .07, 1.2, stone, .025);
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      b.box(side * .68, .22 + row * .25, .577, 1.26, .22, .025, oak, .007);
      b.box(side * .68, .23 + row * .25, .6, .23, .016, .025, brass, .004);
    }
    b.box(.7, 1.03, -.1, .55, .04, .36, brass, .02);
    for (const x of [.53, .69, .86]) b.geometry(new THREE.TorusGeometry(.043, .006, 5, 12), brass, [x, 1.055, -.1], [Math.PI / 2, 0, 0]);
    b.collide(0, 0, 0, 2.8, 1.02, 1.2);
  });
  fixture('dressing-bench', -22.2, -4.1, .85, 1.7, 0, () => {
    b.box(0, .22, 0, .78, .32, 1.64, walnut, .04); b.box(0, .47, 0, .85, .18, 1.7, cloth, .07);
    b.collide(0, 0, 0, .85, .57, 1.7);
  });
  fixture('dressing-mirror', -13.25, -2, .11, 1.5, -Math.PI / 2, () => {
    b.box(0, 1.34, 0, 1.5, 2.4, .06, brass, .028);
    b.box(0, 1.34, .037, 1.41, 2.31, .018, mirror, .022);
  });
  // A light, flush stone finish belongs only to the wet room, not the hall.
  b.box(-8.5, 3.61, -4.5, 8.7, .018, 8.7, stone, 0);
  fixture('double-vanity', -8, -8.39, 4.4, .78, 0, () => {
    b.box(0, .40, 0, 4.32, .8, .71, walnut, .025); b.box(0, .84, 0, 4.4, .08, .78, cream, .022);
    for (const x of [-1.04, 1.04]) {
      const bowl = new THREE.LatheGeometry([new THREE.Vector2(.24, 0), new THREE.Vector2(.30, .08), new THREE.Vector2(.33, .16), new THREE.Vector2(.29, .16), new THREE.Vector2(.26, .10), new THREE.Vector2(.20, .035)], 18);
      bowl.rotateX(0); b.geometry(bowl, cream, [x, .88, 0]);
      b.cylinder(x, 1.09, -.26, .02, .02, .42, brass);
      b.beam([x, 1.28, -.26], [x, 1.28, -.08], .022, brass);
      b.box(x, .46, .367, 1.88, .55, .02, oak, .009);
      b.box(x, .67, .39, .4, .018, .025, brass, .004);
    }
    b.box(0, 1.96, -.433, 4.1, 1.28, .055, brass, .025);
    b.box(0, 1.96, -.398, 4.01, 1.19, .017, mirror, .02);
    b.collide(0, 0, 0, 4.4, 1.04, .78);
  });
  fixture('ensuite-tub', -11.55, -6.65, 1.35, 2.45, 0, () => {
    b.box(0, .14, 0, 1.35, .28, 2.45, cream, .12);
    for (const x of [-.6, .6]) b.box(x, .4, 0, .15, .5, 2.35, cream, .065);
    for (const z of [-1.1, 1.1]) b.box(0, .4, z, 1.08, .5, .19, cream, .055);
    b.box(0, .3, 0, 1.07, .015, 2.05, glass, .03);
    b.cylinder(.52, .8, -.94, .018, .018, .55, brass);
    b.beam([.52, 1.05, -.94], [.25, 1.05, -.94], .022, brass);
    b.collide(0, 0, 0, 1.35, .7, 2.45);
  });
  fixture('toilet', -11.4, -1.1, .7, 1.18, 0, () => {
    b.box(0, .50, .38, .62, .88, .22, cream, .04);
    b.ellipsoid(0, .3, -.02, .32, .3, .44, cream);
    b.ellipsoid(0, .51, -.04, .25, .013, .30, dark);
    const seat = new THREE.TorusGeometry(.25, .038, 7, 22); seat.scale(1, 1.23, 1);
    b.geometry(seat, cream, [0, .532, -.04], [Math.PI / 2, 0, 0]);
    b.box(0, .955, .38, .12, .015, .07, brass, .005);
    b.collide(0, 0, .05, .7, 1, 1.18);
  });
  fixture('ensuite-shower', -5.45, -1.32, 1.8, 1.86, 0, () => {
    b.box(0, .04, 0, 1.8, .08, 1.86, stone, .015);
    b.box(-.86, 1.12, 0, .035, 2.2, 1.8, glass, .005);
    b.box(0, 1.12, .89, 1.75, 2.2, .035, glass, .005);
    b.collide(-.86, 0, 0, .05, 2.23, 1.8);
    b.box(0, .09, .65, .64, .01, .065, dark, .002);
    b.cylinder(.67, 1.44, .67, .018, .018, 1.64, brass);
    b.beam([.67, 2.24, .67], [0, 2.24, .35], .022, brass);
    b.cylinder(0, 2.23, .35, .17, .17, .026, brass);
    b.box(.70, 1.08, .56, .18, .05, .08, brass, .01);
  });
  fixture('towel-console', -8.3, -.6, 1.5, .5, Math.PI, () => {
    b.box(0, .37, 0, 1.5, .74, .5, oak, .025);
    for (let i = 0; i < 3; i++) b.box(0, .80 + i * .075, 0, .62, .07, .35, cloth, .028);
    b.collide(0, 0, 0, 1.5, .75, .5);
  });
  b.finish();
  return { root: b.root, colliders: b.colliders };
}
