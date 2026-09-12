import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaOutdoor, createVillaOutdoor, isVillaCampingCollider, pickUpVillaCampingChair,
  placeVillaCampingChair, registerVillaCampingCollider, villaCampingCarryPose, villaCampingPlacement,
  villaCampingSeat, villaOutdoorSeat, villaSwingSeat, VILLA_CAMPING_HOME, VILLA_SWING, type VillaOutdoorState,
} from '../src/villaOutdoor.js';
import { createVillaOutdoorModel } from '../src/villaOutdoorModel.js';
import { furnishVilla } from '../src/villaFurnishings.js';
import { createVillaGarden } from '../src/villaGarden.js';
import { villaSeatColliderId } from '../src/villaSeating.js';
import { POOL, VILLA_RAILS, VILLA_WALL_COLLIDERS, villaCollides, villaSupportAt, type VillaCollider } from '../src/villaWorld.js';
import { VILLA_ESTATE_BOUNDS, VILLA_POND, villaTerrainHeight, villaTerrainOrientation } from '../src/villaEstateLayout.js';

function tick(state: VillaOutdoorState, seconds: number, sitting: boolean, hz = 60) { for (let i = 0; i < seconds * hz; i++) advanceVillaOutdoor(state, 1 / hz, sitting); }
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
    }
  });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); }); textures.forEach(t => t.dispose()); root.clear();
}

