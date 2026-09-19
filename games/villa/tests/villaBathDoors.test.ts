import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaBathDoors, createVillaBathDoorModel, createVillaBathDoors, toggleVillaBathDoor,
  VILLA_BATH_DOOR_DIMENSIONS, VILLA_BATH_OPENINGS, VILLA_BATH_SLIDING_LEAVES, type VillaBathDoorId,
} from '../src/villaBathDoors.js';
import {
  moveVillaPlayer, nearestVillaHotspot, PLAYER_RADIUS, villaCollides, VILLA_BLOCKS, VILLA_HOTSPOTS, VILLA_WALL_COLLIDERS,
  type VillaCollider, type VillaPosition,
} from '../src/villaWorld.js';

const roots: THREE.Group[] = [], D = VILLA_BATH_DOOR_DIMENSIONS, IDS = ['west', 'east'] as const;
const key = (which: VillaBathDoorId) => which === 'west' ? 'progressW' : 'progressE';
const floorSupport = () => D.floorY;
const layoutOf = (which: VillaBathDoorId, end: number) => VILLA_BATH_SLIDING_LEAVES.find(leaf => leaf.which === which && leaf.end === end)!;
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
/** Only used for the explicitly supplied tiny-radius body tests below. Upright
 * unrotated sliding panels have exactly rectangular horizontal sections. */
function hitsRadius(p: VillaPosition, colliders: VillaCollider[], radius: number) {
  return colliders.some(c => {
    if (p.y + 1.75 <= c.minY || p.y >= c.maxY) return false;
    return Math.hypot(p.x - Math.max(c.minX, Math.min(p.x, c.maxX)), p.z - Math.max(c.minZ, Math.min(p.z, c.maxZ))) < radius;
  });
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

describe('sliding bath-door state and finite reversible clocks', () => {
  it('starts closed, preserves targets and reports even sub-milliframe movement over a real 1.5s travel', () => {
    const state = createVillaBathDoors(); expect(D.seconds).toBe(1.5);
    expect(state).toEqual({ west: false, east: false, progressW: 0, progressE: 0 });
    expect(toggleVillaBathDoor(state, 'north' as VillaBathDoorId)).toBe(false);
    expect(toggleVillaBathDoor(state, 'west')).toBe(true);
    expect(advanceVillaBathDoors(state, D.seconds / 2)).toBe(true);
    expect(state.progressW).toBeCloseTo(.5); expect(state.progressE).toBe(0);
    toggleVillaBathDoor(state, 'west'); expect(state.progressW).toBeCloseTo(.5);
    advanceVillaBathDoors(state, D.seconds / 10); expect(state.progressW).toBeCloseTo(.4);
    expect(advanceVillaBathDoors(state, .000001)).toBe(true);
    const snapshot = { ...state };
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) expect(advanceVillaBathDoors(state, dt)).toBe(false);
    expect(state).toEqual(snapshot);
    advanceVillaBathDoors(state, Number.MAX_VALUE); expect(state.progressW).toBe(0);
    IDS.forEach(id => toggleVillaBathDoor(state, id)); advanceVillaBathDoors(state, Number.MAX_VALUE);
    expect(state.progressW).toBe(1); expect(state.progressE).toBe(1); expect(advanceVillaBathDoors(state, 1)).toBe(false);
  });
  it('keeps state and all collider transforms finite on malformed progress and absent/reset state', () => {
    const { state, model } = make(), closed = model.colliders.map(c => ({ ...c }));
    state.west = state.east = true; state.progressW = NaN; state.progressE = Infinity;
    expect(model.update(state)).toBe(false); expect(model.colliders).toEqual(closed);
    expect(advanceVillaBathDoors(state, D.seconds / 2)).toBe(true);
    expect(state.progressW).toBeCloseTo(.5); expect(state.progressE).toBeCloseTo(.5); expect(model.update(state)).toBe(true);
    expect(model.colliders.every(c => Object.values(c).every(Number.isFinite))).toBe(true);
    expect(model.update()).toBe(true); expect(model.colliders).toEqual(closed); expect(model.update(undefined)).toBe(false);
    state.progressW = -10; state.progressE = 10; model.update(state);
    expect(leafNode(model.root, 'west', 0).position.z).toBe(layoutOf('west', 0).closedZ);
    expect(leafNode(model.root, 'east', 0).position.z).toBeCloseTo(layoutOf('east', 0).parkedZ, 12);
    IDS.forEach(which => [0, 1].forEach(end => expect(leafNode(model.root, which, end).rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])));
  });
});

