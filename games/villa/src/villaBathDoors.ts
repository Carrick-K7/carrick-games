import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider, type VillaPosition } from './villaWorld.js';

export type VillaBathDoorId = 'west' | 'east';
/** Exactly two entryways matching villaWorld's clear jambs. Both pairs slide
 * NORTH and stack on the bathroom-side return, never into the south bath wall.
 * `swing` is a retained orientation sign, NOT an angular motion parameter:
 * +X is into the bath at west; -X is into it at east. */
export const VILLA_BATH_OPENINGS = {
  west: { x: 8, z0: -6.2, z1: -3.4, swing: 1 },
  east: { x: 17, z0: -4, z1: 0, swing: -1 },
} as const;
export const VILLA_BATH_DOOR_DIMENSIONS = {
  floorY: 3.6, bottom: .03, height: 2.9, thickness: .064,
  // Parallel bath-side tracks clear the world's 0.135m-deep oak jambs.
  nearTrackDepth: .235, farTrackDepth: .360, jambOverlap: .45, meetingOverlap: .30,
  parkingGap: .06, railOverhang: .12, railY: 3.065, seconds: 1.5,
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
const eased = (progress: number) => progress * progress * (3 - 2 * progress);
const progressKey = (which: VillaBathDoorId) => which === 'west' ? 'progressW' : 'progressE';

/** Shared panel/roller bounds for rendering, live collision and exact swept
 * translation. Flush recessed pulls remain INSIDE the 64mm panel thickness;
 * the two tracks retain 61mm of clear space even when the leaves are stacked. */
export const VILLA_BATH_SLIDING_LEAVES = IDS.flatMap(which => [0, 1].map(end => {
  const opening = VILLA_BATH_OPENINGS[which], middle = (opening.z0 + opening.z1) / 2;
  // Sliding leaves need REAL cover behind their jambs. A 15mm cover at a
  // 235/360mm inset left a clear view around the panels from the gallery.
  // Generous wall overlap plus a lapped centre joint seals ordinary oblique
  // sightlines without a fixed return obstructing either moving track.
  const closedMinZ = end ? middle - D.meetingOverlap / 2 : opening.z0 - D.jambOverlap;
  const closedMaxZ = end ? opening.z1 + D.jambOverlap : middle + D.meetingOverlap / 2;
  const width = closedMaxZ - closedMinZ, closedZ = (closedMinZ + closedMaxZ) / 2;
  const parkedZ = opening.z0 - D.parkingGap - width / 2;
  const rollers = [-width * .32, width * .32];
  const shapes: VillaCollider[] = [{
    minX: -D.thickness / 2, maxX: D.thickness / 2,
    minY: D.bottom, maxY: D.bottom + D.height,
    minZ: -width / 2, maxZ: width / 2,
  }, ...rollers.map(z => ({
    minX: -.022, maxX: .022, minY: 2.89, maxY: 3.055,
    minZ: z - .035, maxZ: z + .035,
  }))];
  // Keep both finger cups in the visible aperture rather than burying the
  // leading pull behind the newly extended jamb cover.
  const handleZ = (end ? opening.z1 - .18 : middle - .26) - closedZ;
  return { which, end, width, rollers, handleZ, shapes,
    x: opening.x + opening.swing * (end ? D.farTrackDepth : D.nearTrackDepth),
    closedZ, parkedZ, travel: closedZ - parkedZ,
  };
}));
const LEAVES = VILLA_BATH_SLIDING_LEAVES;
const leafZ = (leaf: (typeof LEAVES)[number], progress: number) => leaf.closedZ - leaf.travel * eased(progress);

function overlapsLocal(x: number, y: number, z: number, height: number, radius: number, shape: VillaCollider): boolean {
  if (y + height <= shape.minY || y >= shape.maxY) return false;
  const dx = x - Math.max(shape.minX, Math.min(x, shape.maxX));
  const dz = z - Math.max(shape.minZ, Math.min(z, shape.maxZ));
  return dx * dx + dz * dz < radius * radius;
}

function sweptLeafBlocked(leaf: (typeof LEAVES)[number], from: number, to: number, body: VillaBathDoorBlocker): boolean {
  const a = leafZ(leaf, from), b = leafZ(leaf, to);
  // The union of an axis-aligned box translating along Z is exactly this box,
  // not a sampled path or radial inflation. Even an unbounded dt cannot move
  // a panel through a cylinder that clears both endpoint poses.
  return leaf.shapes.some(shape => overlapsLocal(body.position.x - leaf.x, body.position.y - D.floorY, body.position.z,
    body.height ?? 1.75, body.radius ?? PLAYER_RADIUS,
    { ...shape, minZ: shape.minZ + Math.min(a, b), maxZ: shape.maxZ + Math.max(a, b) }));
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
 * its target stays set and motion resumes when the player clears the track.
 * The other entryway continues independently. No player relocation/push-out. */
export function advanceVillaBathDoors(state: VillaBathDoorState, dt: number, blocker?: VillaBathDoorBlocker): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  if (blocker && (![blocker.position.x, blocker.position.y, blocker.position.z, blocker.height ?? 1.75, blocker.radius ?? PLAYER_RADIUS].every(Number.isFinite)
    || (blocker.height ?? 1.75) <= 0 || (blocker.radius ?? PLAYER_RADIUS) <= 0)) return false;
  const step = Math.min(1, dt / D.seconds);
  let changed = false;
  for (const which of IDS) {
    const key = progressKey(which), before = progressOf(state[key]), target = Number(state[which]);
    const proposed = before + Math.sign(target - before) * Math.min(step, Math.abs(target - before));
    // Finish an accumulated fractional clock at its exact endpoint rather than
    // spend another frame on a progress ULP whose eased geometry cannot move.
    const next = Math.abs(target - proposed) < 1e-12 ? target : proposed;
    let accepted = before;
    if (!blocker) accepted = next;
    else if (next !== before) {
      // Smoothstep's derivative is at most 1.5; limit far-panel travel to 1cm
      // for a close safe stop, with <=677 bounded substeps even for infinite-
      // sized finite dt. Each substep still tests the complete swept volume.
      const travel = Math.max(...LEAVES.filter(leaf => leaf.which === which).map(leaf => leaf.travel));
      const steps = Math.max(1, Math.ceil(Math.abs(next - before) * travel * 1.5 / .01));
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
  const root = new THREE.Group(); root.name = 'bath-doors'; root.userData = { kind: 'bath-doors', entryways: 2, movingLeaves: 4, motion: 'north-stacking-slide', seconds: D.seconds }; parent.add(root);
  // Satin etched glass admits light, not a clear bathroom view. The central
  // opaque ceramic-frit band covers both standing and seated sightlines, and a
  // second thin band makes the privacy treatment intentional from either side.
  const frosted = villaMaterial('#d5e2df', .94);
  frosted.transparent = true; frosted.opacity = .93; frosted.depthWrite = true; frosted.name = 'bath-door-frosted';
  const privacy = villaMaterial('#d1dcd6', .98); privacy.name = 'bath-door-privacy-frit';
  const steel = villaMaterial('#9faaa6', .42, .62); steel.name = 'bath-door-frame';
  const brass = villaMaterial('#b69e72', .36, .68); brass.name = 'bath-door-handles';
  const seal = villaMaterial('#5e6b65', .88); seal.name = 'bath-door-gaskets';
  const tracks = new VillaModelBuilder(root, 'bath-door-overhead-tracks');
  for (const which of IDS) {
    const o = VILLA_BATH_OPENINGS[which], pair = LEAVES.filter(leaf => leaf.which === which);
    const north = pair[0]!.parkedZ - pair[0]!.width / 2 - D.railOverhang;
    const south = pair[1]!.closedZ + pair[1]!.width / 2 + D.railOverhang;
    for (const layout of pair) tracks.box(layout.x, D.floorY + D.railY, (north + south) / 2, .056, .036, south - north, steel, .003);
    // Wall-mounted standoffs terminate on the actual bath-side plaster/casing;
    // all sit above head clearance and therefore need no extra gameplay boxes.
    const mounts = Math.ceil((south - north) / 1.0);
    for (let i = 0; i <= mounts; i++) {
      const z = north + (south - north) * i / mounts;
      tracks.box(o.x + o.swing * .120, D.floorY + 3.12, z, .034, .18, .09, steel, .004);
      tracks.box(o.x + o.swing * .266, D.floorY + 3.14, z, .27, .045, .065, steel, .004);
    }
    // Slim paired-channel cover: visible horizontal hardware, not a wall-sized
    // pelmet. Both channels extend across the full parking + doorway strip.
    tracks.box(o.x + o.swing * .2975, D.floorY + 3.155, (north + south) / 2, .26, .055, south - north, steel, .004);
    const marker = new THREE.Object3D(); marker.name = `bath-door-track-${which}`;
    marker.userData = { minZ: north, maxZ: south, trackOffsets: [D.nearTrackDepth, D.farTrackDepth], direction: 'north', wallMounted: true }; tracks.root.add(marker);
  }
  tracks.finish();
  const colliders: VillaCollider[] = [];
  const leaves = LEAVES.map(layout => {
    const { which, end, width, handleZ } = layout;
    const pivot = new THREE.Group(); pivot.name = `bath-door-${which}-${end ? 'far' : 'near'}`;
    pivot.position.set(layout.x, D.floorY, layout.closedZ); root.add(pivot);
    const leaf = new VillaModelBuilder(pivot, `bath-door-leaf-${which}-${end}`);
    const centre = 0, top = D.bottom + D.height, stile = .064;
    // Full-height panels retain their 30mm undercut/30mm head reveal. Only the
    // slim roller hangers rise above the panel, outside the casing's depth.
    for (const z of [-width / 2 + stile / 2, width / 2 - stile / 2]) {
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
    for (const z of layout.rollers) {
      leaf.box(0, 2.953, z, .034, .126, .036, steel, .002);
      leaf.cylinder(0, 3.02, z, .035, .035, .042, steel, [0, 0, Math.PI / 2], 12);
      leaf.cylinder(0, 3.02, z, .015, .015, .043, brass, [0, 0, Math.PI / 2], 10);
    }
    // Recessed finger cups on BOTH faces. A dark backing lies below an open
    // brass bezel; no protruding bar can clip the other leaf when stacking.
    for (const side of [-1, 1]) {
      leaf.box(side * .015, 1.11, handleZ, .003, .29, .085, seal, .003);
      for (const z of [handleZ - .05, handleZ + .05]) leaf.box(side * .029, 1.11, z, .006, .34, .015, brass, .002);
      for (const y of [.95, 1.27]) leaf.box(side * .029, y, handleZ, .006, .02, .10, brass, .002);
    }
    leaf.finish();
    const collider: VillaCollider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    colliders.push(collider);
    pivot.userData = { animated: true, which, motion: 'linear-north', closedZ: layout.closedZ, parkedZ: layout.parkedZ, travel: layout.travel,
      trackX: layout.x, panelWidth: width, panelBottom: D.bottom, panelTop: top, collider, openFraction: 0, handles: 2, recessedPulls: true };
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
      const progress = progressOf(state?.[progressKey(leaf.layout.which)]), z = leafZ(leaf.layout, progress);
      if (leaf.pivot.position.z !== z || leaf.pivot.rotation.y !== 0) changed = true;
      leaf.pivot.position.z = z; leaf.pivot.rotation.y = 0; leaf.pivot.userData.openFraction = progress;
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
