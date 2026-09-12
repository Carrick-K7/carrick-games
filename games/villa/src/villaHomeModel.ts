import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_HOME_LIGHTS, villaAtmosphere, type VillaHomeState } from './villaHome.js';
import { VILLA_EAST_WALL as EAST, VILLA_ESTATE_BUILDINGS, villaTerrainHeight } from './villaEstateLayout.js';
import type { VillaPosition } from './villaWorld.js';

export interface VillaHomeModel {
  glow(room: string): THREE.MeshStandardMaterial;
  update(time: number, state: VillaHomeState, view: VillaPosition): void;
  setView(state: VillaHomeState, view: VillaPosition): void;
}
/** The stair pavilion moved west with the stairwell; rain must clear its roof. */
export const VILLA_HEADHOUSE = { minX: -1.25, maxX: 3.37, minZ: -7.6, maxZ: 1.5, roofTop: 10.73 } as const;
/** Rain starts above roofs instead of leaking into the occupied living spaces. */
export function villaRainFloor(x: number, z: number): number {
  let floor = villaTerrainHeight(x, z);
  for (const building of VILLA_ESTATE_BUILDINGS) {
    if (x < building.minX - .3 || x > building.maxX + .3 || z < building.minZ - .3 || z > building.maxZ + .3) continue;
    floor = Math.max(floor, building.id === 'garage' ? 3.63 : 7.24);
  }
  const head = VILLA_HEADHOUSE;
  if (x >= head.minX && x <= head.maxX && z >= head.minZ && z <= head.maxZ) floor = Math.max(floor, head.roofTop);
  return floor;
}
/** Logical per-room lamps share six unshadowed light slots, not dozens of expensive lights. */
export function createVillaHomeModel(parent: THREE.Object3D): VillaHomeModel {
  const root = new THREE.Group(); root.name = 'villa-smart-home'; parent.add(root);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const glow = (room: string) => {
    let material = materials.get(room);
    if (!material) {
      material = villaMaterial('#e9e2cc', .65);
      material.name = `villa-lamp/${room}`; material.emissive.set('#ffd397');
      materials.set(room, material);
    }
    return material;
  };
  const b = new VillaModelBuilder(root, 'villa-room-light-fixtures');
  const metal = villaMaterial('#504b44', .64, .3), pale = villaMaterial('#d8d3c4', .78);
  for (const room of VILLA_HOME_LIGHTS) for (const [index, p] of room.fixtures.entries()) {
    const light = glow(room.id), marker = new THREE.Object3D();
    marker.name = `home-light/${room.id}/${index}`; marker.position.set(p.x, p.y, p.z);
    marker.userData = { room: room.id, floor: room.floor }; root.add(marker);
    if (room.id === 'garden') {
      b.box(p.x, .6, p.z, .1, 1.2, .1, metal, .01);
      b.box(p.x, 1.17, p.z, .15, .08, .15, light, .012);
    } else if (room.id !== 'terrace') {
      const ceiling = room.id === 'gallery-2' ? 10.48 : room.id === 'garage' ? 3.38 : room.floor * 3.6 + 3.39;
      b.beam([p.x, p.y + .03, p.z], [p.x, ceiling, p.z], .007, metal, 6);
      const width = room.id === 'garage' ? 2.45 : room.id === 'snooker' ? 1.9 : room.id.startsWith('gallery') ? .44 : .85;
      b.box(p.x, p.y + .026, p.z, width + .08, .055, .24, metal, .02);
      b.box(p.x, p.y - .012, p.z, width, .02, .18, light, .006);
      b.box(p.x, ceiling - .012, p.z, .2, .035, .12, pale, .01);
    }
  }
  for (const floor of [0, 1]) {
    b.box(-1.7, floor * 3.6 + 3.27, 0, .028, .025, 17.35, glow(`gallery-${floor}`), .006);
  }
  const roof = glow('terrace');
  // Both an inward rail strip and an outward fascia strip remain visible at night.
  for (const z of [-8.85, 8.85]) b.box(0, 7.3, z, 23.5, .035, .035, roof, .006);
  for (const x of [-11.75, 11.75]) b.box(x, 7.3, 0, .035, .035, 17.7, roof, .006);
  // A continuous recessed diffuser on the OUTER fascia, not a subpixel wire
  // above the eave: still visibly lit from the driveway at software render scale.
  // The storeys widen east to x=16 in 1.1.0, so the roof band follows them.
  // Each box is centred on its outer edge, so the band covers the full side and
  // the east/west strips corner exactly with the north/south ones.
  for (const z of [-9.455, 9.455]) for (const x of [-11.176, 10.177]) {
    // 2 mm overlap at the seam keeps the run continuous at the villa centreline.
    b.box(x, 7.045, z, 11.355, .085, .035, roof, .008);
  }
  for (const x of [-12.455, EAST.outer + .255]) b.box(x, 7.045, 0, .035, .085, 18.945, roof, .008);
  b.finish();
  const fixtures = VILLA_HOME_LIGHTS.flatMap(room => room.fixtures.map(position => ({ room, position })));
  const pool = Array.from({ length: 6 }, (_, i) => {
    const light = new THREE.PointLight('#ffd5a2', 0, 14, 2);
    light.name = `villa-home-light-slot-${i}`; light.castShadow = false; root.add(light); return light;
  });
  const setView = (state: VillaHomeState, view: VillaPosition) => {
    const atmosphere = villaAtmosphere(state);
    const indoors = view.x >= -12.3 && view.x <= 12.3 && view.z >= -9.4 && view.z <= 11.6;
    const relativeY = indoors ? view.y : view.y - villaTerrainHeight(view.x, view.z);
    const candidates = fixtures.map(fixture => {
      const { position, room } = fixture;
      const level = state.lightLevels[room.id] ?? 0;
      const floorBlend = Math.max(0, 1 - Math.abs(relativeY - (room.floor * 3.6 + 1.6)) / 3.6) ** 2;
      const distance = Math.hypot(position.x - view.x, position.y - view.y, position.z - view.z);
      return { fixture, gain: level * floorBlend, distance };
    }).filter(candidate => candidate.gain > .004 && candidate.distance < 23)
      .sort((a, c) => (a.distance + (1 - a.gain) * 9) - (c.distance + (1 - c.gain) * 9));
    pool.forEach((light, index) => {
      const candidate = candidates[index];
      if (!candidate) { light.intensity = 0; return; }
      const { fixture: { position, room }, gain } = candidate;
      light.position.set(position.x, position.y - .06, position.z);
      light.intensity = (room.id === 'garden' ? 4 : 15) * atmosphere.lampStrength * gain;
      light.distance = room.id === 'garage' ? 17 : room.id === 'garden' ? 6 : 14;
      light.userData.room = room.id;
    });
  };
  const count = 480, rainGeometry = new THREE.BufferGeometry(), points = new Float32Array(count * 6);
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMaterial = new THREE.LineBasicMaterial({ color: '#b4d0e0', transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.name = 'villa-rain-streaks'; rain.frustumCulled = false; rain.userData = { count, outdoorOnly: true }; root.add(rain);
  const wrap = (n: number, width: number) => ((n % width) + width) % width;
  const update = (time: number, state: VillaHomeState, view: VillaPosition) => {
    const atmosphere = villaAtmosphere(state);
    for (const [room, material] of materials) material.emissiveIntensity = (state.lightLevels[room] ?? 0) * atmosphere.lampStrength * (room === 'terrace' ? 3.5 : 1.8);
    setView(state, view);
    rain.visible = state.rain > .001; rainMaterial.opacity = state.rain * (.35 + atmosphere.night * .1);
    if (!rain.visible) return;
    for (let i = 0; i < count; i++) {
      const x = view.x + wrap(i * 13.731 - view.x + 28, 56) - 28;
      const z = view.z + wrap(i * 23.173 - view.z + 28, 56) - 28;
      const floor = villaRainFloor(x, z) + .03;
      const y = floor + 16 - wrap(time * (9 + i % 5) + i * .731, 16), length = .25 + (i % 7) * .045;
      const offset = i * 6;
      points[offset] = x; points[offset + 1] = y; points[offset + 2] = z;
      points[offset + 3] = x + .055; points[offset + 4] = Math.max(floor, y - length); points[offset + 5] = z + .025;
    }
    rainGeometry.getAttribute('position').needsUpdate = true;
  };
  root.userData = { roomCount: VILLA_HOME_LIGHTS.length, physicalLightBudget: pool.length, weather: true };
  return { glow, update, setView };
}