describe('Villa swing motion and portable chair state', () => {
  it('has an independent grounded reset and valid dynamic seat contracts', () => {
    const state = createVillaOutdoor(), other = createVillaOutdoor(); expect(state).toEqual(other);
    expect(state.camping).toEqual({ ...VILLA_CAMPING_HOME, carried: false });
    state.camping.x = 5; tick(state, 2, true); expect(other).toEqual(createVillaOutdoor());
    for (const seat of [villaSwingSeat(other), villaCampingSeat(other)]) {
      expect(seat.kind).toBe('chair'); expect(seat.width).toBeGreaterThan(0.5); expect(seat.depth).toBeGreaterThan(0.5); expect(seat.freeLook).toBe(true); expect(seat.exits).toHaveLength(3);
    }
    expect(villaOutdoorSeat(other, 'unknown')).toBeNull(); expect(villaOutdoorSeat(other, null)).toBeNull();
    other.camping.carried = true; expect(villaOutdoorSeat(other, 'camping-chair')).toBeNull(); expect(villaOutdoorSeat(other, 'swing')?.id).toBe('swing');
  });
  it('builds gentle motion while occupied and damps to an exact rest afterward', () => {
    const state = createVillaOutdoor(); advanceVillaOutdoor(state, 1 / 60, true); expect(state.swingAmplitude).toBeGreaterThan(0); expect(state.swingAmplitude).toBeLessThan(0.01);
    tick(state, 5, true); expect(state.swingAmplitude).toBeLessThanOrEqual(0.22); expect(Math.abs(state.swingAngle)).toBeLessThanOrEqual(0.22);
    const before = state.swingAmplitude; tick(state, 1, false); expect(state.swingAmplitude).toBeLessThan(before / 3);
    tick(state, 8, false); expect(state.swingAmplitude).toBe(0); expect(state.swingAngle).toBe(0);
    expect(villaSwingSeat(state).seat).toEqual({ x: VILLA_SWING.x, y: VILLA_SWING.y, z: VILLA_SWING.z });
  });
  it('ignores paused or invalid dt, caps stalls, and agrees at 30/60/120Hz', () => {
    const initial = createVillaOutdoor(), snapshot = structuredClone(initial);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) advanceVillaOutdoor(initial, dt, true); expect(initial).toEqual(snapshot);
    const capped = createVillaOutdoor(); advanceVillaOutdoor(initial, 100, true); advanceVillaOutdoor(capped, 0.25, true); expect(initial).toEqual(capped);
    const states = [30, 60, 120].map(hz => { const s = createVillaOutdoor(); tick(s, 2, true, hz); tick(s, 1, false, hz); return s; });
    for (const s of states.slice(1)) { expect(s.swingAmplitude).toBeCloseTo(states[0].swingAmplitude, 12); expect(s.swingAngle).toBeCloseTo(states[0].swingAngle, 12); }
  });
  it('rejects remote, different-floor, duplicate and nonfinite pickups without mutating state', () => {
    for (const visitor of [{ x: 0, y: 0, z: 0 }, { ...VILLA_CAMPING_HOME, y: 3.6 }, { ...VILLA_CAMPING_HOME, x: NaN }, { ...VILLA_CAMPING_HOME, y: NaN }, { ...VILLA_CAMPING_HOME, z: Infinity }]) {
      const state = createVillaOutdoor(), before = structuredClone(state); expect(pickUpVillaCampingChair(state, visitor), JSON.stringify(visitor)).toBe(false); expect(state).toEqual(before);
    }
    const state = createVillaOutdoor(); expect(pickUpVillaCampingChair(state, { ...VILLA_CAMPING_HOME, z: VILLA_CAMPING_HOME.z + 1 })).toBe(true); expect(pickUpVillaCampingChair(state, VILLA_CAMPING_HOME)).toBe(false);
  });
  it('carries a preview in the same yaw convention while retaining the last safe placed position', () => {
    const state = createVillaOutdoor(); expect(pickUpVillaCampingChair(state, VILLA_CAMPING_HOME)).toBe(true); const before = structuredClone(state.camping);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const visitor = { x: 10, y: 3.6, z: 8 }, p = villaCampingCarryPose(visitor, yaw);
      expect(p.x).toBeCloseTo(visitor.x - Math.sin(yaw) * 0.8); expect(p.z).toBeCloseTo(visitor.z - Math.cos(yaw) * 0.8); expect(p.y).toBeCloseTo(4.2); expect(p.yaw).toBe(yaw);
    }
    expect(state.camping).toEqual(before);
  });
  it('rejects water, estate edges, elevator voids, invalid placements and blocked reach corridors', () => {
    const rejected = [
      { visitor: { x: (POOL.minX + POOL.maxX) / 2, y: 0, z: POOL.maxZ + 1.3 }, yaw: 0 },
      { visitor: { x: VILLA_POND.x, y: 0, z: VILLA_POND.z + VILLA_POND.radiusZ + 1 }, yaw: 0 },
      { visitor: { x: VILLA_ESTATE_BOUNDS.maxX - 0.1, y: 0, z: 25 }, yaw: -Math.PI / 2 },
      { visitor: { x: 0, y: 0, z: -5.05 }, yaw: 0 },
      { visitor: { x: -18, y: NaN, z: 28 }, yaw: 0 },
      { visitor: { x: -18, y: 0, z: 28 }, yaw: Infinity },
    ];
    for (const { visitor, yaw } of rejected) expect(villaCampingPlacement(visitor, yaw, [])).toBeNull();
    const visitor = { x: -18, y: 0, z: 29 }, blocked: VillaCollider = { minX: -18.4, maxX: -17.6, minZ: 28.45, maxZ: 28.6, minY: 0, maxY: 2 };
    expect(villaCampingPlacement(visitor, 0, [])).not.toBeNull(); expect(villaCampingPlacement(visitor, 0, [blocked])).toBeNull();
    const state = createVillaOutdoor(); state.camping.carried = true; const before = structuredClone(state);
    expect(placeVillaCampingChair(state, visitor, 0, [blocked])).toBe(false); expect(state).toEqual(before);
    expect(placeVillaCampingChair(createVillaOutdoor(), visitor, 0, [])).toBe(false);
  });
  it('ignores only the registered carried-chair identity, never an identical foreign obstacle', () => {
    const visitor = { x: -18, y: 0, z: 29 }, own: VillaCollider = { minX: -18.47, maxX: -17.53, minZ: 27.32, maxZ: 28.18, minY: 0, maxY: 1.05 };
    registerVillaCampingCollider(own); expect(isVillaCampingCollider(own)).toBe(true);
    expect(villaCampingPlacement(visitor, 0, [own])).not.toBeNull(); expect(isVillaCampingCollider({ ...own })).toBe(false);
    expect(villaCampingPlacement(visitor, 0, [{ ...own }])).toBeNull();
  });
});

