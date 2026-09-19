import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';

/** The bath keeps exactly two closable openings (west from the lift lobby, east
 * from the reading hall). Each takes a pair of frosted-glass leaves that swing
 * into the bath, driven by the same eased-progress contract as the wardrobes. */

export interface VillaBathDoorState {
  west: boolean;
  east: boolean;
  progressW: number;
  progressE: number;
}

export function createVillaBathDoors(): VillaBathDoorState {
  return { west: false, east: false, progressW: 0, progressE: 0 };
}

export function toggleVillaBathDoor(state: VillaBathDoorState, which: 'west' | 'east'): boolean {
  if (which !== 'west' && which !== 'east') return false;
  state[which] = !state[which];
  return true;
}

const SECONDS = 0.9;
export function advanceVillaBathDoors(state: VillaBathDoorState, dt: number): boolean {
  const step = Number.isFinite(dt) ? Math.max(0, dt) / SECONDS : 0;
  const before = `${state.progressW.toFixed(3)}/${state.progressE.toFixed(3)}`;
  state.progressW += Math.sign(Number(state.west) - state.progressW) * Math.min(step, Math.abs(Number(state.west) - state.progressW));
  state.progressE += Math.sign(Number(state.east) - state.progressE) * Math.min(step, Math.abs(Number(state.east) - state.progressE));
  return `${state.progressW.toFixed(3)}/${state.progressE.toFixed(3)}` !== before;
}

/** Opening geometry: x = wall line, z0/z1 = jamb positions, swing = which side
 * the leaves rest against when open (+1 opens toward +x). */
const OPENINGS = {
  west: { x: 8, z0: -6.2, z1: -3.4, swing: 1 },
  east: { x: 17, z0: -4, z1: 0, swing: -1 },
} as const;

export function createVillaBathDoorModel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'bath-doors'; root.userData = { kind: 'bath-doors' }; parent.add(root);
  const frosted = villaMaterial('#cfe4e8', .3);
  frosted.transparent = true; frosted.opacity = .42; frosted.roughness = .32; frosted.depthWrite = false;
  frosted.name = 'bath-door-frosted';
  const steel = villaMaterial('#adb5b4', .25, .78);
  const brass = villaMaterial('#b59962', .3, .7);
  const leaves: { pivot: THREE.Group; which: 'west' | 'east'; sign: 1 | -1 }[] = [];
  const openAngle = 1.42; // ~81°, resting nearly flat against the bath wall
  for (const which of ['west', 'east'] as const) {
    const opening = OPENINGS[which];
    const width = (opening.z1 - opening.z0) / 2;
    for (const end of [0, 1] as const) {
      const hingeZ = end ? opening.z1 : opening.z0;
      const pivot = new THREE.Group();
      pivot.name = `bath-door-${which}-${end ? 'far' : 'near'}`;
      pivot.position.set(opening.x, 3.6, hingeZ);
      pivot.userData = { animated: true };
      parent.add(pivot);
      const leaf = new VillaModelBuilder(pivot, `bath-door-leaf-${which}-${end}`);
      // Leaf builder runs in hinge-local space: the panel extends toward the
      // meeting stile along +z (near end) or -z (far end).
      const dir = end ? -1 : 1;
      leaf.at(0, 0, 0, 0, () => {
        // Panel extends along z from the hinge; thickness across x.
        leaf.box(0, 1.05, dir * width / 2, .045, 2.1, width - .06, frosted, .01);
        // Steel stiles top and bottom, a brass handle at the meeting edge.
        leaf.box(0, .12, dir * width / 2, .05, .1, width - .06, steel, .008);
        leaf.box(0, 2.02, dir * width / 2, .05, .1, width - .06, steel, .008);
        leaf.box(dir * .06, 1.05, dir * (width - .1), .05, .3, .05, brass, .012);
      });
      leaf.finish();
      leaves.push({ pivot, which, sign: (end ? -1 : 1) * opening.swing as 1 | -1 });
    }
  }
  const update = (state: VillaBathDoorState) => {
    for (const leaf of leaves) {
      const progress = leaf.which === 'west' ? state.progressW : state.progressE;
      leaf.pivot.rotation.y = leaf.sign * openAngle * progress;
    }
  };
  update(createVillaBathDoors());
  return { update };
}
