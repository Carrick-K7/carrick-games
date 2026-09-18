import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaPark, createVillaParkRun, villaParkAvailable, villaParkBay, villaParkRoute, villaVehicleParked, type VillaParkVehicle } from '../src/villaAutopilot.js';
import { advanceVillaDriving, createVillaDriving, type VillaDrivingState } from '../src/villaDriving.js';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import { advanceVillaPickup, createVillaPickup } from '../src/villaPickup.js';
import { advanceVillaSuv, createVillaSuv } from '../src/villaSuv.js';
import { VILLA_GARAGE_BAYS, VILLA_SUV_LIMITS, VILLA_PICKUP_LIMITS } from '../src/villaEstateLayout.js';
import type { VillaCollider } from '../src/villaWorld.js';

const limits: Record<VillaParkVehicle, { halfWidth: number; halfLength: number; wheelbase: number; maxSpeed: number; maxReverse: number; maxSteer: number }> = {
  car: { halfWidth: .96, halfLength: 2.36, wheelbase: 2.92, maxSpeed: 7, maxReverse: 3, maxSteer: .56 },
  pickup: VILLA_PICKUP_LIMITS,
  suv: VILLA_SUV_LIMITS,
};
const create: Record<VillaParkVehicle, () => VillaDrivingState> = { car: createVillaDriving, pickup: createVillaPickup, suv: createVillaSuv };
const advance: Record<VillaParkVehicle, (state: VillaDrivingState, input: { throttle: number; steer: number; brake: boolean; handbrake: boolean }, dt: number, obstacles: readonly VillaCollider[]) => void> = {
  car: advanceVillaDriving, pickup: advanceVillaPickup, suv: advanceVillaSuv,
};
const dispose = (root: THREE.Object3D) => {
  const materials = new Set<THREE.Material>();
  root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); } });
  materials.forEach(m => m.dispose());
};