describe('Villa outdoor model attachment and live collider contracts', () => {
  const scene = new THREE.Group(); let model: ReturnType<typeof createVillaOutdoorModel>;
  beforeAll(() => { model = createVillaOutdoorModel(scene); }); afterAll(() => dispose(scene));
  it('matches the moving seat-camera reference exactly to the rotated model pendulum', () => {
    const state = createVillaOutdoor(), pivot = scene.getObjectByName('villa-swing-pivot')!, originalGeometry: THREE.BufferGeometry[] = [];
    scene.traverse(n => { if (n instanceof THREE.Mesh) originalGeometry.push(n.geometry); });
    const swingCollider = model.colliders.find(c => villaSeatColliderId(c) === 'swing')!;
    for (let i = 0; i < 100; i++) {
      advanceVillaOutdoor(state, 1 / 30, true); model.update(state, { x: 0, y: 0, z: 0 }, 0); scene.updateMatrixWorld(true);
      const physical = pivot.localToWorld(new THREE.Vector3(0, -VILLA_SWING.chainLength, 0)), seat = villaSwingSeat(state);
      expect(physical.x).toBeCloseTo(seat.seat.x); expect(physical.z).toBeCloseTo(seat.seat.z); expect(physical.y - (VILLA_SWING.pivotHeight - VILLA_SWING.chainLength)).toBeCloseTo(seat.seat.y);
      expect(seat.seat.y + seat.eyeHeight - physical.y).toBeCloseTo(0.65);
      expect(swingCollider.minZ).toBeCloseTo(seat.seat.z - 0.34); expect(swingCollider.maxY).toBeCloseTo(seat.seat.y + 1.07); expect(villaSeatColliderId(swingCollider)).toBe('swing');
    }
    tick(state, 10, false); model.update(state, { x: 0, y: 0, z: 0 }, 0); scene.updateMatrixWorld(true);
    expect(pivot.rotation.x).toBe(0); expect(villaSwingSeat(state).seat.z).toBe(VILLA_SWING.z);
    const current: THREE.BufferGeometry[] = []; scene.traverse(n => { if (n instanceof THREE.Mesh) current.push(n.geometry); }); expect(current).toEqual(originalGeometry);
  });
  it('connects both rope roots to the crossbar hooks and rope ends into the wooden seat', () => {
    const seat = scene.getObjectByName('villa-swing-seat')!, meshes: THREE.Mesh[] = []; seat.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); });
    const rope = meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === 'b8a585')!, p = rope.geometry.getAttribute('position');
    for (const x of [-0.57, 0.57]) for (const y of [0, -VILLA_SWING.chainLength + 0.04]) {
      let nearest = Infinity; for (let i = 0; i < p.count; i++) nearest = Math.min(nearest, Math.hypot(p.getX(i) - x, p.getY(i) - y, p.getZ(i)));
      expect(nearest).toBeLessThan(1e-6);
    }
    expect(Math.abs(VILLA_SWING.pivotHeight - 2.375)).toBeLessThan(0.06);
    const joint = -VILLA_SWING.chainLength + 0.01; expect(-VILLA_SWING.chainLength + 0.04).toBeGreaterThan(joint - 0.085 / 2); expect(-VILLA_SWING.chainLength + 0.04).toBeLessThan(joint + 0.085 / 2);
  });
  it('keeps feet at the floor, disables only the carried chair collider, and restores pose/identity on placement', () => {
    const state = createVillaOutdoor(), visitor = { x: -18.7, y: 0, z: 29.5 }, chair = scene.getObjectByName('villa-portable-camping-chair')!;
    const own = model.colliders.find(isVillaCampingCollider)!; expect(villaSeatColliderId(own)).toBe('camping-chair');
    model.update(state, visitor, 0); scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(chair); expect(bounds.min.y).toBeGreaterThanOrEqual(-0.02); expect(bounds.min.y).toBeLessThan(0.025); expect(villaCollides(state.camping, [own])).toBe(true);
    const chairMeshes: THREE.Mesh[] = []; chair.traverse(n => { if (n instanceof THREE.Mesh) chairMeshes.push(n); });
    const ray = new THREE.Raycaster(), inverse = chair.matrixWorld.clone().invert();
    for (const x of [-0.43, 0.43]) for (const z of [-0.36, 0.38]) {
      ray.set(new THREE.Vector3(x, -0.03, z).applyMatrix4(chair.matrixWorld), new THREE.Vector3(0, 1, 0).transformDirection(chair.matrixWorld));
      const hit = ray.intersectObjects(chairMeshes)[0]; expect(hit).toBeDefined(); expect(hit.point.clone().applyMatrix4(inverse).y).toBeCloseTo(0.0025, 5);
    }
    expect(pickUpVillaCampingChair(state, VILLA_CAMPING_HOME)).toBe(true); model.update(state, visitor, Math.PI / 2);
    const preview = villaCampingCarryPose(visitor, Math.PI / 2); expect(chair.position.toArray()).toEqual([preview.x, preview.y, preview.z]);
    expect(own.minY).toBeGreaterThan(1000); expect(villaCollides(preview, [own])).toBe(false); expect(model.colliders.filter(isVillaCampingCollider)).toHaveLength(1);
    expect(placeVillaCampingChair(state, visitor, 0, model.colliders)).toBe(true); model.update(state, visitor, 0);
    expect(own.minY).toBe(state.camping.y); expect(own.maxY).toBeCloseTo(state.camping.y + 1.05); expect(own.minX).toBeCloseTo(state.camping.x - 0.47); expect(own.maxZ).toBeCloseTo(state.camping.z + 0.43);
    expect(villaSeatColliderId(own)).toBe('camping-chair'); expect(villaCollides(state.camping, [own])).toBe(true);
    expect(model.update(state, visitor, 0)).toBe(false);
    const reset = createVillaOutdoor(); model.update(reset, visitor, 0); expect(chair.position.toArray()).toEqual([VILLA_CAMPING_HOME.x, 0, VILLA_CAMPING_HOME.z]);
  });
  it('uses the same terrain orientation for a safely placed hillside chair and leaves upstairs chairs level', () => {
    const state = createVillaOutdoor(), chair = scene.getObjectByName('villa-portable-camping-chair')!;
    state.camping = { x: 16, y: villaTerrainHeight(16, 121), z: 121, yaw: 0.7, carried: false }; model.update(state, state.camping, 0);
    const slope = villaTerrainOrientation(16, 121, 0.7); expect(chair.rotation.order).toBe('YXZ'); expect(chair.rotation.x).toBeCloseTo(slope.pitch); expect(chair.rotation.z).toBeCloseTo(slope.roll);
    state.camping = { x: 0, y: 3.6, z: 5.25, yaw: 0.7, carried: false }; model.update(state, state.camping, 0); expect(chair.rotation.x).toBe(0); expect(chair.rotation.z).toBe(0);
  });
});

