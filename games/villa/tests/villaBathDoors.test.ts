import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaBathDoors, createVillaBathDoorModel, createVillaBathDoors, toggleVillaBathDoor,
  VILLA_BATH_DOOR_DIMENSIONS, VILLA_BATH_OPENINGS, type VillaBathDoorId,
} from '../src/villaBathDoors.js';
import {
  moveVillaPlayer, nearestVillaHotspot, PLAYER_RADIUS, villaCollides, VILLA_BLOCKS, VILLA_HOTSPOTS, VILLA_WALL_COLLIDERS,
  type VillaCollider, type VillaPosition,
} from '../src/villaWorld.js';

const roots: THREE.Group[] = [];
const D = VILLA_BATH_DOOR_DIMENSIONS;
const IDS = ['west', 'east'] as const;
const key = (which: VillaBathDoorId) => which === 'west' ? 'progressW' : 'progressE';
const floorSupport = () => D.floorY;
function make() {
  const root = new THREE.Group(); roots.push(root);
  return { parent: root, model: createVillaBathDoorModel(root), state: createVillaBathDoors() };
}
function openingPoint(which: VillaBathDoorId, side = 0): VillaPosition {
  const o = VILLA_BATH_OPENINGS[which];
  return { x: o.x + side * .9, y: D.floorY, z: (o.z0 + o.z1) / 2 };
}
function leafNode(root: THREE.Object3D, which: VillaBathDoorId, end: number) {
  return root.getObjectByName(`bath-door-${which}-${end ? 'far' : 'near'}`)!;
}
function expectEnclosed(node: THREE.Object3D, c: VillaCollider) {
  const box = new THREE.Box3().setFromObject(node);
  expect(box.min.x).toBeGreaterThanOrEqual(c.minX - 1e-6); expect(box.max.x).toBeLessThanOrEqual(c.maxX + 1e-6);
  expect(box.min.y).toBeGreaterThanOrEqual(c.minY - 1e-6); expect(box.max.y).toBeLessThanOrEqual(c.maxY + 1e-6);
  expect(box.min.z).toBeGreaterThanOrEqual(c.minZ - 1e-6); expect(box.max.z).toBeLessThanOrEqual(c.maxZ + 1e-6);
}
afterEach(() => roots.splice(0).forEach(root => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
}));

describe('bath-door state and finite reversible clocks', () => {
  it('starts closed, preserves targets and reports even sub-milliframe movement', () => {
    const state = createVillaBathDoors();
    expect(state).toEqual({ west: false, east: false, progressW: 0, progressE: 0 });
    expect(toggleVillaBathDoor(state, 'north' as VillaBathDoorId)).toBe(false);
    expect(toggleVillaBathDoor(state, 'west')).toBe(true);
    expect(advanceVillaBathDoors(state, .45)).toBe(true);
    expect(state.progressW).toBeCloseTo(.5); expect(state.progressE).toBe(0);
    toggleVillaBathDoor(state, 'west'); expect(state.progressW).toBeCloseTo(.5);
    advanceVillaBathDoors(state, .09); expect(state.progressW).toBeCloseTo(.4);
    expect(advanceVillaBathDoors(state, .000001)).toBe(true);
    const snapshot = { ...state };
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) expect(advanceVillaBathDoors(state, dt)).toBe(false);
    expect(state).toEqual(snapshot);
    advanceVillaBathDoors(state, Number.MAX_VALUE); expect(state.progressW).toBe(0);
    IDS.forEach(id => toggleVillaBathDoor(state, id));
    advanceVillaBathDoors(state, Number.MAX_VALUE);
    expect(state.progressW).toBe(1); expect(state.progressE).toBe(1);
    expect(advanceVillaBathDoors(state, 1)).toBe(false);
  });

  it('keeps state and collider transforms finite on malformed progress and absent/reset state', () => {
    const { state, model } = make(), closed = model.colliders.map(c => ({ ...c }));
    state.west = state.east = true; state.progressW = NaN; state.progressE = Infinity;
    expect(model.update(state)).toBe(false);
    expect(model.colliders).toEqual(closed);
    expect(advanceVillaBathDoors(state, .45)).toBe(true);
    expect(state.progressW).toBeCloseTo(.5); expect(state.progressE).toBeCloseTo(.5);
    expect(model.update(state)).toBe(true);
    expect(model.colliders.every(c => Object.values(c).every(Number.isFinite))).toBe(true);
    expect(model.update()).toBe(true); expect(model.colliders).toEqual(closed);
    expect(model.update(undefined)).toBe(false);
    state.progressW = -10; state.progressE = 10;
    model.update(state);
    expect(leafNode(model.root, 'west', 0).rotation.y).toBe(0);
    expect(Math.abs(leafNode(model.root, 'east', 0).rotation.y)).toBeCloseTo(Math.PI / 2);
  });
});