describe('two tall sliding privacy entryways aligned with the actual villa', () => {
  it('fits both existing clear openings and lintels, with every panel and overhead track under the returned root', () => {
    const { parent, model } = make(); expect(parent.children).toEqual([model.root]);
    expect(model.root.userData).toMatchObject({ entryways: 2, movingLeaves: 4, motion: 'north-stacking-slide' });
    expect(model.doorColliders).toHaveLength(4); expect(model.colliders).toHaveLength(4);
    expect(model.root.children.filter(n => n.userData.animated)).toHaveLength(4);
    expect(model.root.children).toHaveLength(5); expect(model.root.getObjectByName('bath-door-overhead-tracks')).toBeDefined();
    expect(VILLA_HOTSPOTS.filter(h => h.id.startsWith('bath-door-')).map(h => h.id).sort()).toEqual(['bath-door-east', 'bath-door-west']);
    for (const [i, which] of IDS.entries()) {
      const o = VILLA_BATH_OPENINGS[which];
      const lintel = VILLA_BLOCKS.find(b => b.material === 'oak' && b.x === o.x && Math.abs(b.z - (o.z0 + o.z1) / 2) < .001 && Math.abs(b.d - (o.z1 - o.z0)) < .001 && b.y > D.floorY + 2.9);
      expect(lintel).toBeDefined();
      for (const end of [0, 1]) {
        const node = leafNode(model.root, which, end), c = model.colliders[i * 2 + end], bounds = new THREE.Box3().setFromObject(node);
        expect(node.parent).toBe(model.root); expect(node.userData.collider).toBe(c); expect(node.userData.handles).toBe(2);
        expect(node.userData.recessedPulls).toBe(true);
        // 45cm wall covers and a 30cm lapped centre seal inset tracks from
        // oblique approaches; the two leaves still travel on disjoint tracks.
        expect(bounds.min.z).toBeGreaterThanOrEqual(o.z0 - D.jambOverlap - .000001);
        expect(bounds.max.z).toBeLessThanOrEqual(o.z1 + D.jambOverlap + .000001);
        expect(bounds.min.y).toBeCloseTo(D.floorY + .03, 5);
        expect(bounds.max.y).toBeCloseTo(D.floorY + 3.055, 5); // real roller carriage, not a taller pane
        expect(node.userData.panelTop).toBeCloseTo(2.93, 10);
        expect(lintel!.y - lintel!.h / 2 - D.floorY - node.userData.panelTop).toBeCloseTo(.03, 5);
        // The upper panel ends exactly at 2.93m; a ray above it only encounters
        // carriers at their own Z positions, not an invisible full-height wall.
        const s = layoutOf(which, end);
        for (const [y, hit] of [[2.929, true], [2.941, false]] as const) {
          const ray = new THREE.Raycaster(new THREE.Vector3(s.x - 1, D.floorY + y, s.closedZ), new THREE.Vector3(1, 0, 0), 0, 2);
          expect(ray.intersectObject(node, true).length > 0).toBe(hit);
        }
        expectEnclosed(node, c);
      }
      expect(villaCollides(openingPoint(which), VILLA_WALL_COLLIDERS, 1.75)).toBe(false);
      expect(villaCollides({ x: o.x, y: D.floorY, z: o.z0 - .1 }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
      expect(villaCollides({ x: o.x, y: D.floorY, z: o.z1 + .1 }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
    }
    for (const z of [-9, 1]) for (const x of [8.5, 10, 12.5, 15, 16.5]) expect(villaCollides({ x, y: D.floorY, z }, VILLA_WALL_COLLIDERS, 1.75)).toBe(true);
  });
  it('keeps strong frosting, opaque eye-level privacy and a genuinely overlapped meeting seam from both sides', () => {
    const { model } = make(), materials = new Set<THREE.MeshStandardMaterial>();
    model.root.traverse(node => { if (node instanceof THREE.Mesh) materials.add(node.material as THREE.MeshStandardMaterial); });
    const frost = [...materials].find(m => m.name === 'bath-door-frosted')!;
    expect(frost.opacity).toBeGreaterThanOrEqual(.9); expect(frost.roughness).toBeGreaterThanOrEqual(.9); expect(frost.depthWrite).toBe(true);
    const privacy = [...materials].find(m => m.name === 'bath-door-privacy-frit')!;
    expect(privacy.transparent).toBe(false); expect(privacy.opacity).toBe(1);
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], near = new THREE.Box3().setFromObject(leafNode(model.root, which, 0)), far = new THREE.Box3().setFromObject(leafNode(model.root, which, 1));
      expect(near.max.z - far.min.z).toBeCloseTo(.30, 5);
      for (const side of [-1, 1]) for (const height of [.75, 1.65, 1.95]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(o.x + side, D.floorY + height, o.z0 + (o.z1 - o.z0) / 4), new THREE.Vector3(-side, 0, 0), 0, 2);
        const hit = ray.intersectObject(model.root, true)[0]; expect(hit).toBeDefined(); expect((hit.object as THREE.Mesh).material).toBe(privacy);
        for (const dz of [-.014, 0, .014]) {
          ray.set(new THREE.Vector3(o.x + side, D.floorY + height, (o.z0 + o.z1) / 2 + dz), new THREE.Vector3(-side, 0, 0));
          const seam = ray.intersectObject(model.root, true)[0]; expect(seam).toBeDefined();
          expect(((seam.object as THREE.Mesh).material as THREE.Material).transparent).toBe(false);
        }
      }
    }
  });
  it('blocks oblique jamb and meeting-joint sightlines from real gallery/bath approaches, not just perpendicular rays', () => {
    const { parent, model, state } = make(), wallMaterial = new THREE.MeshBasicMaterial({ color: '#918b7d' });
    const ray = new THREE.Raycaster(), probes: { origin: THREE.Vector3; direction: THREE.Vector3; far: number; target: number; label: string }[] = [];
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], span = o.z1 - o.z0, walls = new THREE.Group(); parent.add(walls);
      // Real surrounding oak/plaster only: no invented opaque test mask across
      // the jamb/track gap. A ray hitting this casing could not see the room.
      for (const b of VILLA_BLOCKS.filter(b => b.solid && b.x === o.x && b.y > D.floorY && b.y < D.floorY + 3.5 && b.z >= -12 && b.z <= 4)) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), wallMaterial); mesh.position.set(b.x, b.y, b.z); walls.add(mesh);
      }
      parent.updateMatrixWorld(true);
      const approachXs = which === 'west' ? [6.2, 9.2] : [15.8, 18.8];
      for (const x of approachXs) for (const offset of [-.25, 0, .25]) for (const height of [.75, 1.65, 1.95]) for (let i = 1; i < 96; i++) {
        const z = (o.z0 + o.z1) / 2 + offset * span, target = i / 96;
        const origin = new THREE.Vector3(x, D.floorY + height, z), direction = new THREE.Vector3(o.x - x, 0, o.z0 + span * target - z).normalize();
        // Stop immediately after crossing the doorway construction. A far wall
        // at the back of the bathroom must never count as successful privacy.
        const endX = o.x + o.swing * ((x - o.x) * o.swing < 0 ? .44 : -.16), far = (endX - x) / direction.x;
        ray.set(origin, direction); ray.far = far;
        if (ray.intersectObject(walls, true).length) continue;
        probes.push({ origin, direction, far, target, label: `${which} origin=${x},${z} h=${height} aperture=${target}` });
      }
    }
    expect(probes.length).toBeGreaterThan(2500);
    for (const p of probes) {
      ray.set(p.origin, p.direction); ray.far = p.far;
      const hit = ray.intersectObject(model.root, true)[0]; expect(hit, p.label).toBeDefined();
      expect(((hit.object as THREE.Mesh).material as THREE.Material).transparent, p.label).toBe(false);
    }
    // Opening still exposes the real central passage: these are not stationary
    // privacy plates masquerading as movable leaves or a phantom aperture mask.
    state.progressW = state.progressE = 1; model.update(state);
    for (const p of probes.filter(p => p.target >= .3 && p.target <= .7)) {
      ray.set(p.origin, p.direction); ray.far = p.far;
      expect(ray.intersectObject(model.root, true), p.label).toHaveLength(0);
    }
  });
  it('blocks closed traversal through both leaves and their meeting seam from either approach', () => {
    const { model } = make(), obstacles = [...VILLA_WALL_COLLIDERS, ...model.colliders];
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which];
      for (const t of [.25, .5, .75]) {
        const z = o.z0 + t * (o.z1 - o.z0), panels = VILLA_BATH_SLIDING_LEAVES.filter(l => l.which === which && Math.abs(z - l.closedZ) <= l.width / 2);
        for (const panel of panels) expect(villaCollides({ x: panel.x, y: D.floorY, z }, model.colliders, 1.75)).toBe(true);
        for (const side of [-1, 1]) {
          const start = { x: o.x + side, y: D.floorY, z };
          expect(villaCollides(start, obstacles, 1.75)).toBe(false);
          const result = moveVillaPlayer(start, -side * 2, 0, obstacles, floorSupport, 1.75);
          const trackX = side > 0 ? Math.max(...panels.map(p => p.x)) : Math.min(...panels.map(p => p.x));
          expect((result.x - trackX) * side).toBeGreaterThan(PLAYER_RADIUS);
          expect(villaCollides(result, obstacles, 1.75)).toBe(false);
        }
      }
    }
  });
  it('clears the entire open aperture and leaves both closed/open hotspots usable', () => {
    const { model, state } = make();
    for (const open of [false, true]) {
      if (open) { state.west = state.east = true; advanceVillaBathDoors(state, 2); model.update(state); }
      const obstacles = [...VILLA_WALL_COLLIDERS, ...model.colliders];
      for (const which of IDS) for (const side of [-1, 1]) {
        const p = openingPoint(which, side), o = VILLA_BATH_OPENINGS[which];
        expect(villaCollides(p, obstacles, 1.75)).toBe(false); expect(nearestVillaHotspot(p)?.id).toBe(`bath-door-${which}`);
        if (open) {
          for (let z = o.z0 + .3; z <= o.z1 - .29; z += .21) {
            const result = moveVillaPlayer({ ...p, z }, -side * 1.8, 0, obstacles, floorSupport, 1.75);
            expect(result.x).toBeCloseTo(openingPoint(which, -side).x, 6); expect(result.z).toBe(z);
          }
          for (const z of [o.z0 + .001, (o.z0 + o.z1) / 2, o.z1 - .001]) {
            const ray = new THREE.Raycaster(new THREE.Vector3(o.x + side, D.floorY + 1.65, z), new THREE.Vector3(-side, 0, 0), 0, 2);
            expect(ray.intersectObject(model.root, true)).toHaveLength(0);
          }
        }
      }
    }
  });
  it('keeps the wider privacy leaves clear of real walls throughout travel and leaves both pulls in the aperture', () => {
    const { model, state } = make();
    const walls = VILLA_BLOCKS.filter(b => b.solid && (b.material === 'plaster' || b.material === 'oak'))
      .map(b => new THREE.Box3(new THREE.Vector3(b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2)));
    for (let i = 0; i <= 40; i++) {
      state.progressW = state.progressE = i / 40; model.update(state);
      for (const which of IDS) {
        const boxes = [0, 1].map(end => new THREE.Box3().setFromObject(leafNode(model.root, which, end)));
        expect(boxes[0].intersectsBox(boxes[1])).toBe(false);
        for (const box of boxes) {
          expect(walls.some(wall => box.intersectsBox(wall)), `${which} progress=${i / 40}`).toBe(false);
          // East parking stops before the authored shower tray's south edge;
          // west parking stays east-clear of the laundry cabinet (x>=8.79).
          if (which === 'east') expect(box.min.z).toBeGreaterThan(-6.9 + .1);
          else expect(box.max.x).toBeLessThan(8.79 - .1);
        }
      }
    }
    model.update();
    for (const layout of VILLA_BATH_SLIDING_LEAVES) {
      const o = VILLA_BATH_OPENINGS[layout.which], z = layout.closedZ + layout.handleZ;
      expect(z).toBeGreaterThan(o.z0 + .1); expect(z).toBeLessThan(o.z1 - .1);
      for (const side of [-1, 1]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(o.x + side * 1.2, D.floorY + 1.11, z), new THREE.Vector3(-side, 0, 0), 0, 2.4);
        const hit = ray.intersectObject(model.root, true)[0]; expect(hit).toBeDefined();
        expect(((hit.object as THREE.Mesh).material as THREE.Material).name).toBe('bath-door-gaskets');
      }
    }
  });
  it('stacks north of BOTH openings with separate flush-pull tracks and wall-mounted overhead hardware', () => {
    const { model, state } = make(); state.progressW = state.progressE = 1; model.update(state);
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], a = leafNode(model.root, which, 0), b = leafNode(model.root, which, 1);
      const near = new THREE.Box3().setFromObject(a), far = new THREE.Box3().setFromObject(b);
      expect(a.position.z).toBeCloseTo(b.position.z, 12); expect(Math.abs(a.position.x - b.position.x)).toBeCloseTo(.125, 12);
      expect(near.max.x < far.min.x || far.max.x < near.min.x).toBe(true);
      expect(Math.abs(a.position.x - b.position.x) - D.thickness).toBeCloseTo(.061, 12);
      for (const box of [near, far]) {
        expect(box.max.z).toBeCloseTo(o.z0 - .06, 5); expect(box.min.z).toBeGreaterThan(-8.8);
        expect(box.max.z).toBeLessThan(1); // east never crosses perpendicular south wall
        expect(box.max.x - box.min.x).toBeCloseTo(D.thickness, 5); // pulls cannot protrude into the neighbouring track
      }
      const track = model.root.getObjectByName(`bath-door-track-${which}`)!;
      expect(track.userData).toMatchObject({ direction: 'north', wallMounted: true, trackOffsets: [.235, .360] });
      expect(track.userData.minZ).toBeCloseTo(layoutOf(which, 0).parkedZ - layoutOf(which, 0).width / 2 - .12, 10);
      expect(track.userData.maxZ).toBeCloseTo(o.z1 + D.jambOverlap + D.railOverhang, 10);
      expect(track.userData.minZ).toBeGreaterThan(-8.8); expect(track.userData.maxZ).toBeLessThan(1);
    }
    const hardware = new THREE.Box3().setFromObject(model.root.getObjectByName('bath-door-overhead-tracks')!);
    expect(hardware.min.y).toBeGreaterThan(D.floorY + 3); expect(hardware.max.y).toBeLessThan(D.floorY + 3.3);
  });
});