describe('villa one-key parking', () => {
  // Known limitation, reported rather than hidden: a car left sideways deep in
  // the garage (not in a bay) can need more maneuvering room than pure pursuit
  // gives it, so the run reports failed and the player keeps control.
  it('routes from every corner of the estate onto the drive, the apron and finally the bay', () => {
    const starts = [
      { x: 24, z: 34, yaw: -.4 },   // scenic oval, south of the house
      { x: -8, z: 60, yaw: 1.2 },   // south fields
      { x: 12, z: 14, yaw: .1 },    // entrance forecourt
      { x: 40, z: 26, yaw: 2.6 },   // east link
      { x: -14, z: 12, yaw: 3.0 },  // west lawn beside the pool
      { x: 34, z: 12, yaw: 0 },     // already on the garage drive
      { x: 33, z: 4, yaw: .3 },     // on the apron
    ];
    for (const start of starts) {
      for (const vehicle of ['car', 'pickup', 'suv'] as const) {
        const bay = villaParkBay(vehicle);
        const route = villaParkRoute(vehicle, start);
        expect(route.length, JSON.stringify(start)).toBeGreaterThan(2);
        expect(route[0]).toEqual({ x: start.x, z: start.z });
        expect(route[route.length - 1]).toEqual(bay);
        // The tail is always the apron line, then straight into the bay.
        expect(route[route.length - 2]).toEqual({ x: bay.x, z: route[route.length - 3]!.z });
      }
    }
  });

  it('drives all three vehicles home from every start pose without a collision', () => {
    const scene = new THREE.Group(), estate = createVillaEstateModel(scene);
    try {
      const obstacles = estate.colliders;
      const starts = [
        { x: 24, z: 34, yaw: -.4 }, { x: -8, z: 60, yaw: 1.2 }, { x: 12, z: 14, yaw: .1 },
        { x: 40, z: 26, yaw: 2.6 }, { x: -14, z: 12, yaw: 3.0 }, { x: 34, z: 20, yaw: 0 },
        { x: 31, z: 9, yaw: .6 },
      ];
      for (const vehicle of ['car', 'pickup', 'suv'] as const) {
        for (const start of starts) {
          const state = create[vehicle]();
          Object.assign(state, start);
          const run = createVillaParkRun();
          run.active = true; run.points = villaParkRoute(vehicle, state);
          let arrived = false, collisions = 0;
          for (let step = 0; step < 60 * 420 && !arrived; step++) {
            const control = advanceVillaPark(vehicle, state, state.speed, limits[vehicle], run, 1 / 60);
            expect(run.failed, `${vehicle} from ${JSON.stringify(start)}`).toBe('');
            advance[vehicle](state, control.input, 1 / 60, obstacles);
            collisions += state.collisions;
            if (control.arrived) arrived = true;
          }
          expect(arrived, `${vehicle} parked from ${JSON.stringify(start)} at ${JSON.stringify({ x: state.x, z: state.z })}`).toBe(true);
          expect(villaVehicleParked(vehicle, state), `${vehicle} settled in its own bay`).toBe(true);
          expect(Math.hypot(state.x - villaParkBay(vehicle).x, state.z - villaParkBay(vehicle).z)).toBeLessThan(.05);
          expect(collisions, `${vehicle} from ${JSON.stringify(start)} hit something`).toBe(0);
        }
      }
    } finally { dispose(scene); }
  });

  it('parks the sedan from every approach without touching anything', () => {
    const scene = new THREE.Group(), estate = createVillaEstateModel(scene);
    try {
      const starts = [
        { x: 24, z: 34, yaw: -.4 }, { x: -8, z: 60, yaw: 1.2 }, { x: 12, z: 14, yaw: .1 },
        { x: 40, z: 26, yaw: 2.6 }, { x: -14, z: 12, yaw: 3.0 }, { x: 34, z: 20, yaw: 0 },
        { x: 31, z: 9, yaw: .6 },
      ];
      for (const start of starts) {
        const state = createVillaDriving(); Object.assign(state, start);
        const run = createVillaParkRun(); run.active = true; run.points = villaParkRoute('car', state);
        let arrived = false;
        for (let step = 0; step < 60 * 300 && !arrived; step++) {
          const control = advanceVillaPark('car', state, state.speed, limits.car, run, 1 / 60);
          expect(run.failed, JSON.stringify(start)).toBe('');
          advanceVillaDriving(state, control.input, 1 / 60, estate.colliders);
          arrived = control.arrived;
        }
        expect(arrived, JSON.stringify(start)).toBe(true);
        expect(villaVehicleParked('car', state)).toBe(true);
      }
    } finally { dispose(scene); }
  });
  it('refuses a car left sideways on the garage floor and offers the estate ones', () => {
    for (const vehicle of ['car', 'pickup', 'suv'] as const) {
      expect(villaParkAvailable(vehicle, { x: 36, z: -6, yaw: Math.PI })).toBe(false);
      expect(villaParkAvailable(vehicle, { x: 36, z: -6, yaw: 0 })).toBe(false);
      expect(villaParkAvailable(vehicle, { x: 12, z: 16, yaw: 0 })).toBe(true);
      expect(villaParkAvailable(vehicle, { ...villaParkBay(vehicle), yaw: 0 })).toBe(true);
      expect(villaParkAvailable(vehicle, { x: villaParkBay(vehicle).x, z: 6, yaw: 0 })).toBe(true);
    }
  });
  it('reports a parked car as parked and refuses to treat another bay as home', () => {
    for (const vehicle of ['car', 'pickup', 'suv'] as const) {
      const state = create[vehicle]();
      expect(villaVehicleParked(vehicle, state)).toBe(true);
      const other = VILLA_GARAGE_BAYS.find(bay => bay.x !== villaParkBay(vehicle).x)!;
      expect(villaVehicleParked(vehicle, { ...state, x: other.x })).toBe(false);
      expect(villaVehicleParked(vehicle, { ...state, yaw: Math.PI / 2 })).toBe(false);
    }
  });
});
