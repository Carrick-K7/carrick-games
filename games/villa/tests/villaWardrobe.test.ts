import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaWardrobes, createVillaFridge, createVillaWardrobe, createVillaWardrobes, toggleVillaWardrobe, villaOpenableLabel, VILLA_FRIDGE_FREEZER, VILLA_MASTER_WARDROBE, VILLA_WARDROBE_CONTENTS } from '../src/villaWardrobe';
import { villaCollides, VILLA_WALL_COLLIDERS } from '../src/villaWorld';
const roots: THREE.Group[] = [];
afterEach(() => roots.splice(0).forEach(root => {
  const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>(); root.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m); } });
  gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); root.clear();
}));
function make() { const root = new THREE.Group(); roots.push(root); return { root, model: createVillaWardrobe(root) }; }
describe('wardrobe hinge simulation and visible interior', () => {
  it('creates closed state and animates reversible, dt-based targets without instant resets', () => {
    const state = createVillaWardrobes(), id = VILLA_MASTER_WARDROBE.id;
    expect(state.wardrobes[id]).toEqual({ open: false, progress: 0 });
    expect(toggleVillaWardrobe(state, 'not-a-wardrobe')).toBe(false);
    toggleVillaWardrobe(state, id); advanceVillaWardrobes(state, 0.475); expect(state.wardrobes[id].progress).toBeCloseTo(0.5);
    toggleVillaWardrobe(state, id); expect(state.wardrobes[id].progress).toBeCloseTo(0.5);
    advanceVillaWardrobes(state, 0.095); expect(state.wardrobes[id].progress).toBeCloseTo(0.4);
    for (const dt of [0, -1, Infinity, NaN]) expect(advanceVillaWardrobes(state, dt)).toBe(false);
    advanceVillaWardrobes(state, 10); expect(state.wardrobes[id].progress).toBe(0);
    toggleVillaWardrobe(state, id); advanceVillaWardrobes(state, 10); expect(state.wardrobes[id].progress).toBe(1);
    expect(advanceVillaWardrobes(state, 1)).toBe(false);
  });
  it('updates all ten moving colliders in place, keeps approaches and the foot-of-bed aisle clear', () => {
    const { model } = make(), state = createVillaWardrobes(), id = VILLA_MASTER_WARDROBE.id;
    const array = model.colliders, doors = [...model.doorColliders], initial = doors.map(c => ({ ...c }));
    const caseFront = Math.max(...model.colliders.filter(c => !doors.includes(c)).map(c => c.maxZ));
    expect(doors.every(c => c.minZ > caseFront + 0.005)).toBe(true);
    toggleVillaWardrobe(state, id);
    for (let i = 0; i < 40; i++) {
      advanceVillaWardrobes(state, 0.03); model.update(state);
      expect(model.colliders).toBe(array);
      model.doorColliders.forEach((c, j) => { expect(c).toBe(doors[j]); expect(Object.values(c).every(Number.isFinite)).toBe(true); expect(c.maxZ).toBeLessThan(1.5); });
      expect(villaCollides(VILLA_MASTER_WARDROBE.approach, [...VILLA_WALL_COLLIDERS, ...model.colliders], 1.75)).toBe(false);
      for (let x = -10.7; x < -2; x += 0.17) expect(villaCollides({ x, y: 3.6, z: 2.65 }, model.colliders)).toBe(false);
    }
    expect(doors).not.toEqual(initial); expect(model.update(state)).toBe(false);
    model.update(createVillaWardrobes()); doors.forEach((c, i) => expect(c).toEqual(initial[i]));
  });
  it('opens a genuine sightline to garments without an opaque cabinet box, with 90% women compartments', () => {
    const { root, model } = make(), state = createVillaWardrobes();
    expect(VILLA_WARDROBE_CONTENTS.filter(c => c.styling === 'women')).toHaveLength(9);
    expect(VILLA_WARDROBE_CONTENTS[9]).toMatchObject({ compartment: 10, styling: 'men' });
    for (let i = 0; i < 10; i++) expect(root.getObjectByName(`wardrobe/compartment-${i + 1}`)?.userData.garments).toHaveLength(2);
    const ray = new THREE.Raycaster(new THREE.Vector3(-10.94, 5.35, 1.8), new THREE.Vector3(0, 0, -1), 0, 2);
    root.updateMatrixWorld(true); const closed = ray.intersectObject(root, true)[0]; expect(closed.object.name).toBe('wardrobe/hinged-doors');
    toggleVillaWardrobe(state, VILLA_MASTER_WARDROBE.id); advanceVillaWardrobes(state, 2); model.update(state);
    root.updateMatrixWorld(true); const open = ray.intersectObject(root, true)[0];
    expect(open.object.name).not.toBe('wardrobe/hinged-doors'); expect(open.point.z).toBeLessThan(0.86);
    const batches: THREE.InstancedMesh[] = []; root.traverse(o => { if (o instanceof THREE.InstancedMesh) batches.push(o); });
    expect(batches).toHaveLength(3); expect(batches.every(b => b.count === 10)).toBe(true);
    const matrix = new THREE.Matrix4(); for (const batch of batches) for (let i = 0; i < batch.count; i++) { batch.getMatrixAt(i, matrix); expect(matrix.determinant()).toBeGreaterThan(0); }
  });
});
describe('kitchen fridge-freezer is a real openable', () => {
  function makeFridge() { const root = new THREE.Group(); roots.push(root); return { root, model: createVillaFridge(root) }; }
  it('registers with the shared openable plumbing and reports fitting labels', () => {
    const state = createVillaWardrobes();
    expect(Object.keys(state.wardrobes)).toContain(VILLA_FRIDGE_FREEZER.id);
    expect(state.wardrobes[VILLA_FRIDGE_FREEZER.id]).toEqual({ open: false, progress: 0 });
    expect(villaOpenableLabel(VILLA_FRIDGE_FREEZER.id, false, false)).toBe('Open the fridge');
    expect(villaOpenableLabel(VILLA_FRIDGE_FREEZER.id, true, true)).toBe('关闭冰箱');
    expect(villaOpenableLabel(VILLA_MASTER_WARDROBE.id, false, false)).toBe('Open the wardrobe');
    expect(villaOpenableLabel('sofa-living', false, false)).toBeNull();
  });
  it('swings both leaves open, lit inside, and returns them closed', () => {
    const { root, model } = makeFridge(), state = createVillaWardrobes();
    const chill = root.getObjectByName('Kitchen/fridge-door-chill')!, freezer = root.getObjectByName('Kitchen/fridge-door-freeze')!;
    expect(chill.rotation.y).toBe(0); expect(freezer.rotation.y).toBe(0);
    const leaf = chill.children[0] as THREE.Mesh;
    root.updateMatrixWorld(true);
    const closedBox = new THREE.Box3().setFromObject(leaf);
    expect(toggleVillaWardrobe(state, VILLA_FRIDGE_FREEZER.id)).toBe(true);
    expect(advanceVillaWardrobes(state, 2)).toBe(true);
    expect(model.update(state)).toBe(true);
    expect(state.wardrobes[VILLA_FRIDGE_FREEZER.id].progress).toBe(1);
    expect(chill.rotation.y).toBeGreaterThan(1); expect(freezer.rotation.y).toBeGreaterThan(1);
    root.updateMatrixWorld(true);
    const openBox = new THREE.Box3().setFromObject(leaf);
    // The leaf really sweeps out of the carcass rather than only rotating in place.
    expect(openBox.max.z).toBeGreaterThan(closedBox.max.z + .2);
    // Opening must not leave a solid invisible block across the doorway.
    expect(villaCollides({ x: VILLA_FRIDGE_FREEZER.x, y: 0, z: VILLA_FRIDGE_FREEZER.z + .95 }, model.colliders)).toBe(false);
    expect(villaCollides({ x: VILLA_FRIDGE_FREEZER.approach.x, y: 0, z: VILLA_FRIDGE_FREEZER.approach.z }, model.colliders)).toBe(false);
    toggleVillaWardrobe(state, VILLA_FRIDGE_FREEZER.id); advanceVillaWardrobes(state, 2); model.update(state);
    expect(chill.rotation.y).toBeCloseTo(0, 6); expect(freezer.rotation.y).toBeCloseTo(0, 6);
  });
});
