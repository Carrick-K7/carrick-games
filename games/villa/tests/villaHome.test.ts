import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaHome, clampVillaLookSensitivity, createVillaHome, cycleVillaTimeOfDay,
  setVillaAllLights, setVillaLookSensitivity, setVillaRoomLight, setVillaTimeOfDay, setVillaWeather,
  villaAtmosphere, VILLA_HOME_LIGHTS, VILLA_LOOK_SENSITIVITY, VILLA_SECURITY_CAMERAS,
  type VillaHomeState,
} from '../src/villaHome.js';
import { VILLA_HEADHOUSE, createVillaHomeModel, villaRainFloor } from '../src/villaHomeModel.js';
import { VILLA_ESTATE_BUILDINGS, villaTerrainHeight } from '../src/villaEstateLayout.js';

function advance(state: VillaHomeState, seconds: number, hz = 60) {
  for (let i = 0; i < seconds * hz; i++) advanceVillaHome(state, 1 / hz);
}
function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      geometries.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
    }
  });
  return { geometries, materials, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear(); } };
}

describe('Villa home gradual controls', () => {
  it('creates independent default states and clamps every sensitivity input', () => {
    const first = createVillaHome(), second = createVillaHome();
    expect(first).toEqual(second); expect(first).toMatchObject({ timeOfDay: 'evening', darkness: 0.43, weather: 'clear', rain: 0, revision: 0 });
    first.roomLights.living = false; first.lightLevels.living = 0; expect(second.roomLights.living).toBe(true); expect(second.lightLevels.living).toBe(1);
    for (const input of [undefined, null, NaN, Infinity, -Infinity, '2', {}, []]) expect(clampVillaLookSensitivity(input)).toBe(VILLA_LOOK_SENSITIVITY.default);
    for (const [input, output] of [[-10, 0.25], [0, 0.25], [0.7, 0.7], [2.5, 2.5], [30, 3]]) expect(createVillaHome(input).lookSensitivity).toBe(output);
    setVillaLookSensitivity(second, 100); expect(second.lookSensitivity).toBe(3); expect(second.revision).toBe(1);
    setVillaLookSensitivity(second, 50); expect(second.revision).toBe(1);
  });
  it('changes targets without jumps and reverses smoothly before reaching them', () => {
    const state = createVillaHome(); setVillaTimeOfDay(state, 'night'); setVillaWeather(state, 'rain');
    expect(state.darkness).toBe(0.43); expect(state.rain).toBe(0);
    advance(state, 1); const darkness = state.darkness, rain = state.rain;
    expect(darkness).toBeGreaterThan(0.43); expect(darkness).toBeLessThan(1); expect(rain).toBeGreaterThan(0); expect(rain).toBeLessThan(1);
    setVillaTimeOfDay(state, 'day'); setVillaWeather(state, 'clear'); expect(state.darkness).toBe(darkness); expect(state.rain).toBe(rain);
    advanceVillaHome(state, 1 / 60); expect(state.darkness).toBeLessThan(darkness); expect(state.darkness).toBeGreaterThan(darkness - 0.02);
    expect(state.rain).toBeLessThan(rain); expect(state.rain).toBeGreaterThan(rain - 0.02);
    advance(state, 20); expect(state.darkness).toBe(0); expect(state.rain).toBe(0);
  });
  it('is frame-rate invariant for equal elapsed seconds, including target reversals', () => {
    const states = [30, 60, 120].map(hz => {
      const state = createVillaHome(); setVillaTimeOfDay(state, 'night'); setVillaWeather(state, 'rain'); setVillaRoomLight(state, 'living', false);
      advance(state, 1, hz); setVillaTimeOfDay(state, 'day'); setVillaWeather(state, 'clear'); setVillaRoomLight(state, 'living', true); advance(state, 1, hz); return state;
    });
    for (const other of states.slice(1)) {
      expect(other.darkness).toBeCloseTo(states[0].darkness, 12); expect(other.rain).toBeCloseTo(states[0].rain, 12);
      expect(other.lightLevels.living).toBeCloseTo(states[0].lightLevels.living, 12); expect(other.revision).toBe(states[0].revision);
    }
  });
  it('ignores paused/invalid dt and caps stalls without changing discrete revisions', () => {
    const state = createVillaHome(); setVillaTimeOfDay(state, 'day'); setVillaWeather(state, 'rain'); const before = structuredClone(state);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) advanceVillaHome(state, dt); expect(state).toEqual(before);
    const capped = structuredClone(state); advanceVillaHome(state, 30); advanceVillaHome(capped, 0.25); expect(state).toEqual(capped); expect(state.revision).toBe(before.revision);
    for (let i = 0; i < 300; i++) {
      if (i % 27 === 0) cycleVillaTimeOfDay(state);
      if (i % 19 === 0) setVillaWeather(state, state.weather === 'rain' ? 'clear' : 'rain');
      advanceVillaHome(state, 0.25);
      expect(state.darkness).toBeGreaterThanOrEqual(0); expect(state.darkness).toBeLessThanOrEqual(1); expect(state.rain).toBeGreaterThanOrEqual(0); expect(state.rain).toBeLessThanOrEqual(1);
    }
  });
  it('switches individual rooms and every floor independently without arbitrary object keys', () => {
    const state = createVillaHome(), ids = VILLA_HOME_LIGHTS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length); expect(new Set(VILLA_HOME_LIGHTS.map(l => l.floor))).toEqual(new Set([0, 1, 2]));
    expect(ids).toEqual(expect.arrayContaining(['gallery-0', 'gallery-1', 'gallery-2', 'terrace', 'garden', 'garage']));
    for (const bad of ['missing', '__proto__', 'constructor', 'toString']) expect(setVillaRoomLight(state, bad, false)).toBe(false);
    expect(setVillaRoomLight(state, 'living', false)).toBe(true); expect(setVillaRoomLight(state, 'living', false)).toBe(false);
    advance(state, 2); expect(state.lightLevels.living).toBe(0); expect(ids.filter(id => id !== 'living').every(id => state.lightLevels[id] === 1)).toBe(true);
    setVillaAllLights(state, false); advance(state, 2); expect(Object.values(state.lightLevels).every(v => v === 0)).toBe(true);
    setVillaAllLights(state, true); advance(state, 2); expect(Object.values(state.lightLevels).every(v => v === 1)).toBe(true);
  });
  it('keeps night ambient readable while strongly reducing daylight and increasing lamp contrast', () => {
    const day = villaAtmosphere({ darkness: 0, rain: 0 }), night = villaAtmosphere({ darkness: 1, rain: 0 }), rainy = villaAtmosphere({ darkness: 1, rain: 1 });
    expect(night.sun).toBeLessThan(day.sun * 0.2); expect(night.hemisphere).toBeGreaterThan(0.4); expect(night.ambient).toBeGreaterThan(0.3);
    expect(night.exposure).toBeGreaterThanOrEqual(day.exposure); expect(night.lampStrength).toBeGreaterThan(day.lampStrength * 5);
    expect(rainy.sun).toBeLessThan(night.sun); expect(rainy.fogFar).toBeLessThan(night.fogFar); expect(rainy.fogFar).toBeGreaterThan(rainy.fogNear + 40);
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) expect(Object.values(villaAtmosphere({ darkness: i / 10, rain: j / 10 })).every(Number.isFinite)).toBe(true);
  });
});