describe('Villa portable chair against actual estate furniture', () => {
  const scene = new THREE.Scene(); let colliders: VillaCollider[];
  beforeAll(() => {
    const ctx = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' || name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : name === 'measureText' ? () => ({ width: 10 }) : () => {}, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const furnishings = furnishVilla(scene), garden = createVillaGarden(scene), outdoor = createVillaOutdoorModel(scene);
    outdoor.update(createVillaOutdoor(), { x: 0, y: 0, z: 0 }, 0); colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...furnishings.colliders, ...garden.colliders, ...outdoor.colliders];
  });
  afterAll(() => { dispose(scene); vi.unstubAllGlobals(); });
  it('rejects real sofas, kitchen island, snooker table and orchard tree footprints', () => {
    for (const [x, z] of [[-8, 5.8], [-5.2, -5.6], [9.15, -3.8], [-14, 22.8]]) expect(villaCampingPlacement({ x, y: 0, z: z + 1.25 }, 0, colliders), `${x},${z}`).toBeNull();
    expect(colliders.some(c => villaSeatColliderId(c) === 'sofa-living')).toBe(true);
  });
  it('allows clear meadow and upstairs/roof placements on their own supported floor, never teleporting floors', () => {
    for (const visitor of [{ x: -18.7, y: 0, z: 29.5 }, { x: 0, y: 3.6, z: 6.5 }, { x: 0, y: 7.2, z: 5.5 }]) {
      const state = createVillaOutdoor(); state.camping.carried = true;
      expect(placeVillaCampingChair(state, visitor, 0, colliders), JSON.stringify(visitor)).toBe(true);
      expect(state.camping.y).toBeCloseTo(visitor.y); expect(state.camping.z).toBeCloseTo(visitor.z - 1.25); expect(state.camping.carried).toBe(false);
      expect(villaSupportAt(state.camping.x, state.camping.z, state.camping.y)).toBeCloseTo(state.camping.y);
    }
  });
});