describe('two privacy entryways aligned with the actual villa', () => {
  it('fits the existing two clear openings and lintels, with every mesh under the returned root', () => {
    const { parent, model } = make();
    expect(parent.children).toEqual([model.root]);
    expect(model.root.userData).toMatchObject({ entryways: 2, movingLeaves: 4 });
    expect(model.doorColliders).toHaveLength(4); expect(model.colliders).toHaveLength(4);
    expect(model.root.children).toHaveLength(4);
    expect(VILLA_HOTSPOTS.filter(h => h.id.startsWith('bath-door-')).map(h => h.id).sort()).toEqual(['bath-door-east', 'bath-door-west']);
    for (const [i, which] of IDS.entries()) {
      const o = VILLA_BATH_OPENINGS[which];
      const lintel = VILLA_BLOCKS.find(b => b.material === 'oak' && b.x === o.x && Math.abs(b.z - (o.z0 + o.z1) / 2) < .001 && Math.abs(b.d - (o.z1 - o.z0)) < .001 && b.y > D.floorY + 2.9);
      expect(lintel).toBeDefined();
      for (const end of [0, 1]) {
        const node = leafNode(model.root, which, end), c = model.colliders[i * 2 + end];
        const bounds = new THREE.Box3().setFromObject(node);
        expect(node.parent).toBe(model.root); expect(node.userData.collider).toBe(c); expect(node.userData.handles).toBe(2);
        expect(bounds.min.z).toBeGreaterThan(o.z0); expect(bounds.max.z).toBeLessThan(o.z1);
        expect(bounds.min.y).toBeCloseTo(D.floorY + .03, 5);
        expect(bounds.max.y).toBeCloseTo(D.floorY + 2.93, 5);
        expect(lintel!.y - lintel!.h / 2 - bounds.max.y).toBeCloseTo(.03, 5);
        expectEnclosed(node, c);
      }
      // Both jambs border actual wall, while the centre is a world opening.
      expect(villaCollides(openingPoint(which), VILLA_WALL_COLLIDERS, 1.75)).toBe(false);
      expect(villaCollides({ x: o.x, y: D.floorY, z: o.z0 - .1 }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
      expect(villaCollides({ x: o.x, y: D.floorY, z: o.z1 + .1 }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
    }
    // Bath north/south partitions remain solid: no accidental third entryway.
    for (const z of [-9, 1]) for (const x of [8.5, 10, 12.5, 15, 16.5]) {
      expect(villaCollides({ x, y: D.floorY, z }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
    }
  });

  it('has strong frosted glazing and opaque eye-level privacy, seen identically from both sides', () => {
    const { model } = make();
    const materials = new Set<THREE.MeshStandardMaterial>();
    model.root.traverse(node => { if (node instanceof THREE.Mesh) materials.add(node.material as THREE.MeshStandardMaterial); });
    const frost = [...materials].find(m => m.name === 'bath-door-frosted')!;
    expect(frost.opacity).toBeGreaterThanOrEqual(.9); expect(frost.roughness).toBeGreaterThanOrEqual(.9); expect(frost.depthWrite).toBe(true);
    const privacy = [...materials].find(m => m.name === 'bath-door-privacy-frit')!;
    expect(privacy.transparent).toBe(false); expect(privacy.opacity).toBe(1);
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], z = o.z0 + (o.z1 - o.z0) / 4;
      for (const side of [-1, 1]) for (const height of [.75, 1.65, 1.95]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(o.x + side, D.floorY + height, z), new THREE.Vector3(-side, 0, 0), 0, 2);
        const hit = ray.intersectObject(model.root, true)[0];
        expect(hit).toBeDefined(); expect((hit.object as THREE.Mesh).material).toBe(privacy);
      }
    }
  });

  it('blocks closed traversal through both leaves and their meeting seam from either side', () => {
    const { model } = make(), obstacles = [...VILLA_WALL_COLLIDERS, ...model.colliders];
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], hingeX = o.x + o.swing * D.hingeDepth;
      for (const t of [.25, .5, .75]) {
        const z = o.z0 + t * (o.z1 - o.z0);
        expect(villaCollides({ x: hingeX, y: D.floorY, z }, model.colliders, 1.75)).toBe(true);
        for (const side of [-1, 1]) {
          const start = { x: o.x + side, y: D.floorY, z };
          expect(villaCollides(start, obstacles, 1.75)).toBe(false);
          const result = moveVillaPlayer(start, -side * 2, 0, obstacles, floorSupport, 1.75);
          expect((result.x - hingeX) * side).toBeGreaterThan(PLAYER_RADIUS);
        }
      }
    }
  });

  it('leaves a traversable open passage and usable closed/open hotspots on both sides', () => {
    const { model, state } = make();
    for (const open of [false, true]) {
      if (open) { state.west = state.east = true; advanceVillaBathDoors(state, 2); model.update(state); }
      const obstacles = [...VILLA_WALL_COLLIDERS, ...model.colliders];
      for (const which of IDS) for (const side of [-1, 1]) {
        const p = openingPoint(which, side);
        expect(villaCollides(p, obstacles, 1.75)).toBe(false);
        expect(nearestVillaHotspot(p)?.id).toBe(`bath-door-${which}`);
        if (open) {
          const result = moveVillaPlayer(p, -side * 1.8, 0, obstacles, floorSupport, 1.75);
          expect(result.x).toBeCloseTo(openingPoint(which, -side).x, 6);
          expect(result.z).toBe(p.z);
        }
      }
    }
  });
});

describe('live rotated door collider identities', () => {
  it('updates all four colliders and meshes every frame, never replacing or disabling a leaf', () => {
    const { model, state } = make(), array = model.colliders, identities = [...model.colliders];
    const closed = identities.map(c => ({ ...c }));
    state.west = state.east = true;
    for (let step = 0; step < 24; step++) {
      const previous = identities.map(c => ({ ...c }));
      const changed = advanceVillaBathDoors(state, .045);
      expect(model.update(state)).toBe(changed);
      expect(model.colliders).toBe(array);
      IDS.forEach((which, i) => {
        const o = VILLA_BATH_OPENINGS[which], width = (o.z1 - o.z0) / 2 - D.hingeInset - D.meetingGap;
        for (const end of [0, 1]) {
          const index = i * 2 + end, c = model.colliders[index], node = leafNode(model.root, which, end);
          expect(c).toBe(identities[index]); expect(Object.values(c).every(Number.isFinite)).toBe(true);
          if (changed) expect(c).not.toEqual(previous[index]);
          expectEnclosed(node, c);
          const onLeaf = node.localToWorld(new THREE.Vector3(0, .6, (end ? -1 : 1) * width / 2));
          expect(villaCollides(onLeaf, [c], .8)).toBe(true);
        }
      });
      expect(model.update(state)).toBe(false);
    }
    expect(state.progressW).toBe(1); expect(state.progressE).toBe(1);
    expect(model.update()).toBe(true); identities.forEach((c, i) => expect(c).toEqual(closed[i]));
  });

  it('uses narrow-phase rotated panels, not filled AABB corners, at intermediate angles', () => {
    const { model, state } = make(); state.progressW = state.progressE = .5; model.update(state);
    for (const c of model.colliders) {
      let emptyCorners = 0;
      for (const tx of [.05, .95]) for (const tz of [.05, .95]) {
        const p = { x: c.minX + tx * (c.maxX - c.minX), y: D.floorY, z: c.minZ + tz * (c.maxZ - c.minZ) };
        expect(villaCollides(p, [{ ...c }], 1.75)).toBe(true);
        if (!villaCollides(p, [c], 1.75)) emptyCorners++;
      }
      expect(emptyCorners).toBeGreaterThanOrEqual(2);
    }
  });

  it('refreshes all world transforms even at unchanged progress after moving the parent', () => {
    const { parent, model, state } = make(), identities = [...model.colliders];
    state.progressW = state.progressE = .65; model.update(state);
    const before = identities.map(c => ({ ...c }));
    parent.position.set(2, 1, -3); parent.rotation.y = .37;
    expect(model.update(state)).toBe(true);
    IDS.forEach((which, i) => {
      const o = VILLA_BATH_OPENINGS[which], width = (o.z1 - o.z0) / 2 - D.hingeInset - D.meetingGap;
      for (const end of [0, 1]) {
        const index = i * 2 + end, node = leafNode(model.root, which, end), c = model.colliders[index];
        expect(c).toBe(identities[index]); expect(c).not.toEqual(before[index]); expectEnclosed(node, c);
        expect(villaCollides(node.localToWorld(new THREE.Vector3(0, .5, (end ? -1 : 1) * width / 2)), [c], .8)).toBe(true);
      }
    });
    expect(model.update(state)).toBe(false);
  });
});

describe('bath-door swept occupant interlocks', () => {
  it('allows a full guarded opening and closing from safe hotspot approaches on either side', () => {
    const { state, model } = make();
    for (const which of IDS) for (const side of [-1, 1]) {
      const o = VILLA_BATH_OPENINGS[which], p = { ...openingPoint(which), x: o.x + side * 1.2 };
      const body = { position: p, height: 1.75 };
      expect(nearestVillaHotspot(p)?.id).toBe(`bath-door-${which}`);
      expect(villaCollides(p, [...VILLA_WALL_COLLIDERS, ...model.colliders], body.height)).toBe(false);
      for (const open of [true, false]) {
        toggleVillaBathDoor(state, which);
        advanceVillaBathDoors(state, 2, body); model.update(state);
        expect(state[key(which)]).toBe(Number(open));
        expect(villaCollides(p, model.colliders, body.height)).toBe(false);
      }
    }
  });

  it.each(IDS)('pauses %s closure before touching a standing player in the threshold and resumes when clear', which => {
    const { state, model } = make(); state.west = state.east = true;
    advanceVillaBathDoors(state, 2); model.update(state);
    const o = VILLA_BATH_OPENINGS[which], p = { ...openingPoint(which), x: o.x + o.swing * D.hingeDepth };
    const snapshot = { ...p }, body = { position: p, height: 1.75 };
    expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    state.west = state.east = false;
    for (let i = 0; i < 120; i++) {
      advanceVillaBathDoors(state, i ? 1 / 60 : 100, body); model.update(state);
      expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    }
    expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1);
    expect(state[key(which === 'west' ? 'east' : 'west')]).toBe(0);
    expect(state[which]).toBe(false); expect(p).toEqual(snapshot);
    advanceVillaBathDoors(state, 2, { position: openingPoint(which, -o.swing), height: 1.75 }); model.update(state);
    expect(state[key(which)]).toBe(0);
  });

  it.each(IDS.flatMap(which => [0, 1].map(end => ({ which, end }))))('cannot sweep $which leaf $end through a body that clears BOTH endpoints, opening or closing', ({ which, end }) => {
    const { model, state } = make(), o = VILLA_BATH_OPENINGS[which], dir = end ? -1 : 1;
    const width = (o.z1 - o.z0) / 2 - D.hingeInset - D.meetingGap, r = width * .7;
    const p = {
      x: o.x + o.swing * (D.hingeDepth + Math.sin(Math.PI / 4) * r), y: D.floorY,
      z: (end ? o.z1 - D.hingeInset : o.z0 + D.hingeInset) + dir * Math.cos(Math.PI / 4) * r,
    };
    const body = { position: p, height: 1.75 }, original = { ...p };
    expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    state.progressW = state.progressE = 1; model.update(state);
    expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    state.progressW = state.progressE = 0; state.west = state.east = true; model.update(state);
    for (const opening of [true, false]) {
      state[which] = opening;
      // Neither an arbitrarily large tick nor repeated small ticks can tunnel.
      for (let i = 0; i < 100; i++) {
        advanceVillaBathDoors(state, i ? .015 : Number.MAX_VALUE, body); model.update(state);
        expect(villaCollides(p, model.colliders, body.height)).toBe(false);
      }
      expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1);
      if (opening) expect(state[key(which === 'west' ? 'east' : 'west')]).toBe(1);
      expect(p).toEqual(original);
      // A different floor is not an obstacle. This also puts the leaf at the
      // opposite endpoint before testing the reversed swing on the next pass.
      advanceVillaBathDoors(state, 2, { position: { ...p, y: 0 }, height: 1.75 }); model.update(state);
      expect(state[key(which)]).toBe(Number(opening));
    }
  });

  it('uses supplied body height/radius and fails safely for invalid body coordinates', () => {
    const { state, model } = make(), p = { ...openingPoint('west'), x: 8 + D.hingeDepth };
    state.west = true; advanceVillaBathDoors(state, 2); model.update(state); state.west = false;
    // Feet just below the undercut: a short body clears, a tall one does not.
    const low = { ...p, y: D.floorY - 1 };
    advanceVillaBathDoors(state, 2, { position: low, height: .9 }); expect(state.progressW).toBe(0);
    state.west = true; advanceVillaBathDoors(state, 2); state.west = false;
    advanceVillaBathDoors(state, 2, { position: low, height: 2, radius: .4 });
    expect(state.progressW).toBeGreaterThan(0);
    const snapshot = { ...state };
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(advanceVillaBathDoors(state, 2, { position: { ...p, x: bad } })).toBe(false);
      expect(advanceVillaBathDoors(state, 2, { position: p, height: bad })).toBe(false);
      expect(advanceVillaBathDoors(state, 2, { position: p, radius: bad })).toBe(false);
    }
    expect(state).toEqual(snapshot);
  });
});
