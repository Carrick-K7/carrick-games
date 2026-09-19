import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider, type VillaPosition } from './villaWorld.js';

export type VillaBathDoorId = 'west' | 'east';
/** Exactly two entryways, matching villaWorld's clear jambs, not two extra doors.
 * +X is into the bath at the west opening; -X is into it at the east opening. */
export const VILLA_BATH_OPENINGS = {
  west: { x: 8, z0: -6.2, z1: -3.4, swing: 1 },
  east: { x: 17, z0: -4, z1: 0, swing: -1 },
} as const;
export const VILLA_BATH_DOOR_DIMENSIONS = {
  floorY: 3.6, bottom: .03, height: 2.9, thickness: .064,
  // World owns the oak casing and its 2.96m lintel. The hinge sits just beyond
  // its bath-side face (0.135m), so an open leaf never rotates into the jamb.
  hingeDepth: .18, hingeInset: .03, meetingGap: .008,
  openAngle: Math.PI / 2, seconds: .9,
} as const;

export interface VillaBathDoorState {
  west: boolean;
  east: boolean;
  progressW: number;
  progressE: number;
}
/** Upright player cylinder in the authored villa coordinates. Position is FEET,
 * not eye height; supply actual body height (including jump offset if using the
 * ground position). Omit only when no player occupies the world. */
export interface VillaBathDoorBlocker {
  position: VillaPosition;
  height?: number;
  radius?: number;
}

const IDS = ['west', 'east'] as const;
const D = VILLA_BATH_DOOR_DIMENSIONS;
const progressOf = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0;
const angleOf = (progress: number) => progress * progress * (3 - 2 * progress) * D.openAngle;
const progressKey = (which: VillaBathDoorId) => which === 'west' ? 'progressW' : 'progressE';

/** Shared local solid bounds for rendering, movement and swept-player checks.
 * A thin panel plus two separate handle volumes, NOT a wide invisible AABB. */
const LEAVES = IDS.flatMap(which => [0, 1].map(end => {
  const opening = VILLA_BATH_OPENINGS[which], dir = end ? -1 : 1;
  const width = (opening.z1 - opening.z0) / 2 - D.hingeInset - D.meetingGap;
  const handleZ = dir * (width - .095);
  const shapes: VillaCollider[] = [{
    minX: -D.thickness / 2, maxX: D.thickness / 2,
    minY: D.bottom, maxY: D.bottom + D.height,
    minZ: dir > 0 ? -.026 : -width, maxZ: dir > 0 ? width : .026,
  }, ...[-1, 1].map(side => ({
    minX: side < 0 ? -.102 : .03, maxX: side < 0 ? -.03 : .102,
    minY: .93, maxY: 1.29, minZ: handleZ - .012, maxZ: handleZ + .012,
  }))];
  return {
    which, end, dir, width, handleZ, shapes,
    x: opening.x + opening.swing * D.hingeDepth,
    z: end ? opening.z1 - D.hingeInset : opening.z0 + D.hingeInset,
    sign: dir * opening.swing,
    reach: Math.max(...shapes.map(b => Math.hypot(Math.max(Math.abs(b.minX), Math.abs(b.maxX)), Math.max(Math.abs(b.minZ), Math.abs(b.maxZ))))),
  };
}));

function overlapsLocal(x: number, y: number, z: number, height: number, radius: number, shape: VillaCollider): boolean {
  if (y + height <= shape.minY || y >= shape.maxY) return false;
  const dx = x - Math.max(shape.minX, Math.min(x, shape.maxX));
  const dz = z - Math.max(shape.minZ, Math.min(z, shape.maxZ));
  return dx * dx + dz * dz < radius * radius;
}