describe('Villa home scene resources and rain protection', () => {
  it('keeps rain above house, extended garage and the stair headhouse, and follows outdoor terrain', () => {
    for (const building of VILLA_ESTATE_BUILDINGS) for (const x of [building.minX, (building.minX + building.maxX) / 2, building.maxX]) for (const z of [building.minZ, (building.minZ + building.maxZ) / 2, building.maxZ]) {
      expect(villaRainFloor(x, z)).toBeGreaterThanOrEqual(building.id === 'garage' ? 3.63 : 7.24);
    }
    expect(villaRainFloor(1.06, -3)).toBeGreaterThanOrEqual(10.73);
    // The pavilion moved west with the stairwell: the old bay is now open roof.
    expect(villaRainFloor(4.2, -3)).toBe(7.24);
    for (const [x, z] of [[-20, 25], [25, 110], [40, 152]]) expect(villaRainFloor(x, z)).toBe(villaTerrainHeight(x, z));
  });
  it('reuses exactly six nonshadowing light slots and honors switches across all floors and security views', () => {
    const scene = new THREE.Group(), model = createVillaHomeModel(scene), state = createVillaHome();
    const slots: THREE.PointLight[] = []; scene.traverse(n => { if (n instanceof THREE.PointLight) slots.push(n); }); expect(slots).toHaveLength(6);
    expect(slots.every(l => !l.castShadow)).toBe(true);
    for (const room of VILLA_HOME_LIGHTS) { expect(model.glow(room.id)).toBe(model.glow(room.id)); expect(model.glow(room.id).name).toBe(`villa-lamp/${room.id}`); }
    const before = resources(scene), ids = slots.map(l => l.uuid); state.darkness = 1;
    for (const camera of VILLA_SECURITY_CAMERAS) {
      model.update(2, state, camera.position); const current: THREE.PointLight[] = []; scene.traverse(n => { if (n instanceof THREE.PointLight) current.push(n); });
      expect(current.map(l => l.uuid)).toEqual(ids); expect(current.every(l => Number.isFinite(l.intensity) && l.intensity >= 0)).toBe(true);
    }
    setVillaAllLights(state, false); advance(state, 2); model.update(3, state, { x: 0, y: 1.6, z: 5 });
    expect(slots.every(l => l.intensity === 0)).toBe(true); expect(VILLA_HOME_LIGHTS.every(r => model.glow(r.id).emissiveIntensity === 0)).toBe(true);
    setVillaRoomLight(state, 'master', true); advance(state, 2); model.update(4, state, { x: -7, y: 5.2, z: 4 });
    expect(slots.some(l => l.intensity > 0 && l.userData.room === 'master')).toBe(true); expect(slots.every(l => l.intensity === 0 || l.userData.room === 'master')).toBe(true);
    expect(resources(scene).geometries).toEqual(before.geometries); expect(resources(scene).materials).toEqual(before.materials); before.dispose();
  });
  it('uses a bounded reusable rain buffer with all visible streaks above real roofs and ground', () => {
    const scene = new THREE.Group(), model = createVillaHomeModel(scene), state = createVillaHome(); state.rain = 1; state.darkness = 1;
    const rain = scene.getObjectByName('villa-rain-streaks') as THREE.LineSegments, position = rain.geometry.getAttribute('position'); expect(position.count).toBe(960);
    for (const [time, view] of [[0, { x: 0, y: 1.6, z: 0 }], [1.37, { x: 28, y: 1.6, z: -4 }], [7.91, { x: 14, y: 3, z: 127 }]] as const) {
      model.update(time, state, view); expect(rain.visible).toBe(true); expect(rain.geometry.getAttribute('position')).toBe(position);
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        expect(Number.isFinite(x + y + z)).toBe(true); expect(y).toBeGreaterThanOrEqual(villaTerrainHeight(x, z) - 0.01);
        for (const building of VILLA_ESTATE_BUILDINGS) if (x >= building.minX && x <= building.maxX && z >= building.minZ && z <= building.maxZ) expect(y).toBeGreaterThanOrEqual(building.id === 'garage' ? 3.63 : 7.24);
        if (x >= VILLA_HEADHOUSE.minX && x <= VILLA_HEADHOUSE.maxX && z >= VILLA_HEADHOUSE.minZ && z <= VILLA_HEADHOUSE.maxZ) expect(y).toBeGreaterThanOrEqual(VILLA_HEADHOUSE.roofTop);
      }
      const snapshot = Array.from(position.array); model.update(time, state, view); expect(Array.from(position.array)).toEqual(snapshot);
    }
    state.rain = 0; model.update(8, state, { x: 0, y: 1.6, z: 0 }); expect(rain.visible).toBe(false);
    const owned = resources(scene); let geometriesDisposed = 0, materialsDisposed = 0;
    owned.geometries.forEach(g => g.addEventListener('dispose', () => geometriesDisposed++)); owned.materials.forEach(m => m.addEventListener('dispose', () => materialsDisposed++)); owned.dispose();
    expect(geometriesDisposed).toBe(owned.geometries.size); expect(materialsDisposed).toBe(owned.materials.size); expect(scene.children).toHaveLength(0);
  });
});