describe('four live translating collider identities and rigid parent transforms', () => {
  it('moves all four panels north on straight separate tracks with exact paired travel ratios and reversible live identities', () => {
    const { model, state } = make(), array = model.colliders, identities = [...model.colliders], closed = identities.map(c => ({ ...c }));
    state.west = state.east = true;
    for (let step = 0; step < 36; step++) {
      const previous = identities.map(c => ({ ...c })), changed = advanceVillaBathDoors(state, .05);
      expect(model.update(state)).toBe(changed); expect(model.colliders).toBe(array);
      IDS.forEach((which, i) => {
        for (const end of [0, 1]) {
          const index = i * 2 + end, c = model.colliders[index], node = leafNode(model.root, which, end), layout = layoutOf(which, end), p = state[key(which)];
          expect(c).toBe(identities[index]); expect(Object.values(c).every(Number.isFinite)).toBe(true);
          if (changed) expect(c).not.toEqual(previous[index]); expectEnclosed(node, c);
          expect(node.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]); expect(node.position.x).toBe(layout.x); expect(node.position.y).toBe(D.floorY);
          expect(node.position.z).toBeCloseTo(layout.closedZ - layout.travel * p * p * (3 - 2 * p), 12);
          expect(c.maxX - c.minX).toBeCloseTo(D.thickness, 10); expect(c.maxZ - c.minZ).toBeCloseTo(layout.width, 10);
          expect(villaCollides(node.localToWorld(new THREE.Vector3(0, .6, 0)), [c], .8)).toBe(true);
        }
      });
      expect(model.update(state)).toBe(false);
    }
    expect(state.progressW).toBe(1); expect(state.progressE).toBe(1);
    expect(model.update()).toBe(true); identities.forEach((c, i) => expect(c).toEqual(closed[i]));
  });
  it('uses exact narrow-phase panels rather than filled AABB corners after a rigid parent yaw', () => {
    const { parent, model, state } = make(); state.progressW = state.progressE = .5; parent.rotation.y = .65; model.update(state);
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
  it('refreshes all collider inverses even at unchanged progress after moving the parent, including reset', () => {
    const { parent, model, state } = make(), identities = [...model.colliders];
    state.progressW = state.progressE = .65; model.update(state); const before = identities.map(c => ({ ...c }));
    parent.position.set(2, 1, -3); parent.rotation.y = .37; expect(model.update(state)).toBe(true);
    IDS.forEach((which, i) => {
      for (const end of [0, 1]) {
        const index = i * 2 + end, node = leafNode(model.root, which, end), c = model.colliders[index];
        expect(c).toBe(identities[index]); expect(c).not.toEqual(before[index]); expectEnclosed(node, c);
        expect(villaCollides(node.localToWorld(new THREE.Vector3(0, .5, 0)), [c], .8)).toBe(true);
      }
    });
    expect(model.update(state)).toBe(false); expect(model.update()).toBe(true);
    IDS.forEach((which, i) => [0, 1].forEach(end => { const node = leafNode(model.root, which, end); expectEnclosed(node, identities[i * 2 + end]); expect(node.position.z).toBe(layoutOf(which, end).closedZ); }));
    expect(model.update()).toBe(false);
  });
});

describe('exact linear swept occupant interlocks', () => {
  it('allows full guarded opening and closing from safe hotspot approaches on both sides', () => {
    const { state, model } = make();
    for (const which of IDS) for (const side of [-1, 1]) {
      const o = VILLA_BATH_OPENINGS[which], p = { ...openingPoint(which), x: o.x + side * 1.2 }, body = { position: p, height: 1.75 };
      expect(nearestVillaHotspot(p)?.id).toBe(`bath-door-${which}`);
      expect(villaCollides(p, [...VILLA_WALL_COLLIDERS, ...model.colliders], body.height)).toBe(false);
      for (const open of [true, false]) {
        toggleVillaBathDoor(state, which); advanceVillaBathDoors(state, 2, body); model.update(state);
        expect(state[key(which)]).toBe(Number(open)); expect(villaCollides(p, model.colliders, body.height)).toBe(false);
      }
    }
  });
  it.each(IDS)('pauses %s closure before a standing threshold occupant and resumes independently when clear', which => {
    const { state, model } = make(); state.west = state.east = true; advanceVillaBathDoors(state, 2); model.update(state);
    const o = VILLA_BATH_OPENINGS[which], p = { ...openingPoint(which), x: layoutOf(which, 0).x }, snapshot = { ...p }, body = { position: p, height: 1.75 };
    expect(villaCollides(p, model.colliders, body.height)).toBe(false); state.west = state.east = false;
    for (let i = 0; i < 120; i++) { advanceVillaBathDoors(state, i ? 1 / 60 : 100, body); model.update(state); expect(villaCollides(p, model.colliders, body.height)).toBe(false); }
    expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1);
    expect(state[key(which === 'west' ? 'east' : 'west')]).toBe(0); expect(state[which]).toBe(false); expect(p).toEqual(snapshot);
    advanceVillaBathDoors(state, 2, { position: openingPoint(which, -o.swing), height: 1.75 }); model.update(state); expect(state[key(which)]).toBe(0);
  });
  it.each(IDS)('pauses %s opening before entering occupied north parking, without moving the body or stopping the other pair', which => {
    const { state, model } = make(), o = VILLA_BATH_OPENINGS[which], far = layoutOf(which, 1);
    const p = { x: far.x + o.swing * .21, y: D.floorY, z: far.parkedZ }, original = { ...p };
    expect(villaCollides(p, model.colliders, 1.75)).toBe(false); state.west = state.east = true;
    for (let i = 0; i < 100; i++) { advanceVillaBathDoors(state, i ? .015 : Number.MAX_VALUE, { position: p }); model.update(state); expect(villaCollides(p, model.colliders, 1.75)).toBe(false); }
    expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1); expect(state[which]).toBe(true);
    expect(state[key(which === 'west' ? 'east' : 'west')]).toBe(1); expect(p).toEqual(original);
    advanceVillaBathDoors(state, 2, { position: { ...p, y: 0 } }); model.update(state); expect(state[key(which)]).toBe(1);
  });
  it.each(IDS)('cannot sweep %s far leaf through a full-size body that clears BOTH endpoint poses, in either direction', which => {
    const { model, state } = make(), o = VILLA_BATH_OPENINGS[which], far = layoutOf(which, 1);
    const p = { x: far.x + o.swing * .22, y: D.floorY, z: (far.parkedZ + far.width / 2 + far.closedZ - far.width / 2) / 2 }, original = { ...p }, body = { position: p, height: 1.75 };
    expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    state.progressW = state.progressE = 1; model.update(state); expect(villaCollides(p, model.colliders, body.height)).toBe(false);
    state.progressW = state.progressE = 0; state.west = state.east = true; model.update(state);
    for (const opening of [true, false]) {
      state[which] = opening;
      for (let i = 0; i < 100; i++) { advanceVillaBathDoors(state, i ? .015 : Number.MAX_VALUE, body); model.update(state); expect(villaCollides(p, model.colliders, body.height)).toBe(false); }
      expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1);
      if (opening) expect(state[key(which === 'west' ? 'east' : 'west')]).toBe(1); expect(p).toEqual(original);
      advanceVillaBathDoors(state, 2, { position: { ...p, y: 0 }, height: 1.75 }); model.update(state); expect(state[key(which)]).toBe(Number(opening));
    }
  });
  it.each(IDS)('stops the %s near leaf within a centimetre of actual contact, even for a supplied tiny radius', which => {
    // With real jamb overlap, near-leaf endpoint rectangles overlap by39cm:
    // no cylinder can clear BOTH while intersecting their union. The far leaf
    // retains that endpoint-clear adversarial test above. Here isolate the near
    // track with the real small-radius API and test both occupied destination
    // volumes, including precise no-extra-margin contact and resume behavior.
    const { model, state } = make(), near = layoutOf(which, 0), radius = .012;
    expect(near.parkedZ + near.width / 2 - (near.closedZ - near.width / 2)).toBeCloseTo(.39, 10);
    for (const opening of [true, false]) {
      const p = { x: near.x, y: D.floorY, z: opening ? near.parkedZ - near.width * .3 : near.closedZ + near.width * .3 }, original = { ...p };
      state[key(which)] = Number(!opening); model.update(state); expect(hitsRadius(p, model.colliders, radius)).toBe(false);
      state[key(which)] = Number(opening); model.update(state); expect(hitsRadius(p, model.colliders, radius)).toBe(true);
      state[key(which)] = Number(!opening); state[which] = opening; model.update(state);
      for (let i = 0; i < 100; i++) { advanceVillaBathDoors(state, i ? .015 : Number.MAX_VALUE, { position: p, radius }); model.update(state); expect(hitsRadius(p, model.colliders, radius)).toBe(false); }
      expect(state[key(which)]).toBeGreaterThan(0); expect(state[key(which)]).toBeLessThan(1); expect(p).toEqual(original);
      const collider = model.doorColliders[IDS.indexOf(which) * 2], clearance = opening ? collider.minZ - p.z : p.z - collider.maxZ;
      expect(clearance).toBeGreaterThanOrEqual(radius - 1e-10); expect(clearance).toBeLessThan(radius + .012);
      advanceVillaBathDoors(state, 2, { position: { ...p, y: 0 }, radius }); model.update(state); expect(state[key(which)]).toBe(Number(opening));
    }
  });
  it('does not inflate a linear swept corridor into an invisible wide blocker', () => {
    const { model, state } = make();
    for (const which of IDS) {
      const o = VILLA_BATH_OPENINGS[which], far = layoutOf(which, 1), body = { position: { x: far.x + o.swing * .27, y: D.floorY, z: (far.closedZ + far.parkedZ) / 2 } };
      for (const open of [true, false]) { state[which] = open; advanceVillaBathDoors(state, 20, body); model.update(state); expect(state[key(which)]).toBe(Number(open)); expect(villaCollides(body.position, model.colliders, 1.75)).toBe(false); }
    }
  });
  it('uses supplied body height/radius and fails safely for invalid body coordinates', () => {
    const { state, model } = make(), p = { ...openingPoint('west'), x: layoutOf('west', 0).x };
    state.west = true; advanceVillaBathDoors(state, 2); model.update(state); state.west = false;
    const low = { ...p, y: D.floorY - 1 };
    advanceVillaBathDoors(state, 2, { position: low, height: .9 }); expect(state.progressW).toBe(0);
    state.west = true; advanceVillaBathDoors(state, 2); state.west = false;
    advanceVillaBathDoors(state, 2, { position: low, height: 2, radius: .4 }); expect(state.progressW).toBeGreaterThan(0);
    const snapshot = { ...state };
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(advanceVillaBathDoors(state, 2, { position: { ...p, x: bad } })).toBe(false);
      expect(advanceVillaBathDoors(state, 2, { position: p, height: bad })).toBe(false);
      expect(advanceVillaBathDoors(state, 2, { position: p, radius: bad })).toBe(false);
    }
    expect(state).toEqual(snapshot);
  });
});
