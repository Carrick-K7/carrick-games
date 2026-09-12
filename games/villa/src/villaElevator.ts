import type { VillaCollider, VillaPosition } from './villaWorld.js';

/** Shared shaft, doorway and moving-floor dimensions, in metres.
 * The staircase and the lift swapped places: the shaft now sits inside the
 * north end of the former stairwell, with its doors still facing +Z. */
export const VILLA_ELEVATOR = {
  minX: 3.45, maxX: 5.65, minZ: -7.0, maxZ: -4.6, frontZ: -4.6,
  centerX: 4.55, centerZ: -5.8, doorWidth: 1.3,
  carMinX: 3.57, carMaxX: 5.53, carMinZ: -6.9, carMaxZ: -4.54,
  floors: [0, 3.6, 7.2] as const,
};
export type VillaElevatorPhase = 'closed' | 'opening' | 'open' | 'closing' | 'moving';
export interface VillaElevatorState {
  y: number; floor: number; target: number; phase: VillaElevatorPhase;
  door: number; fromY: number; travel: number; riding: boolean; idleFor: number;
}
export const ELEVATOR_DOOR_SECONDS = 0.8;
export const ELEVATOR_IDLE_SECONDS = 4;
export function createVillaElevator(): VillaElevatorState {
  return { y: 0, floor: 0, target: 0, phase: 'closed', door: 0, fromY: 0, travel: 0, riding: false, idleFor: 0 };
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
  return Math.abs(p.y - state.y) < 0.3 && Math.abs(p.x - VILLA_ELEVATOR.centerX) < VILLA_ELEVATOR.doorWidth / 2 + 0.25
    && Math.abs(p.z - VILLA_ELEVATOR.frontZ) < 0.36;
}
/** No queuing or destination changes during a journey. Same-floor calls open the doors. */
export function requestVillaElevator(state: VillaElevatorState, floor: number, riding = false): boolean {
  if (!Number.isInteger(floor) || floor < 0 || floor > 2) return false;
  if (state.phase === 'closing' && !state.riding && state.target === state.floor && floor === state.floor) {
    state.phase = 'opening'; state.idleFor = 0; return true;
  }
  if (state.phase !== 'closed' && state.phase !== 'open') return false;
  state.target = floor; state.idleFor = 0;
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
    if (state.door === 0) {
      state.phase = state.target === state.floor ? 'closed' : 'moving';
      state.fromY = state.y; state.travel = 0; state.idleFor = 0;
    }
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
/** An empty car closes after a short delay; a person or blocked sill cancels it. */
export function idleVillaElevator(state: VillaElevatorState, dt: number, occupied: boolean, obstructed: boolean): void {
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  if (occupied || obstructed) {
    state.idleFor = 0;
    if (state.phase === 'closing' && !state.riding && state.target === state.floor) state.phase = 'opening';
    return;
  }
  if (state.phase !== 'open') { state.idleFor = 0; return; }
  state.idleFor += dt;
  if (state.idleFor >= ELEVATOR_IDLE_SECONDS) {
    state.target = state.floor; state.phase = 'closing'; state.riding = false; state.idleFor = 0;
  }
}
export function villaElevatorSupportAt(state: VillaElevatorState, x: number, z: number, previousY: number): number | null {
  const e = VILLA_ELEVATOR;
  return Number.isFinite(previousY) && Math.abs(previousY - state.y) <= 0.3
    && x >= e.carMinX && x <= e.carMaxX && z >= e.carMinZ && z <= e.carMaxZ ? state.y : null;
}

/**
 * Car-panel door buttons. Opening a set of doors never changes the destination;
 * closing shuts them early without cancelling the selected floor.
 */
export function requestVillaElevatorDoor(state: VillaElevatorState, open: boolean): boolean {
  if (state.phase === 'moving') return false;
  if (open) {
    state.target = state.floor;
    if (state.phase !== 'opening' && state.phase !== 'open') state.phase = 'opening';
    state.idleFor = 0;
    return true;
  }
  if (state.phase === 'closing' || state.phase === 'closed') return false;
  state.riding = false; state.phase = 'closing'; state.idleFor = 0;
  return true;
}

/** Permanent enclosure plus three mutable safety gates; never expose an empty shaft. */
export function createVillaElevatorColliders(): { colliders: VillaCollider[]; update(state: VillaElevatorState): void } {
  const e = VILLA_ELEVATOR, colliders: VillaCollider[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h };
    colliders.push(c); return c;
  };
  box(e.centerX - 1.04, 0, e.centerZ, 0.12, 10.1, 2.4);
  box(e.centerX + 1.04, 0, e.centerZ, 0.12, 10.1, 2.4);
  box(e.centerX, 0, e.centerZ - 1.14, 2.2, 10.1, 0.12);
  const gates = e.floors.map(y => {
    const height = Math.min(3.6, 10.1 - y);
    box(e.centerX - 0.875, y, e.frontZ, 0.45, height, 0.12);
    box(e.centerX + 0.875, y, e.frontZ, 0.45, height, 0.12);
    box(e.centerX, y + 2.3, e.frontZ, 1.3, height - 2.3, 0.12);
    return box(e.centerX, y, e.frontZ, 1.3, 2.3, 0.12);
  });
  const ceiling = box(e.centerX, 2.3, e.centerZ, 1.96, .18, 2.36);
  const update = (state: VillaElevatorState) => {
    ceiling.minY = state.y + 2.3; ceiling.maxY = state.y + 2.48;
    gates.forEach((gate, floor) => {
    // Passage is possible only after the aligned landing is completely open.
    const open = state.phase === 'open' && state.floor === floor && state.door === 1
      && Math.abs(state.y - e.floors[floor]) < 0.001;
    gate.minY = open ? -10 : e.floors[floor];
    gate.maxY = open ? -9 : e.floors[floor] + 2.3;
    });
  };
  return { colliders, update };
}