function sweptLeafBlocked(leaf: (typeof LEAVES)[number], from: number, to: number, body: VillaBathDoorBlocker): boolean {
  const a = leaf.sign * angleOf(from), b = leaf.sign * angleOf(to), yaw = (a + b) / 2;
  const dx = body.position.x - leaf.x, dz = body.position.z - leaf.z;
  const x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  // Every point of the rotating leaf stays within this distance of its midpoint
  // pose. Inflating the cylinder by that bound covers the ENTIRE substep, so a
  // large dt cannot jump the leaf through somebody between collision samples.
  const sweepMargin = 2 * leaf.reach * Math.sin(Math.abs(b - a) / 4);
  return leaf.shapes.some(shape => overlapsLocal(x, body.position.y - D.floorY, z,
    body.height ?? 1.75, (body.radius ?? PLAYER_RADIUS) + sweepMargin, shape));
}

export function createVillaBathDoors(): VillaBathDoorState {
  return { west: false, east: false, progressW: 0, progressE: 0 };
}

export function toggleVillaBathDoor(state: VillaBathDoorState, which: VillaBathDoorId): boolean {
  if (!IDS.includes(which)) return false;
  state[which] = !state[which];
  return true;
}

/** Advance before refreshing the scene's colliders and moving the player.
 * An obstructed pair pauses together at the last safe pose, in BOTH directions;
 * its target stays set and motion resumes when the player clears the swing.
 * The other entryway continues independently. No player relocation/push-out. */
export function advanceVillaBathDoors(state: VillaBathDoorState, dt: number, blocker?: VillaBathDoorBlocker): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  if (blocker && (![blocker.position.x, blocker.position.y, blocker.position.z, blocker.height ?? 1.75, blocker.radius ?? PLAYER_RADIUS].every(Number.isFinite)
    || (blocker.height ?? 1.75) <= 0 || (blocker.radius ?? PLAYER_RADIUS) <= 0)) return false;
  const step = Math.min(1, dt / D.seconds);
  let changed = false;
  for (const which of IDS) {
    const key = progressKey(which), before = progressOf(state[key]), target = Number(state[which]);
    const next = before + Math.sign(target - before) * Math.min(step, Math.abs(target - before));
    let accepted = before;
    if (!blocker) accepted = next;
    else if (next !== before) {
      // Smoothstep's derivative is at most 1.5; limit angular travel to .01 rad
      // for close, millimetre-scale stopping without unbounded large-dt loops.
      const steps = Math.max(1, Math.ceil(Math.abs(next - before) * D.openAngle * 1.5 / .01));
      for (let i = 1; i <= steps; i++) {
        const candidate = before + (next - before) * i / steps;
        if (LEAVES.some(leaf => leaf.which === which && sweptLeafBlocked(leaf, accepted, candidate, blocker))) break;
        accepted = candidate;
      }
    }
    if (accepted !== state[key]) changed = true;
    state[key] = accepted;
  }
  return changed;
}

/** Parent owns disposal and must append these LIVE collider objects (not copies)
 * to its collision list. update(undefined) resets to closed. The authored root
 * is upright/unscaled; rigid parent translation/yaw is reflected by update,
 * but the pure advance() guard always receives authored villa coordinates. */
