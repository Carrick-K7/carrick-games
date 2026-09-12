import { villaCollides, villaSupportAt, type VillaCollider, type VillaPosition } from './villaWorld.js';
import type { VillaRelaxSeat } from './villaSeating.js';

export const VILLA_SWING = { x: -20.1, y: 0, z: 24.4, chainLength: 1.84, pivotHeight: 2.35 } as const;
export const VILLA_CAMPING_HOME = { x: -18.7, y: 0, z: 27, yaw: Math.PI * .08 } as const;
export interface VillaCampingChair extends VillaPosition { yaw: number; carried: boolean }
export interface VillaOutdoorState { camping: VillaCampingChair; swingPhase: number; swingAmplitude: number; swingAngle: number }
export function createVillaOutdoor(): VillaOutdoorState {
  return { camping: { ...VILLA_CAMPING_HOME, carried: false }, swingPhase: 0, swingAmplitude: 0, swingAngle: 0 };
}
export function advanceVillaOutdoor(state: VillaOutdoorState, dt: number, sittingOnSwing: boolean): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .25);
  state.swingAmplitude += ((sittingOnSwing ? .22 : 0) - state.swingAmplitude) * (1 - Math.exp(-dt * 1.6));
  if (state.swingAmplitude < .0001) { state.swingAmplitude = 0; state.swingAngle = 0; return; }
  state.swingPhase = (state.swingPhase + dt * 1.42) % (Math.PI * 2);
  state.swingAngle = Math.sin(state.swingPhase) * state.swingAmplitude;
}
const pointAt = (p: VillaPosition & { yaw: number }, x: number, z: number): VillaPosition => ({
  x: p.x + x * Math.cos(p.yaw) + z * Math.sin(p.yaw), y: p.y,
  z: p.z - x * Math.sin(p.yaw) + z * Math.cos(p.yaw),
});
export function villaSwingSeat(state: VillaOutdoorState): VillaRelaxSeat {
  const s = VILLA_SWING, dz = -s.chainLength * Math.sin(state.swingAngle), rise = s.chainLength * (1 - Math.cos(state.swingAngle));
  return { id: 'swing', kind: 'chair', seat: { x: s.x, y: s.y + rise, z: s.z + dz },
    approach: { x: s.x, y: s.y, z: s.z - 1.4 }, exits: [{ x: s.x - 2.05, y: s.y, z: s.z }, { x: s.x + 2.05, y: s.y, z: s.z }, { x: s.x, y: s.y, z: s.z - 1.5 }],
    yaw: 0, pitch: -.05, eyeHeight: 1.16, origin: { x: s.x, y: s.y, z: s.z }, width: 1.46, depth: .78, freeLook: true };
}
export function villaCampingSeat(state: VillaOutdoorState): VillaRelaxSeat {
  const p = state.camping;
  return { id: 'camping-chair', kind: 'chair', seat: { x: p.x, y: p.y, z: p.z + 0 },
    approach: pointAt(p, 0, -1.1), exits: [pointAt(p, 0, -1.1), pointAt(p, 1.05, 0), pointAt(p, -1.05, 0)],
    yaw: p.yaw, pitch: -.05, eyeHeight: 1.1, origin: { x: p.x, y: p.y, z: p.z }, width: .94, depth: .86, freeLook: true };
}
export function villaOutdoorSeat(state: VillaOutdoorState, id: string | null | undefined): VillaRelaxSeat | null {
  return id === 'swing' ? villaSwingSeat(state) : id === 'camping-chair' && !state.camping.carried ? villaCampingSeat(state) : null;
}
const campingColliders = new WeakSet<VillaCollider>();
export function registerVillaCampingCollider(collider: VillaCollider): void { campingColliders.add(collider); }
export function isVillaCampingCollider(collider: VillaCollider): boolean { return campingColliders.has(collider); }
/** The held object is only a preview; its last safe placed position is retained. */
export function villaCampingCarryPose(visitor: VillaPosition, yaw: number): VillaPosition & { yaw: number } {
  return { x: visitor.x - Math.sin(yaw) * .8, y: visitor.y + .6, z: visitor.z - Math.cos(yaw) * .8, yaw };
}
export function villaCampingPlacement(visitor: VillaPosition, yaw: number, colliders: readonly VillaCollider[]): (VillaPosition & { yaw: number }) | null {
  if (![visitor.x, visitor.y, visitor.z, yaw].every(Number.isFinite)) return null;
  const proposed = { x: visitor.x - Math.sin(yaw) * 1.25, y: visitor.y, z: visitor.z - Math.cos(yaw) * 1.25, yaw };
  const floor = villaSupportAt(proposed.x, proposed.z, visitor.y);
  if (floor == null) return null;
  proposed.y = floor;
  const obstacles = colliders.filter(collider => !isVillaCampingCollider(collider));
  for (const x of [-.4, 0, .4]) for (const z of [-.4, 0, .4]) {
    const p = pointAt(proposed, x, z), support = villaSupportAt(p.x, p.z, floor, 1.12);
    if (support == null || Math.abs(support - floor) > .07 || villaCollides({ ...p, y: support }, obstacles, 1.1)) return null;
  }
  // Preserve a clear reach/standing corridor to the newly placed chair.
  for (let step = 1; step <= 5; step++) {
    const p = { x: visitor.x + (proposed.x - visitor.x) * step / 6, y: visitor.y, z: visitor.z + (proposed.z - visitor.z) * step / 6 };
    const support = villaSupportAt(p.x, p.z, p.y);
    if (support == null || villaCollides({ ...p, y: support }, obstacles, 1.65)) return null;
  }
  return proposed;
}
export function pickUpVillaCampingChair(state: VillaOutdoorState, visitor: VillaPosition): boolean {
  if (![visitor.x, visitor.y, visitor.z].every(Number.isFinite) || state.camping.carried || Math.abs(visitor.y - state.camping.y) > .35 || Math.hypot(visitor.x - state.camping.x, visitor.z - state.camping.z) > 1.8) return false;
  state.camping.carried = true; return true;
}
export function placeVillaCampingChair(state: VillaOutdoorState, visitor: VillaPosition, yaw: number, colliders: readonly VillaCollider[]): boolean {
  if (!state.camping.carried) return false;
  const pose = villaCampingPlacement(visitor, yaw, colliders);
  if (!pose) return false;
  Object.assign(state.camping, pose, { carried: false }); return true;
}
