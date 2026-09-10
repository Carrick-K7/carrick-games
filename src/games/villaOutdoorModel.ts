import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { registerVillaSeatCollider } from './villaSeating.js';
import { registerVillaCampingCollider, VILLA_SWING, villaSwingSeat, villaCampingCarryPose, type VillaOutdoorState } from './villaOutdoor.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import type { VillaCollider, VillaPosition } from './villaWorld.js';

export function createVillaOutdoorModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(state: VillaOutdoorState, visitor: VillaPosition, yaw: number): boolean;
} {
  const root = new THREE.Group(); root.name = 'villa-outdoor-living'; parent.add(root);
  const wood = villaMaterial('#826044', .86), dark = villaMaterial('#373d36', .68, .4);
  const rope = villaMaterial('#b8a585', .96), sage = villaMaterial('#81916e', .96), light = villaMaterial('#cbd0b7', .9);
  const frame = new VillaModelBuilder(root, 'villa-swing-frame'), s = VILLA_SWING;
  frame.at(s.x, s.y, s.z, 0, () => {
    for (const side of [-1, 1]) {
      for (const z of [-.78, .78]) {
        frame.beam([side * 1.52, .02, z], [side * 1.25, 2.39, 0], .069, wood, 8);
      }
      // The leaning legs and waist-high crossbrace form one blocked side frame.
      // Foot-only boxes would let a standing visitor pass through its centre.
      frame.collide(side * 1.39, 0, 0, .42, 2.47, 1.70);
      frame.beam([side * 1.43, .87, -.48], [side * 1.43, .87, .48], .042, wood, 8);
      frame.cylinder(side * .57, 2.375, 0, .06, .06, .045, dark, [0, 0, Math.PI / 2], 8);
    }
    frame.beam([-1.46, 2.39, 0], [1.46, 2.39, 0], .077, wood, 10);
  });
  frame.finish();
  const pivot = new THREE.Group(); pivot.name = 'villa-swing-pivot'; pivot.position.set(s.x, s.y + s.pivotHeight, s.z); root.add(pivot);
  const seat = new VillaModelBuilder(pivot, 'villa-swing-seat');
  const level = -s.chainLength;
  for (const x of [-.57, .57]) {
    seat.beam([x, 0, 0], [x, level + .04, 0], .013, rope, 8);
    seat.box(x, level + .01, 0, .07, .085, .62, wood, .01);
  }
  for (let i = 0; i < 5; i++) seat.box(0, level + .055, -.235 + i * .118, 1.44, .057, .105, wood, .013);
  for (const x of [-.66, .66]) seat.beam([x, level, .25], [x, level + .49, .35], .027, wood, 8);
  for (const y of [.22, .37]) seat.box(0, level + y, .25 + y * .2, 1.37, .115, .055, wood, .015);
  seat.box(0, level + .11, -.01, 1.29, .07, .47, sage, .034);
  seat.finish().traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  const swingCollider: VillaCollider = { minX: s.x - .73, maxX: s.x + .73, minZ: s.z - .32, maxZ: s.z + .39, minY: .47, maxY: 1.02 };
  registerVillaSeatCollider(swingCollider, 'swing');

  const camping = new THREE.Group(); camping.name = 'villa-portable-camping-chair'; root.add(camping);
  const chair = new VillaModelBuilder(camping, 'camping-chair-frame');
  for (const side of [-1, 1]) {
    const x = side * .375;
    chair.beam([side * .43, .016, -.36], [x, .51, .28], .014, dark, 8);
    chair.beam([side * .43, .016, .38], [x, .51, -.28], .014, dark, 8);
    chair.beam([x, .49, .25], [x, 1.015, .335], .016, dark, 8);
    chair.beam([x, .5, -.25], [x, .68, -.18], .013, dark, 8);
    chair.beam([x, .68, -.25], [x, .69, .3], .016, dark, 8);
    chair.box(x, .698, .015, .065, .022, .56, wood, .018);
    for (const z of [-.36, .38]) chair.box(side * .43, .019, z, .065, .033, .063, dark, .012);
    chair.cylinder(side * .394, .285, 0, .03, .03, .038, dark, [0, 0, Math.PI / 2], 8);
  }
  chair.box(0, .487, -.006, .74, .035, .57, sage, .027);
  chair.geometry(new THREE.BoxGeometry(.74, .46, .024), sage, [0, .76, .293], [.16, 0, 0]);
  for (const x of [-.355, .355]) chair.beam([x, .55, .25], [x, .982, .323], .0035, light, 6);
  chair.beam([-.35, .983, .324], [.35, .983, .324], .0035, light, 6);
  chair.beam([-.375, .47, -.29], [.375, .47, -.29], .014, dark, 8);
  chair.beam([-.375, .46, .28], [.375, .46, .28], .014, dark, 8);
  chair.finish();
  camping.userData = { movable: true, seatId: 'camping-chair', material: 'sage-canvas', foldableFrame: true };
  const campingCollider: VillaCollider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 1.04 };
  registerVillaCampingCollider(campingCollider); registerVillaSeatCollider(campingCollider, 'camping-chair');
  let signature = '';
  const update = (state: VillaOutdoorState, visitor: VillaPosition, yaw: number) => {
    pivot.rotation.x = state.swingAngle;
    const swing = villaSwingSeat(state);
    Object.assign(swingCollider, { minZ: swing.seat.z - .34, maxZ: swing.seat.z + .4, minY: swing.seat.y + .47, maxY: swing.seat.y + 1.07 });
    const p = state.camping.carried ? villaCampingCarryPose(visitor, yaw) : state.camping;
    const terrain = p.y < 3 && p.z > 35 ? villaTerrainOrientation(p.x, p.z, p.yaw) : { pitch: 0, roll: 0 };
    camping.position.set(p.x, p.y, p.z); camping.rotation.order = 'YXZ'; camping.rotation.set(terrain.pitch, p.yaw, terrain.roll, 'YXZ');
    const width = Math.abs(Math.cos(p.yaw)) * .47 + Math.abs(Math.sin(p.yaw)) * .43;
    const depth = Math.abs(Math.sin(p.yaw)) * .47 + Math.abs(Math.cos(p.yaw)) * .43;
    Object.assign(campingCollider, { minX: p.x - width, maxX: p.x + width, minZ: p.z - depth, maxZ: p.z + depth,
      minY: state.camping.carried ? 1e6 : p.y, maxY: state.camping.carried ? 1e6 + 1 : p.y + 1.05 });
    camping.userData.carried = state.camping.carried;
    const next = `${p.x}/${p.y}/${p.z}/${p.yaw}/${state.camping.carried}`;
    const dirty = next !== signature; signature = next; return dirty;
  };
  return { colliders: [...frame.colliders, swingCollider, campingCollider], update };
}