export function createVillaBathDoorModel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'bath-doors'; root.userData = { kind: 'bath-doors', entryways: 2, movingLeaves: 4 }; parent.add(root);
  // Satin etched glass admits light, not a clear bathroom view. The central
  // opaque ceramic-frit band covers both standing and seated sightlines, and a
  // second thin band makes the privacy treatment intentional from either side.
  const frosted = villaMaterial('#d5e2df', .94);
  frosted.transparent = true; frosted.opacity = .93; frosted.depthWrite = true; frosted.name = 'bath-door-frosted';
  const privacy = villaMaterial('#d1dcd6', .98); privacy.name = 'bath-door-privacy-frit';
  const steel = villaMaterial('#9faaa6', .42, .62); steel.name = 'bath-door-frame';
  const brass = villaMaterial('#b69e72', .36, .68); brass.name = 'bath-door-handles';
  const seal = villaMaterial('#5e6b65', .88); seal.name = 'bath-door-gaskets';
  const colliders: VillaCollider[] = [];
  const leaves = LEAVES.map(layout => {
    const { which, end, dir, width, handleZ } = layout;
    const pivot = new THREE.Group(); pivot.name = `bath-door-${which}-${end ? 'far' : 'near'}`;
    pivot.position.set(layout.x, D.floorY, layout.z); root.add(pivot);
    const leaf = new VillaModelBuilder(pivot, `bath-door-leaf-${which}-${end}`);
    const centre = dir * width / 2, top = D.bottom + D.height, stile = .064;
    // Full perimeter joinery, taller than the former 2.1m shower-screen leaves:
    // a 30mm undercut and 30mm head reveal fit the existing 2.96m clear opening.
    for (const z of [dir * stile / 2, dir * (width - stile / 2)]) {
      leaf.box(0, D.bottom + D.height / 2, z, D.thickness, D.height, stile, steel, .004);
    }
    leaf.box(0, D.bottom + .06, centre, D.thickness, .12, width - 2 * stile, steel, .004);
    leaf.box(0, top - .0425, centre, D.thickness, .085, width - 2 * stile, steel, .004);
    // Inset glazing/frit sections share edges but never coplanar exposed faces.
    for (const [bottom, height, material] of [
      [.15, .26, frosted], [.41, 1.65, privacy], [2.06, .22, frosted],
      [2.28, .055, privacy], [2.335, .51, frosted],
    ] as const) leaf.box(0, bottom + height / 2, centre, .022, height, width - 2 * stile, material, 0);
    for (const y of [.41, 2.06, 2.28, 2.335]) leaf.box(0, y, centre, .028, .008, width - 2 * stile, seal, 0);
    for (const y of [.34, 1.48, 2.62]) leaf.cylinder(0, y, 0, .026, .026, .12, steel, [0, 0, 0], 10);
    // Matching real pulls on both faces: neither approach is a non-operable back.
    for (const side of [-1, 1]) {
      for (const y of [.96, 1.26]) leaf.cylinder(side * .06, y, handleZ, .012, .012, .06, brass, [0, 0, Math.PI / 2], 8);
      leaf.cylinder(side * .09, 1.11, handleZ, .012, .012, .36, brass, [0, 0, 0], 10);
    }
    leaf.finish();
    const collider: VillaCollider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    colliders.push(collider);
    pivot.userData = { animated: true, which, hinge: [layout.x, D.floorY, layout.z], collider, openFraction: 0, handles: 2 };
    const bounds = new THREE.Box3();
    for (const shape of layout.shapes) bounds.union(new THREE.Box3(new THREE.Vector3(shape.minX, shape.minY, shape.minZ), new THREE.Vector3(shape.maxX, shape.maxY, shape.maxZ)));
    const inverse = new THREE.Matrix4(), query = new THREE.Vector3();
    setVillaColliderNarrowPhase(collider, (p, height) => {
      query.set(p.x, p.y, p.z).applyMatrix4(inverse);
      return layout.shapes.some(shape => overlapsLocal(query.x, query.y, query.z, height, PLAYER_RADIUS, shape));
    });
    return { layout, pivot, collider, bounds, inverse };
  });
  const world = new THREE.Box3();
  const update = (state?: VillaBathDoorState): boolean => {
    let changed = false;
    for (const leaf of leaves) {
      const progress = progressOf(state?.[progressKey(leaf.layout.which)]), yaw = leaf.layout.sign * angleOf(progress);
      if (leaf.pivot.rotation.y !== yaw) changed = true;
      leaf.pivot.rotation.y = yaw; leaf.pivot.userData.openFraction = progress;
    }
    root.updateWorldMatrix(true, true);
    // Do not short-circuit after one changed pair: refresh every inverse and all
    // four AABBs in place, including on parent-transform changes and resets.
    for (const leaf of leaves) {
      leaf.inverse.copy(leaf.pivot.matrixWorld).invert(); world.copy(leaf.bounds).applyMatrix4(leaf.pivot.matrixWorld);
      const next = { minX: world.min.x, maxX: world.max.x, minY: world.min.y, maxY: world.max.y, minZ: world.min.z, maxZ: world.max.z };
      if ((Object.keys(next) as (keyof VillaCollider)[]).some(key => leaf.collider[key] !== next[key])) changed = true;
      Object.assign(leaf.collider, next);
    }
    return changed;
  };
  update();
  return { root, colliders, doorColliders: colliders, update };
}
