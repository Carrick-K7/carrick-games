import type { VillaCollider, VillaPosition } from './villaWorld.js';

/** Shared shaft, doorway and moving-floor dimensions, in metres. */
export const VILLA_ELEVATOR = {
  minX: -1.1, maxX: 1.1, minZ: -7.5, maxZ: -5.1, frontZ: -5.1,
  centerX: 0, centerZ: -6.3, doorWidth: 1.3,
  carMinX: -0.98, carMaxX: 0.98, carMinZ: -7.4, carMaxZ: -5.04,
  floors: [0, 3.6, 7.2] as const,
};
export type VillaElevatorPhase = 'closed' | 'opening' | 'open' | 'closing' | 'moving';
export interface VillaElevatorState {
  y: number; floor: number; target: number; phase: VillaElevatorPhase;
  door: number; fromY: number; travel: number; riding: boolean;
}
export const ELEVATOR_DOOR_SECONDS = 0.8;
export function createVillaElevator(): VillaElevatorState {
  return { y: 0, floor: 0, target: 0, phase: 'closed', door: 0, fromY: 0, travel: 0, riding: false };
}
export function villaElevatorShaftContains(x: number, z: number): boolean {
  const e = VILLA_ELEVATOR;
  return x >= e.minX && x <= e.maxX && z >= e.minZ && z <= e.maxZ;
}
export function villaElevatorCabinContains(p: VillaPosition, state: VillaElevatorState): boolean {
  const e = VILLA_ELEVATOR;
  return Math.abs(p.y - state.y) < 0.25 && p.x >= e.carMinX && p.x <= e.carMaxX
    && p.z >= e.carMinZ && p.z <= e.carMaxZ;
}
/** A person's full footprint must clear the sill before the doors may close. */
export function villaElevatorDoorwayObstructed(p: VillaPosition, state: VillaElevatorState): boolean {
  return Math.abs(p.y - state.y) < 0.3 && Math.abs(p.x) < VILLA_ELEVATOR.doorWidth / 2 + 0.25
    && Math.abs(p.z - VILLA_ELEVATOR.frontZ) < 0.36;
}
/** No queuing or destination changes during a journey. Same-floor calls open the doors. */
export function requestVillaElevator(state: VillaElevatorState, floor: number, riding = false): boolean {
  if (!Number.isInteger(floor) || floor < 0 || floor > 2) return false;
  if (state.phase !== 'closed' && state.phase !== 'open') return false;
  state.target = floor;
  if (floor === state.floor) {
    if (state.phase === 'closed') state.phase = 'opening';
    return true;
  }
  state.riding = riding; state.phase = 'closing';
  return true;
}
/** Continuous, eased travel; only an aligned car can open a landing door. */
export function advanceVillaElevator(state: VillaElevatorState, dt: number, obstructed = false): void {
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  if (!dt) return;
  if (state.phase === 'closing') {
    if (obstructed) { state.phase = 'opening'; state.target = state.floor; state.riding = false; return; }
    state.door = Math.max(0, state.door - dt / ELEVATOR_DOOR_SECONDS);
    if (state.door === 0) { state.phase = 'moving'; state.fromY = state.y; state.travel = 0; }
  } else if (state.phase === 'moving') {
    const targetY = VILLA_ELEVATOR.floors[state.target];
    const duration = Math.abs(targetY - state.fromY) / 1.2 + 0.8;
    state.travel += dt;
    const t = Math.min(1, state.travel / duration);
    state.y = state.fromY + (targetY - state.fromY) * t * t * (3 - 2 * t);
    if (t === 1) { state.y = targetY; state.floor = state.target; state.phase = 'opening'; }
  } else if (state.phase === 'opening') {
    state.door = Math.min(1, state.door + dt / ELEVATOR_DOOR_SECONDS);
    if (state.door === 1) { state.phase = 'open'; state.riding = false; }
  }
}
export function villaElevatorSupportAt(state: VillaElevatorState, x: number, z: number, previousY: number): number | null {
  const e = VILLA_ELEVATOR;
  return Number.isFinite(previousY) && Math.abs(previousY - state.y) <= 0.3
    && x >= e.carMinX && x <= e.carMaxX && z >= e.carMinZ && z <= e.carMaxZ ? state.y : null;
}

/** Permanent enclosure plus three mutable safety gates; never expose an empty shaft. */
export function createVillaElevatorColliders(): { colliders: VillaCollider[]; update(state: VillaElevatorState): void } {
  const e = VILLA_ELEVATOR, colliders: VillaCollider[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h };
    colliders.push(c); return c;
  };
  box(-1.04, 0, e.centerZ, 0.12, 10.1, 2.4);
  box(1.04, 0, e.centerZ, 0.12, 10.1, 2.4);
  box(0, 0, -7.44, 2.2, 10.1, 0.12);
  const gates = e.floors.map(y => {
    const height = Math.min(3.6, 10.1 - y);
    box(-0.875, y, e.frontZ, 0.45, height, 0.12);
    box(0.875, y, e.frontZ, 0.45, height, 0.12);
    box(0, y + 2.3, e.frontZ, 1.3, height - 2.3, 0.12);
    return box(0, y, e.frontZ, 1.3, 2.3, 0.12);
  });
  const update = (state: VillaElevatorState) => gates.forEach((gate, floor) => {
    // Keep the complete opening blocked during motion/partial opening. The doors
    // remain open indefinitely on arrival, so there is no closing deadline to race.
    const open = state.phase === 'open' && state.floor === floor && state.door === 1
      && Math.abs(state.y - e.floors[floor]) < 0.001;
    gate.minY = open ? -10 : e.floors[floor];
    gate.maxY = open ? -9 : e.floors[floor] + 2.3;
  });
  return { colliders, update };
}
